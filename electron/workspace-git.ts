import { constants } from "node:fs"
import { lstat, open, opendir, realpath } from "node:fs/promises"
import path from "node:path"
import { devNull, homedir } from "node:os"
import { executeBounded } from "./execution-process"
import { findExecutable } from "./execution-isolation"
import {
  beginWorkspaceWrite,
  invalidateWorkspacePreparations,
} from "./workspace-run"
import type { WorkspaceWorktreeBinding } from "./workspace-worktree"
import type {
  WorkspaceGitDiff,
  WorkspaceGitStatus,
  WorkspaceGitStatusEntry,
  WorkspaceEngineeringCheck,
  WorkspaceGitCommit,
  WorkspaceGitLineStats,
} from "../src/shared/workspace"

const MAX_STATUS_BYTES = 4 * 1024 * 1024
const MAX_DIFF_BYTES = 8 * 1024 * 1024
const pendingGitWrites = new Map<string, Promise<unknown>>()
let pendingGitAdmissions = Promise.resolve()

export async function checkWorkspaceEngineering(
  root: string,
  binding?: WorkspaceWorktreeBinding
): Promise<WorkspaceEngineeringCheck> {
  const status = await readWorkspaceGitStatus(root, binding)
  const report: WorkspaceEngineeringCheck = {
    checkedAt: new Date().toISOString(),
    repository: status.repository,
    conflicts: status.entries
      .filter((entry) =>
        ["DD", "AU", "UD", "UA", "DU", "AA", "UU"].includes(
          entry.index + entry.worktree
        )
      )
      .map((entry) => entry.path),
    staged: status.entries.filter((entry) => entry.staged).length,
    unstaged: status.entries.filter(
      (entry) => !entry.untracked && entry.worktree !== " "
    ).length,
    untracked: status.entries.filter((entry) => entry.untracked).length,
    whitespace: [],
  }
  if (!status.repository) return report
  const gitDir = await validateWorkspaceGitRepository(root, binding)
  for (const scope of ["staged", "unstaged"] as const) {
    const result = await executeWorkspaceGit(
      root,
      [
        "diff",
        "--check",
        "--no-ext-diff",
        "--no-textconv",
        ...(scope === "staged" ? ["--cached"] : []),
        "--",
      ],
      128 * 1024,
      gitDir!
    )
    if (
      result.code !== 0 &&
      result.code !== 2 &&
      result.reason !== "output-limit"
    )
      throw new Error(result.stderr.trim() || "Git 检查失败")
    report.whitespace.push({
      scope,
      output: (result.stdout + result.stderr).trim(),
      ok: result.code === 0 && !result.reason,
      truncated: result.reason === "output-limit",
    })
  }
  return report
}

export async function executeWorkspaceGit(
  root: string,
  args: string[],
  maxOutputBytes: number,
  gitDir = path.join(root, ".git"),
  deadlineMs = 5000
) {
  const base = await realpath(root)
  const executable = await findExecutable("git", [
    "/usr/bin/git",
    "/usr/local/bin/git",
    "/opt/homebrew/bin/git",
  ])
  if (!executable) throw new Error("当前系统没有可用的 Git")
  const result = await executeBounded({
    executable,
    args: [
      "--no-pager",
      "--no-optional-locks",
      "--literal-pathspecs",
      `--git-dir=${args[0] === "config" ? devNull : gitDir}`,
      `--work-tree=${base}`,
      "-c",
      "core.fsmonitor=false",
      "-c",
      "core.untrackedCache=false",
      "-c",
      `core.hooksPath=${devNull}`,
      "-c",
      `init.templateDir=${devNull}`,
      "-c",
      "submodule.recurse=false",
      "-c",
      `core.excludesfile=${devNull}`,
      "-c",
      `core.attributesfile=${devNull}`,
      "-c",
      "protocol.allow=never",
      ...args,
    ],
    cwd: base,
    env: {
      ...Object.fromEntries(
        Object.entries(process.env).filter(([key]) => !/^GIT_/i.test(key))
      ),
      GIT_OPTIONAL_LOCKS: "0",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: devNull,
      GIT_CONFIG_SYSTEM: devNull,
      GIT_TERMINAL_PROMPT: "0",
      GIT_NO_REPLACE_OBJECTS: "1",
      GIT_NO_LAZY_FETCH: "1",
      GIT_CEILING_DIRECTORIES: base,
      LANG: "C",
      LC_ALL: "C",
    },
    deadlineMs,
    maxOutputBytes,
  })
  if (result.reason === "deadline") throw new Error("Git 检查超时")
  if (result.reason === "cancelled") throw new Error("Git 检查已取消")
  return result
}

