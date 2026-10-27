import { beginWorkspaceWrite, workspaceWriteActive } from "./workspace-run"
import { shell, type IpcMainInvokeEvent } from "electron"
import { realpath } from "node:fs/promises"
import {
  createExecutionSession,
  workspaceExecutionActive,
  type ExecutionSession,
} from "./execution"
import type { ConversationExecutionProfile } from "./desktop-execution-settings"
import type {
  WorkspaceRequest,
  WorkspaceResponse,
} from "../src/shared/workspace"
import {
  readWorkspaceFile,
  readWorkspaceAsset,
  findWorkspaceFiles,
  workspacePath,
} from "./workspace-files"
import {
  readCheckpoint,
  restoreCheckpoint,
  restoreCheckpoints,
  listCheckpoints,
} from "./workspace-checkpoints"
import {
  readWorkspaceGitDiff,
  readWorkspaceGitStatus,
  checkWorkspaceEngineering,
  stageWorkspaceGitFiles,
  unstageWorkspaceGitFiles,
  commitWorkspaceGit,
  checkoutWorkspaceBranch,
} from "./workspace-git"
import {
  readWorkspaceInputFile,
  writeWorkspaceInputFile,
} from "./workspace-input"
import { validateWorkspaceWorktree } from "./workspace-worktree"

const commands = new Map<string, Promise<ExecutionSession>>()
export async function stopWorkspaceCommands(owner?: number) {
  await Promise.allSettled(
    [...commands.entries()]
      .filter(([id]) => owner === undefined || id.startsWith(owner + ":"))
      .map(async ([, session]) => (await session.catch(() => null))?.stop())
  )
}
export async function workspaceRequest(
  event: IpcMainInvokeEvent,
  request: WorkspaceRequest,
  config: ConversationExecutionProfile,
  runtimeDirectory: string,
  checkpointDirectory: string
): Promise<WorkspaceResponse> {
  if (config.backend !== "local") throw new Error("此操作需要本机工作区")
  const root = await realpath(config.workspaceDir)
  if (request.action === "write-input-file" && config.worktree)
    await validateWorkspaceWorktree(root, config.worktree)
  if (request.action === "write-input-file") {
    if (
      !/^inbound\/[a-f0-9]{64}-[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(
        request.path
      ) ||
      !request.path.startsWith(`inbound/${request.sha256}-`)
    )
      throw new Error("附件导入路径无效")
    const release = beginWorkspaceWrite(root)
    try {
      const existing = await readWorkspaceInputFile(root, request.path).catch(
        (error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return null
          throw error
        }
      )
      if (existing && existing.sha256 !== request.sha256)
        throw new Error("附件路径已有不同内容")
      return await writeWorkspaceInputFile(
        root,
        request.path,
        request.data,
        request.sha256,
        existing?.sha256 ?? null
      )
    } finally {
      release()
    }
  }
  if (
    (request.action === "restore" || request.action === "restore-batch") &&
    (workspaceExecutionActive(root) || workspaceWriteActive(root))
  )
    throw new Error("工作区仍有执行任务，请停止后再恢复")
  if (request.action === "list-checkpoints")
    return {
      checkpointSummaries: await listCheckpoints(checkpointDirectory, root),
    }
  if (request.action === "engineering-check")
    return checkWorkspaceEngineering(root, config.worktree)
  if (request.action === "open-root") {
    const error = await shell.openPath(root)
    if (error) throw new Error(error)
    return null
  }
  if (request.action === "read") return readWorkspaceFile(root, request.path)
  if (request.action === "read-asset")
    return readWorkspaceAsset(root, request.path)
  if (request.action === "find-file")
    return findWorkspaceFiles(root, request.path)
  if (request.action === "open" || request.action === "reveal") {
    const target = await workspacePath(root, request.path)
    if (request.action === "reveal") shell.showItemInFolder(target)
    else {
      const error = await shell.openPath(target)
      if (error) throw new Error(error)
    }
    return null
  }
  if (request.action === "checkpoint")
    return readCheckpoint(checkpointDirectory, root, request.checkpointId)
  if (request.action === "restore")
    return restoreCheckpoint(checkpointDirectory, root, request.checkpointId)
  if (request.action === "restore-batch")
    return {
      checkpoints: await restoreCheckpoints(
        checkpointDirectory,
        root,
        request.checkpointIds
      ),
    }
  if (request.action === "git-status")
    return readWorkspaceGitStatus(root, config.worktree, true)
  if (request.action === "checkout-branch")
    return checkoutWorkspaceBranch(
      root,
      request.branch,
      request.create === true,
      config.worktree
    )
  if (request.action === "git-diff")
    return readWorkspaceGitDiff(
      root,
      request.path,
      config.worktree,
      request.scope
    )
  if (request.action === "git-stage")
    return stageWorkspaceGitFiles(root, request.paths, config.worktree)
  if (request.action === "git-unstage")
    return unstageWorkspaceGitFiles(root, request.paths, config.worktree)
  if (request.action === "git-commit")
    return commitWorkspaceGit(root, request.message, config.worktree)
  if (request.action !== "run" && request.action !== "cancel")
    throw new Error("工作区操作无效")
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(request.requestId))
    throw new Error("终端请求无效")
  const key = `${event.sender.id}:${request.conversationId}:${request.requestId}`
  if (request.action === "cancel") {
    await (await commands.get(key))?.stop()
    return null
  }
  if (commands.has(key) || commands.size >= 4)
    throw new Error("终端任务已运行或达到上限")
  if (
    typeof request.command !== "string" ||
    !request.command.trim() ||
    request.command.length > 65536
  )
    throw new Error("命令无效")
  const preparing = createExecutionSession({
    backend: "local",
    workspaceDir: root,
    permissionMode: "default",
    runtimeDirectory,
    checkpointDirectory,
    worktree: config.worktree,
  })
  commands.set(key, preparing)
  try {
    const session = await preparing
    try {
      return {
        output: String(
          await session.handle("run_bash", {
            command: request.command,
            timeout_ms: 120000,
          })
        ),
      }
    } finally {
      await session.stop()
    }
  } finally {
    commands.delete(key)
  }
}
