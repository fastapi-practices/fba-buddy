import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  executeWorkspaceGit,
  validateWorkspaceGitRepository,
} from "./workspace-git"
import type { WorkspaceWorktreeBinding } from "./workspace-worktree"

const MAX_TRANSFER_BYTES = 16 * 1024 * 1024

export async function workspaceGitCommand(
  root: string,
  args: string[],
  binding?: WorkspaceWorktreeBinding
) {
  const gitDir = await validateWorkspaceGitRepository(root, binding)
  if (!gitDir) throw new Error("当前工作区不是 Git 仓库")
  const result = await executeWorkspaceGit(
    root,
    args,
    MAX_TRANSFER_BYTES,
    gitDir,
    60000
  )
  if (result.code !== 0 || result.reason)
    throw new Error(result.stderr.trim() || "Git 工作区操作失败")
  return result.stdout
}

export async function readWorkspaceBranches(
  root: string,
  binding?: WorkspaceWorktreeBinding
) {
  const gitDir = await validateWorkspaceGitRepository(root, binding).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null
      throw error
    }
  )
  if (!gitDir) return { repository: false, branch: null, branches: [] }
  const current = await executeWorkspaceGit(
    root,
    ["symbolic-ref", "--quiet", "--short", "HEAD"],
    4096,
    gitDir
  )
  if (current.reason || (current.code !== 0 && current.code !== 1))
    throw new Error("当前分支读取失败")
  const listed = await executeWorkspaceGit(
    root,
    ["for-each-ref", "--format=%(refname:lstrip=2)", "refs/heads"],
    1024 * 1024,
    gitDir
  )
  if (listed.code !== 0 || listed.reason) throw new Error("分支列表读取失败")
  return {
    repository: true,
    branch: current.code === 0 ? current.stdout.trim() : null,
    branches: listed.stdout.split("\n").filter(Boolean),
  }
}

function transferPaths(output: string) {
  const paths = output.split("\0").filter(Boolean)
  if (
    paths.some(
      (value) =>
        path.isAbsolute(value) ||
        /[\0\r\n]/.test(value) ||
        value.split(/[\\/]/).some((part) => part === ".." || part === ".git")
    )
  )
    throw new Error("工作区包含无效的转移路径")
  return paths
}

export async function copyWorkspaceChanges(
  source: string,
  target: WorkspaceWorktreeBinding,
  sourceBinding?: WorkspaceWorktreeBinding
) {
  const patch = await workspaceGitCommand(
    source,
    [
      "diff",
      "--binary",
      "--full-index",
      "--no-ext-diff",
      "--no-textconv",
      "HEAD",
      "--",
    ],
    sourceBinding
  )
  const untracked = transferPaths(
    await workspaceGitCommand(
      source,
      ["ls-files", "--others", "--exclude-standard", "-z"],
      sourceBinding
    )
  )
  const include = await lstat(path.join(source, ".worktreeinclude")).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null
      throw error
    }
  )
  if (include && !include.isFile())
    throw new Error(".worktreeinclude 必须是普通文件")
  const included = include
    ? transferPaths(
        await workspaceGitCommand(
          source,
          [
            "ls-files",
            "--others",
            "--ignored",
            "--exclude-from=.worktreeinclude",
            "-z",
          ],
          sourceBinding
        )
      )
    : []
  if (patch) {
    const temporary = await mkdtemp(
      path.join(os.tmpdir(), "buddy-worktree-transfer-")
    )
    try {
      const patchPath = path.join(temporary, "changes.patch")
      await writeFile(patchPath, patch, { mode: 0o600 })
      await workspaceGitCommand(
        target.target,
        ["apply", "--whitespace=nowarn", patchPath],
        target
      )
    } finally {
      await rm(temporary, { recursive: true, force: true })
    }
  }
  for (const relative of new Set([...untracked, ...included])) {
    const sourcePath = path.join(source, relative)
    const resolved = await realpath(sourcePath)
    const relativeResolved = path.relative(source, resolved)
    if (
      relativeResolved === ".." ||
      relativeResolved.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativeResolved)
    )
      throw new Error(`转移文件指向工作区外部：${relative}`)
    const destination = path.join(target.target, relative)
    await mkdir(path.dirname(destination), { recursive: true })
    await cp(sourcePath, destination, {
      recursive: true,
      force: false,
      errorOnExist: true,
      preserveTimestamps: true,
    })
  }
}