export async function readGitMetadataPointer(file: string) {
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const stat = await handle.stat()
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > 16384)
      throw new Error("Git 元数据指针无效")
    const buffer = Buffer.alloc(16385)
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    if (bytesRead > 16384) throw new Error("Git 元数据指针过大")
    const value = new TextDecoder("utf-8", { fatal: true })
      .decode(buffer.subarray(0, bytesRead))
      .replace(/\r?\n$/, "")
    if (!value || /[\0\r\n]/.test(value)) throw new Error("Git 元数据指针无效")
    return value
  } finally {
    await handle.close()
  }
}

export async function validateWorkspaceGitRepository(
  root: string,
  binding?: WorkspaceWorktreeBinding
) {
  const base = await realpath(root)
  const directory = path.join(base, ".git")
  const metadata = await lstat(directory).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
    throw error
  })
  if (!metadata && !binding) return null
  if (!metadata) throw new Error("Worktree 授权绑定已失效")
  if (metadata.isSymbolicLink()) throw new Error("Git 元数据不能包含符号链接")
  let gitDir = directory
  let commonDir = directory
  if (binding) {
    if (
      !binding.profileKey ||
      !/^[\da-f]{40}(?:[\da-f]{24})?$/i.test(binding.head) ||
      base !== binding.target ||
      !metadata.isFile()
    )
      throw new Error("Worktree 授权绑定不匹配")
    for (const item of [
      binding.sourceRepo,
      binding.commonGitDir,
      binding.target,
      binding.gitDir,
    ]) {
      if (
        !path.isAbsolute(item) ||
        /[\0\r\n]/.test(item) ||
        (await realpath(item)) !== item
      )
        throw new Error("Worktree 授权目录已更改")
      const stat = await lstat(item)
      if (!stat.isDirectory() || stat.isSymbolicLink())
        throw new Error("Worktree 授权目录无效")
    }
    if (
      path.join(binding.sourceRepo, ".git") !== binding.commonGitDir ||
      path.dirname(binding.gitDir) !==
        path.join(binding.commonGitDir, "worktrees") ||
      (await realpath(path.dirname(binding.gitDir))) !==
        path.dirname(binding.gitDir)
    )
      throw new Error("Worktree Git 元数据不属于授权仓库")
    const pointer = await readGitMetadataPointer(directory)
    if (
      !pointer.startsWith("gitdir: ") ||
      path.resolve(base, pointer.slice(8)) !== binding.gitDir ||
      path.resolve(
        binding.gitDir,
        await readGitMetadataPointer(path.join(binding.gitDir, "commondir"))
      ) !== binding.commonGitDir ||
      path.resolve(
        binding.gitDir,
        await readGitMetadataPointer(path.join(binding.gitDir, "gitdir"))
      ) !== directory
    )
      throw new Error("Worktree Git 元数据指向已更改")
    gitDir = binding.gitDir
    commonDir = binding.commonGitDir
  } else if (!metadata.isDirectory())
    throw new Error(
      "暂不支持 linked worktree 或外部 Git 元数据，需先完成工作区授权绑定"
    )
  const folders = [commonDir]
  const configs: string[] = []
  let examined = 0
  while (folders.length) {
    const folder = folders.pop()!
    for await (const entry of await opendir(folder)) {
      if (++examined > 100000) throw new Error("Git 元数据超过检查限制")
      const target = path.join(folder, entry.name)
      if (entry.isSymbolicLink()) throw new Error("Git 元数据不能包含符号链接")
      const relative = path
        .relative(commonDir, target)
        .split(path.sep)
        .join("/")
      if (
        [
          "commondir",
          "objects/info/alternates",
          "objects/info/http-alternates",
        ].includes(relative)
      )
        throw new Error("暂不支持外部 Git 元数据，需先完成工作区授权绑定")
      if (entry.isDirectory()) folders.push(target)
      else if (
        [
          path.join(commonDir, "config"),
          path.join(commonDir, "config.worktree"),
          path.join(gitDir, "config.worktree"),
        ].includes(target)
      )
        configs.push(target)
    }
  }
  for (const config of configs) {
    const result = await executeWorkspaceGit(
      base,
      [
        "config",
        "--file",
        config,
        "--no-includes",
        "--name-only",
        "--get-regexp",
        "^(include|includeif)\\.|^filter\\..*\\.(clean|smudge|process)$",
      ],
      64 * 1024
    )
    if (result.reason === "output-limit") throw new Error("Git 配置输出过大")
    if (result.code !== 1)
      throw new Error("Git 配置无效、引用了其他配置文件或启用了外部过滤器")
  }
  return gitDir
}

