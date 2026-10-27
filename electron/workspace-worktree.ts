import { lstat, mkdir, realpath, rmdir } from "node:fs/promises"
import path from "node:path"
import {
  executeWorkspaceGit,
  readGitMetadataPointer,
  validateWorkspaceGitRepository,
} from "./workspace-git"

export type WorkspaceWorktreeBinding = {
  profileKey: string
  sourceRepo: string
  commonGitDir: string
  target: string
  gitDir: string
  head: string
  branch: string | null
}

export type WorkspaceWorktreeCreateOptions = {
  ref?: string
  newBranch?: string
  copyChanges?: boolean
}

export async function validateWorkspaceWorktree(
  root: string,
  binding: WorkspaceWorktreeBinding
): Promise<void> {
  if (!(await validateWorkspaceGitRepository(root, binding)))
    throw new Error("Worktree 授权绑定已失效")
}

export async function createWorkspaceWorktree(
  sourceRoot: string,
  target: string,
  profileKey: string,
  sourceBinding?: WorkspaceWorktreeBinding,
  options: WorkspaceWorktreeCreateOptions = {}
): Promise<WorkspaceWorktreeBinding> {
  const source = await realpath(sourceRoot)
  if (!profileKey || !path.isAbsolute(target) || /[\0\r\n]/.test(target))
    throw new Error("Worktree 创建参数无效")
  const parent = path.dirname(target)
  if (
    path.resolve(target) !== target ||
    (await realpath(parent)) !== parent ||
    !(await lstat(parent)).isDirectory()
  )
    throw new Error("Worktree 目标目录必须位于可信真实目录中")
  const gitDir = await validateWorkspaceGitRepository(source, sourceBinding)
  if (!gitDir) throw new Error("源工作区不是 Git 仓库")
  const commonGitDir = sourceBinding?.commonGitDir ?? gitDir
  const ref = options.ref ?? "HEAD"
  if (typeof ref !== "string" || !ref || /[\0\r\n]/.test(ref))
    throw new Error("请选择有效的基础分支")
  if (options.newBranch) {
    const checked = await executeWorkspaceGit(
      source,
      ["check-ref-format", "--branch", options.newBranch],
      4096,
      gitDir
    )
    if (checked.code !== 0 || checked.reason)
      throw new Error("Worktree 分支名称无效")
  }
  const relative = path.relative(commonGitDir, target)
  if (
    !relative ||
    (relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  )
    throw new Error("Worktree 不能创建在 Git 元数据目录内")
  const revision = await executeWorkspaceGit(
    source,
    ["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`],
    1024,
    gitDir
  )
  const head = revision.stdout.trim()
  if (
    revision.code !== 0 ||
    revision.reason ||
    !/^[\da-f]{40}(?:[\da-f]{24})?$/i.test(head)
  )
    throw new Error("源仓库没有可用的 HEAD 提交，无法创建 Worktree")
  if (options.copyChanges) {
    const current = await executeWorkspaceGit(
      source,
      ["rev-parse", "--verify", "HEAD"],
      1024,
      gitDir
    )
    if (current.code !== 0 || current.reason || current.stdout.trim() !== head)
      throw new Error("仅能从当前检出分支复制未提交改动")
  }

  try {
    await mkdir(target)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST")
      throw new Error(`Worktree 目标目录已存在，未修改该目录：${target}`, {
        cause: error,
      })
    throw error
  }
  const reserved = await lstat(target)
  let binding: WorkspaceWorktreeBinding | undefined
  try {
    await validateWorkspaceGitRepository(source, sourceBinding)
    let result: Awaited<ReturnType<typeof executeWorkspaceGit>> | undefined
    let executionError: unknown
    try {
      result = await executeWorkspaceGit(
        source,
        options.newBranch
          ? ["worktree", "add", "-b", options.newBranch, "--", target, head]
          : ["worktree", "add", "--detach", "--", target, head],
        256 * 1024,
        gitDir,
        60000
      )
    } catch (error) {
      executionError = error
    }
    const pointer = await readGitMetadataPointer(
      path.join(target, ".git")
    ).catch((error: unknown) => {
      throw executionError ?? error
    })
    if (!pointer.startsWith("gitdir: "))
      throw new Error("Worktree Git 元数据指针无效")
    binding = {
      profileKey,
      sourceRepo: sourceBinding?.sourceRepo ?? source,
      commonGitDir,
      target,
      gitDir: path.resolve(target, pointer.slice(8)),
      head,
      branch: options.newBranch ?? null,
    }
    await validateWorkspaceWorktree(target, binding)
    if (executionError) throw executionError
    if (!result) throw new Error("Worktree 创建未取得执行结果")
    if (result.code !== 0 || result.reason)
      throw new Error(result.stderr.trim() || "Worktree 创建未完成")
    if (options.copyChanges) {
      const { copyWorkspaceChanges } = await import("./workspace-transfer")
      await copyWorkspaceChanges(source, binding, sourceBinding)
    }
    return binding
  } catch (error) {
    // 仅回收本次保留的目录，路径替换或存在未知内容时保留现场
    const current = await lstat(target).catch(() => null)
    if (
      current?.isDirectory() &&
      current.dev === reserved.dev &&
      current.ino === reserved.ino
    ) {
      if (binding) await removeWorkspaceWorktree(binding).catch(() => {})
      else await rmdir(target).catch(() => {})
    }
    const remains = await lstat(target).then(
      () => true,
      (failure: unknown) => (failure as NodeJS.ErrnoException).code !== "ENOENT"
    )
    if (remains)
      throw new Error(
        `Worktree 创建失败，未能安全清理，已保留目录：${target}`,
        { cause: error }
      )
    throw error
  }
}

export async function removeWorkspaceWorktree(
  binding: WorkspaceWorktreeBinding,
  force = false
): Promise<void> {
  await validateWorkspaceWorktree(binding.target, binding)
  const result = await executeWorkspaceGit(
    binding.sourceRepo,
    ["worktree", "remove", ...(force ? ["--force"] : []), "--", binding.target],
    256 * 1024,
    binding.commonGitDir,
    30000
  )
  if (result.code !== 0 || result.reason)
    throw new Error(result.stderr.trim() || "Worktree 清理未完成，已保留目录")
}