function notRepository(stderr: string) {
  return /not a git repository|不是 git 仓库/i.test(stderr)
}

function parseBranch(header: string) {
  const value = header
    .slice(3)
    .trim()
    .replace(/^No commits yet on /, "")
  if (!value || value === "HEAD (no branch)")
    return { branch: null, upstream: null, ahead: 0, behind: 0 }
  const match = /^(.*?)(?:\.\.\.(\S+))?(?: \[(.*?)\])?$/.exec(value)
  if (!match) return { branch: value, upstream: null, ahead: 0, behind: 0 }
  let ahead = 0
  let behind = 0
  for (const item of (match[3] ?? "").split(", ")) {
    const [, kind, count] = /^(ahead|behind) (\d+)$/.exec(item) ?? []
    if (kind === "ahead") ahead = Number(count)
    if (kind === "behind") behind = Number(count)
  }
  return {
    branch: match[1] || null,
    upstream: match[2] || null,
    ahead,
    behind,
  }
}

function parseStatusEntries(records: string[]) {
  const entries: WorkspaceGitStatusEntry[] = []
  for (let offset = 0; offset < records.length; offset++) {
    const record = records[offset]!
    if (!record) continue
    if (record.length < 4 || record[2] !== " ")
      throw new Error("Git 状态输出格式无效")
    const index = record[0]!
    const worktree = record[1]!
    const entry: WorkspaceGitStatusEntry = {
      path: record.slice(3),
      index,
      worktree,
      staged: index !== " " && index !== "?" && index !== "!",
      untracked: index === "?" && worktree === "?",
    }
    if (/[RC]/.test(index + worktree)) {
      const source = records[++offset]
      if (!source) throw new Error("Git 重命名输出格式无效")
      entry.renamedFrom = source
    }
    entries.push(entry)
  }
  return entries
}

export async function readWorkspaceGitStatus(
  root: string,
  binding?: WorkspaceWorktreeBinding,
  includeStats = false
): Promise<WorkspaceGitStatus> {
  const gitDir = await validateWorkspaceGitRepository(root, binding)
  if (!gitDir)
    return {
      repository: false,
      branch: null,
      upstream: null,
      ahead: 0,
      behind: 0,
      entries: [],
    }
  const result = await executeWorkspaceGit(
    root,
    [
      "status",
      "--porcelain=v1",
      "-z",
      "--branch",
      "--untracked-files=all",
      "--ignore-submodules=all",
    ],
    MAX_STATUS_BYTES,
    gitDir
  )
  if (result.reason === "output-limit") throw new Error("Git 状态输出过大")
  if (result.code !== 0) {
    if (notRepository(result.stderr))
      return {
        repository: false,
        branch: null,
        upstream: null,
        ahead: 0,
        behind: 0,
        entries: [],
      }
    throw new Error(result.stderr.trim() || "读取 Git 状态失败")
  }
  const records = result.stdout.split("\0")
  const branch = records[0]?.startsWith("##")
    ? parseBranch(records.shift()!)
    : { branch: null, upstream: null, ahead: 0, behind: 0 }
  const entries = parseStatusEntries(records)
  if (includeStats && entries.length)
    await populateGitLineStats(root, gitDir, entries)
  return {
    repository: true,
    ...branch,
    entries,
  }
}

async function readGitNumStats(root: string, gitDir: string, staged: boolean) {
  const stats = new Map<string, WorkspaceGitLineStats>()
  try {
    const result = await executeWorkspaceGit(
      root,
      [
        "diff",
        "--numstat",
        "-z",
        "--find-renames",
        "--no-ext-diff",
        "--no-textconv",
        "--ignore-submodules=all",
        ...(staged ? ["--cached"] : []),
        "--",
      ],
      MAX_STATUS_BYTES,
      gitDir
    )
    if (result.code !== 0 || result.reason) return stats
    const records = result.stdout.split("\0")
    for (let index = 0; index < records.length; index++) {
      if (!records[index]) continue
      const match = /^(-|\d+)\t(-|\d+)\t([\s\S]*)$/.exec(records[index]!)
      if (!match) continue
      let file = match[3]
      if (!file) {
        index++
        file = records[++index] ?? ""
      }
      if (!file) continue
      const binary = match[1] === "-" || match[2] === "-"
      const additions = binary ? 0 : Number(match[1])
      const deletions = binary ? 0 : Number(match[2])
      if (Number.isSafeInteger(additions) && Number.isSafeInteger(deletions))
        stats.set(file, { additions, deletions, binary })
    }
  } catch {
    // 行数统计不可用时仍保留文件状态
  }
  return stats
}

function gitPatchStats(diff: string): WorkspaceGitLineStats {
  let additions = 0
  let deletions = 0
  let inHunk = false
  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) inHunk = false
    else if (line.startsWith("@@ ")) inHunk = true
    else if (inHunk && line.startsWith("+")) additions++
    else if (inHunk && line.startsWith("-")) deletions++
  }
  return {
    additions,
    deletions,
    binary: /^Binary files |^GIT binary patch/m.test(diff),
  }
}

async function populateGitLineStats(
  root: string,
  gitDir: string,
  entries: WorkspaceGitStatusEntry[]
) {
  const [staged, unstaged] = await Promise.all([
    readGitNumStats(root, gitDir, true),
    readGitNumStats(root, gitDir, false),
  ])
  let remainingBytes = 2 * 1024 * 1024
  let remainingFiles = 100
  for (const entry of entries) {
    const stagedStats = staged.get(entry.path)
    const unstagedStats = unstaged.get(entry.path)
    if (stagedStats) entry.stagedStats = stagedStats
    if (unstagedStats) entry.unstagedStats = unstagedStats
    if (!entry.untracked || remainingBytes <= 0 || remainingFiles-- <= 0)
      continue
    const limit = Math.min(256 * 1024, remainingBytes)
    try {
      const patch = await untrackedGitDiff(root, entry.path, limit)
      remainingBytes -= patch.truncated ? limit : Buffer.byteLength(patch.diff)
      if (!patch.truncated) entry.unstagedStats = gitPatchStats(patch.diff)
    } catch {
      remainingBytes -= limit
      // 文件正在变化或不可读取时不显示不完整的行数
    }
  }
}

async function validateGitPath(root: string, input: string) {
  if (
    typeof input !== "string" ||
    !input ||
    input.length > 4096 ||
    input.includes("\0") ||
    (process.platform === "win32" && input.includes("\\"))
  )
    throw new Error("Git 路径无效")
  const base = await realpath(root)
  const normalized = input.replace(/^\/workspace(?:\/|$)/, "")
  const segments = normalized.split("/")
  if (
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        segment.toLowerCase() === ".git"
    )
  )
    throw new Error("Git 路径无效")
  const target = path.resolve(base, ...segments)
  const relative = path.relative(base, target)
  if (
    !relative ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  )
    throw new Error("Git 路径必须位于工作区内")
  let current = base
  const parts = relative.split(path.sep)
  for (const [index, part] of parts.entries()) {
    current = path.join(current, part)
    const stat = await lstat(current).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
      throw error
    })
    if (!stat) return relative.split(path.sep).join("/")
    if (stat.isSymbolicLink()) throw new Error("Git 路径不支持符号链接")
    if (index < parts.length - 1 && !stat.isDirectory())
      throw new Error("Git 路径目录无效")
    if (stat.isDirectory() && (await realpath(current)) !== current)
      throw new Error("Git 路径目录已更改")
  }
  return relative.split(path.sep).join("/")
}

async function writeWorkspaceGit<T>(
  root: string,
  binding: WorkspaceWorktreeBinding | undefined,
  operation: (base: string, gitDir: string) => Promise<T>
): Promise<T> {
  const admission = pendingGitAdmissions.then(async () => {
    const base = await realpath(root)
    const key = binding?.commonGitDir ?? path.join(base, ".git")
    const pending = (pendingGitWrites.get(key) ?? Promise.resolve())
      .catch(() => {})
      .then(async () => {
        const release = beginWorkspaceWrite(base)
        try {
          const gitDir = await validateWorkspaceGitRepository(base, binding)
          if (!gitDir) throw new Error("当前工作区不是 Git 仓库")
          for (const directory of new Set([
            gitDir,
            binding?.commonGitDir ?? gitDir,
          ])) {
            const logs = path.join(directory, "logs")
            const folders = [logs]
            while (folders.length) {
              const folder = folders.pop()!
              const entries = await opendir(folder).catch((error: unknown) => {
                if ((error as NodeJS.ErrnoException).code === "ENOENT")
                  return null
                throw error
              })
              if (!entries) continue
              for await (const entry of entries) {
                const target = path.join(folder, entry.name)
                const stat = await lstat(target)
                if (stat.isDirectory() && !stat.isSymbolicLink())
                  folders.push(target)
                else if (!stat.isFile() || stat.nlink !== 1)
                  throw new Error("Git reflog 元数据不能包含链接或特殊文件")
              }
            }
          }
          return await operation(base, gitDir)
        } finally {
          release()
        }
      })
    pendingGitWrites.set(key, pending)
    return { key, pending }
  })
  pendingGitAdmissions = admission.then(
    () => {},
    () => {}
  )
  const { key, pending } = await admission
  try {
    return await pending
  } finally {
    if (pendingGitWrites.get(key) === pending) pendingGitWrites.delete(key)
  }
}

async function selectedGitPaths(
  root: string,
  inputs: string[],
  status: WorkspaceGitStatus,
  staged: boolean
) {
  if (!Array.isArray(inputs) || !inputs.length || inputs.length > 10000)
    throw new Error("请选择需要操作的 Git 文件")
  const paths = new Set<string>()
  for (const input of inputs) {
    const selected = await validateGitPath(root, input)
    const entry = status.entries.find((item) => item.path === selected)
    if (!entry || (staged && !entry.staged))
      throw new Error("Git 文件状态已变化，请刷新后重试")
    const stat = await lstat(path.join(root, selected)).catch(
      (error: unknown) => {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
        throw error
      }
    )
    if (stat?.isDirectory()) throw new Error("请选择具体的 Git 文件")
    if (stat && !stat.isFile()) throw new Error("Git 文件类型不支持暂存操作")
    paths.add(selected)
    if (
      entry.renamedFrom &&
      (staged ? entry.index === "R" : entry.worktree === "R")
    )
      paths.add(await validateGitPath(root, entry.renamedFrom))
  }
  return [...paths]
}

function requireGitSuccess(
  result: Awaited<ReturnType<typeof executeWorkspaceGit>>,
  message: string
) {
  if (result.code !== 0 || result.reason)
    throw new Error(result.stderr.trim() || message)
}

export async function checkoutWorkspaceBranch(
  root: string,
  branch: string,
  create = false,
  binding?: WorkspaceWorktreeBinding
): Promise<WorkspaceGitStatus> {
  if (
    typeof branch !== "string" ||
    !branch ||
    branch.length > 1024 ||
    /[\0\r\n]/.test(branch)
  )
    throw new Error("分支名称无效")
  return writeWorkspaceGit(root, binding, async (base, gitDir) => {
    requireGitSuccess(
      await executeWorkspaceGit(
        base,
        ["check-ref-format", "--branch", branch],
        4096,
        gitDir
      ),
      "分支名称无效"
    )
    let args = create ? ["switch", "-c", branch] : ["switch", "--", branch]
    if (!create) {
      const local = await executeWorkspaceGit(
        base,
        ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`],
        4096,
        gitDir
      )
      if (local.code !== 0) {
        const remote = await executeWorkspaceGit(
          base,
          ["show-ref", "--verify", "--quiet", `refs/remotes/${branch}`],
          4096,
          gitDir
        )
        if (remote.code === 0) args = ["switch", "--track", "--", branch]
      }
    }
    requireGitSuccess(
      await executeWorkspaceGit(base, args, 128 * 1024, gitDir, 30000),
      "切换分支失败，请先处理会被覆盖的未提交改动"
    )
    invalidateWorkspacePreparations(base)
    return readWorkspaceGitStatus(base, binding)
  })
}

export async function stageWorkspaceGitFiles(
  root: string,
  inputs: string[],
  binding?: WorkspaceWorktreeBinding
): Promise<WorkspaceGitStatus> {
  return writeWorkspaceGit(root, binding, async (base, gitDir) => {
    const status = await readWorkspaceGitStatus(base, binding)
    const paths = await selectedGitPaths(base, inputs, status, false)
    const result = await executeWorkspaceGit(
      base,
      ["add", "--", ...paths],
      128 * 1024,
      gitDir,
      30000
    )
    requireGitSuccess(result, "暂存 Git 文件失败")
    return readWorkspaceGitStatus(base, binding)
  })
}

export async function unstageWorkspaceGitFiles(
  root: string,
  inputs: string[],
  binding?: WorkspaceWorktreeBinding
): Promise<WorkspaceGitStatus> {
  return writeWorkspaceGit(root, binding, async (base, gitDir) => {
    const status = await readWorkspaceGitStatus(base, binding)
    const paths = await selectedGitPaths(base, inputs, status, true)
    const head = await executeWorkspaceGit(
      base,
      ["rev-parse", "--verify", "--quiet", "HEAD"],
      4096,
      gitDir
    )
    if (head.reason || (head.code !== 0 && head.code !== 1))
      requireGitSuccess(head, "读取 Git 提交失败")
    const result = await executeWorkspaceGit(
      base,
      head.code === 0
        ? ["restore", "--staged", "--source=HEAD", "--", ...paths]
        : ["rm", "--cached", "--force", "--", ...paths],
      128 * 1024,
      gitDir,
      30000
    )
    requireGitSuccess(result, "取消暂存 Git 文件失败")
    return readWorkspaceGitStatus(base, binding)
  })
}

async function gitIdentityField(
  root: string,
  gitDir: string,
  field: "user.name" | "user.email"
) {
  const local = await executeWorkspaceGit(
    root,
    [
      "-c",
      "user.useConfigOnly=true",
      "config",
      "--no-includes",
      "--get",
      field,
    ],
    4096,
    gitDir
  )
  if (local.code !== 1 || local.reason) {
    requireGitSuccess(local, "读取 Git 用户身份失败")
    return local.stdout.trim()
  }
  const configHome = process.env.XDG_CONFIG_HOME
  const files = [
    path.join(
      configHome && path.isAbsolute(configHome)
        ? configHome
        : path.join(homedir(), ".config"),
      "git",
      "config"
    ),
    path.join(homedir(), ".gitconfig"),
  ]
  let value = ""
  for (const file of files) {
    const exists = await lstat(file).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
      throw error
    })
    if (!exists) continue
    const result = await executeWorkspaceGit(
      root,
      ["config", "--file", file, "--no-includes", "--get", field],
      4096,
      gitDir
    )
    if (result.code === 1 && !result.reason) continue
    requireGitSuccess(result, "读取 Git 用户身份失败")
    value = result.stdout.trim()
  }
  return value
}

export async function commitWorkspaceGit(
  root: string,
  input: string,
  binding?: WorkspaceWorktreeBinding
): Promise<WorkspaceGitCommit> {
  if (
    typeof input !== "string" ||
    !input.trim() ||
    Buffer.byteLength(input) > 65536 ||
    input.includes("\0")
  )
    throw new Error("请填写有效的 Git 提交说明")
  const message = input.trim()
  return writeWorkspaceGit(root, binding, async (base, gitDir) => {
    const status = await readWorkspaceGitStatus(base, binding)
    if (
      status.entries.some((entry) =>
        ["DD", "AU", "UD", "UA", "DU", "AA", "UU"].includes(
          entry.index + entry.worktree
        )
      )
    )
      throw new Error("请先解决 Git 合并冲突并暂存文件")
    if (!status.entries.some((entry) => entry.staged))
      throw new Error("没有已暂存的更改，请先暂存要提交的文件")
    const name = await gitIdentityField(base, gitDir, "user.name")
    const email = await gitIdentityField(base, gitDir, "user.email")
    if (
      !name ||
      !email ||
      name.length > 1024 ||
      email.length > 1024 ||
      /[\0\r\n<>]/.test(name + email)
    )
      throw new Error(
        "Git 提交身份未配置，请先在本机设置 git config --global user.name 和 git config --global user.email"
      )
    const result = await executeWorkspaceGit(
      base,
      [
        "-c",
        `user.name=${name}`,
        "-c",
        `user.email=${email}`,
        "-c",
        "user.useConfigOnly=true",
        "-c",
        "commit.gpgSign=false",
        "-c",
        "gc.auto=0",
        "-c",
        "maintenance.auto=false",
        "commit",
        "--message",
        message,
      ],
      128 * 1024,
      gitDir,
      30000
    )
    requireGitSuccess(result, "Git 提交失败")
    const head = await executeWorkspaceGit(
      base,
      ["rev-parse", "--verify", "HEAD"],
      4096,
      gitDir
    )
    requireGitSuccess(head, "读取 Git 提交失败")
    return { commit: { hash: head.stdout.trim(), message } }
  })
}

async function untrackedGitDiff(root: string, input: string, maxBytes: number) {
  const selected = await validateGitPath(root, input)
  const handle = await open(
    path.join(root, selected),
    constants.O_RDONLY | constants.O_NOFOLLOW
  )
  try {
    const stat = await handle.stat()
    if (!stat.isFile()) throw new Error("Git 文件类型不支持文本差异")
    if (stat.size > maxBytes) return { diff: "", truncated: true }
    const buffer = Buffer.alloc(Math.min(stat.size + 1, maxBytes + 1))
    let bytes = 0
    while (bytes < buffer.length) {
      const read = await handle.read(buffer, bytes, buffer.length - bytes, null)
      if (!read.bytesRead) break
      bytes += read.bytesRead
    }
    if (bytes > maxBytes) return { diff: "", truncated: true }
    const current = await handle.stat()
    if (
      bytes !== stat.size ||
      current.size !== stat.size ||
      current.mtimeMs !== stat.mtimeMs ||
      current.ctimeMs !== stat.ctimeMs
    )
      throw new Error("Git 文件已变化，请刷新后重试")
    const data = buffer.subarray(0, bytes)
    const before = JSON.stringify(`a/${selected}`)
    const after = JSON.stringify(`b/${selected}`)
    const header = `diff --git ${before} ${after}\nnew file mode ${stat.mode & 0o111 ? "100755" : "100644"}\n`
    let content: string
    try {
      if (data.includes(0)) throw new Error("binary")
      content = new TextDecoder("utf-8", {
        fatal: true,
        ignoreBOM: true,
      }).decode(data)
    } catch {
      return {
        diff: `${header}Binary files /dev/null and ${after} differ\n`,
        truncated: false,
      }
    }
    if (!content) return { diff: header, truncated: false }
    const lines = content.split("\n")
    if (content.endsWith("\n")) lines.pop()
    const diff =
      `${header}--- /dev/null\n+++ ${after}\n@@ -0,0 +1,${lines.length} @@\n` +
      lines.map((line) => `+${line}\n`).join("") +
      (content.endsWith("\n") ? "" : "\\ No newline at end of file\n")
    const encoded = Buffer.from(diff)
    return {
      diff: encoded.subarray(0, maxBytes).toString("utf8"),
      truncated: encoded.length > maxBytes,
    }
  } finally {
    await handle.close()
  }
}

export async function readWorkspaceGitDiff(
  root: string,
  input?: string,
  binding?: WorkspaceWorktreeBinding,
  scope?: "staged" | "unstaged"
): Promise<WorkspaceGitDiff> {
  if (scope !== undefined && scope !== "staged" && scope !== "unstaged")
    throw new Error("Git 差异范围无效")
  const pathFilter =
    input === undefined ? null : await validateGitPath(root, input)
  const gitDir = await validateWorkspaceGitRepository(root, binding)
  if (!gitDir)
    return {
      repository: false,
      path: pathFilter,
      diff: "",
      additions: 0,
      deletions: 0,
      truncated: false,
    }
  const diffArgs = [
    "diff",
    "--no-ext-diff",
    "--no-textconv",
    "--ignore-submodules=all",
    "--no-color",
    "--unified=3",
  ]
  const result = await executeWorkspaceGit(
    root,
    [
      ...diffArgs,
      ...(scope === "staged"
        ? ["--cached"]
        : scope === "unstaged"
          ? []
          : ["HEAD"]),
      "--",
      ...(pathFilter ? [pathFilter] : []),
    ],
    MAX_DIFF_BYTES,
    gitDir
  )
  if (
    !scope &&
    result.code !== 0 &&
    result.reason !== "output-limit" &&
    /(?:bad revision|ambiguous argument) ['"]HEAD['"]/i.test(result.stderr)
  ) {
    const status = await readWorkspaceGitStatus(root, binding)
    let diff = ""
    let truncated = false
    for (const entry of status.entries) {
      if ((pathFilter && entry.path !== pathFilter) || entry.worktree === "D")
        continue
      const remaining = MAX_DIFF_BYTES - Buffer.byteLength(diff)
      if (remaining <= 0) {
        truncated = true
        break
      }
      const added = await untrackedGitDiff(root, entry.path, remaining)
      diff += added.diff
      if (added.truncated) {
        truncated = true
        break
      }
    }
    return {
      repository: true,
      path: pathFilter,
      diff,
      ...gitPatchStats(diff),
      truncated,
    }
  }
  if (result.code !== 0 && result.reason !== "output-limit") {
    if (notRepository(result.stderr))
      return {
        repository: false,
        path: pathFilter,
        diff: "",
        additions: 0,
        deletions: 0,
        truncated: false,
      }
    throw new Error(result.stderr.trim() || "读取 Git 差异失败")
  }
  let diff = result.stdout
  let truncated = result.reason === "output-limit"
  if (scope !== "staged" && !truncated) {
    const status = await readWorkspaceGitStatus(root, binding)
    for (const entry of status.entries) {
      if (!entry.untracked || (pathFilter && entry.path !== pathFilter))
        continue
      const remaining = MAX_DIFF_BYTES - Buffer.byteLength(diff)
      if (remaining <= 0) {
        truncated = true
        break
      }
      const added = await untrackedGitDiff(root, entry.path, remaining)
      diff += added.diff
      if (added.truncated) {
        truncated = true
        break
      }
    }
  }
  const stats = gitPatchStats(diff)
  return {
    repository: true,
    path: pathFilter,
    diff,
    additions: stats.additions,
    deletions: stats.deletions,
    truncated,
  }
}
