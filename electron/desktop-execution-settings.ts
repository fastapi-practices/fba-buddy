import { createHash, randomUUID } from "node:crypto"
import { readFile, realpath, rename, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { SANDBOX_PROVIDERS } from "../src/shared/execution"
import type {
  ExecutionSettings,
  SandboxProvider,
} from "../src/shared/execution"
import type {
  WorkspaceEnvironment,
  WorkspaceManagedWorktree,
} from "../src/shared/workspace"
import { executeWorkspaceGit, readWorkspaceGitStatus } from "./workspace-git"
import { readWorkspaceBranches } from "./workspace-transfer"
import {
  beginWorkspaceWrite,
  invalidateWorkspacePreparations,
} from "./workspace-run"
import {
  defaultTaskWorkspaceRoot,
  ensureTaskWorkspace,
  ensureWorkspaceDirectory,
  taskWorkspaceDirectory,
  validateTaskWorkspaceDirectory,
} from "./task-workspace"
import {
  createWorkspaceWorktree,
  removeWorkspaceWorktree,
  validateWorkspaceWorktree,
  type WorkspaceWorktreeBinding,
} from "./workspace-worktree"

export type ConversationExecutionProfile = ExecutionSettings & {
  locked?: boolean
  worktreeIntent?: { baseBranch: string; sourcePath: string }
  associatedWorktree?: WorkspaceWorktreeBinding
  worktree?: WorkspaceWorktreeBinding
  worktreeSourceKey?: string
  worktreeState?: "draft" | "active" | "orphan"
  worktreeCreatedAt?: string
  worktreeOrphaned?: boolean
}

export function defaultExecutionSettings(
  home: string,
  platform = process.platform
): ExecutionSettings {
  return {
    backend: "local",
    workspaceDir: defaultTaskWorkspaceRoot(home, platform),
    workspaceMode: "auto",
  }
}

export function validateExecutionSettings(
  value: unknown,
  home: string,
  platform = process.platform
): ExecutionSettings {
  const paths = platform === "win32" ? path.win32 : path.posix
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("执行配置无效")
  const config = value as Partial<ExecutionSettings>
  if (config.backend !== "local" && config.backend !== "sandbox")
    throw new Error("执行后端无效")
  if (
    config.sandboxProvider !== undefined &&
    !SANDBOX_PROVIDERS.includes(config.sandboxProvider)
  )
    throw new Error("沙箱服务商无效")
  if (
    typeof config.workspaceDir !== "string" ||
    config.workspaceDir.length > 4096 ||
    /[\0\r\n,]/.test(config.workspaceDir)
  )
    throw new Error("工作目录必须是绝对路径")
  let input = config.workspaceDir.trim()
  if (input === "~") input = home
  else if (
    input.startsWith("~/") ||
    (platform === "win32" && input.startsWith("~\\"))
  )
    input = paths.join(home, input.slice(2))
  if (
    !paths.isAbsolute(input) ||
    (platform === "win32" &&
      !/^(?:[a-z]:[\\/]|[\\/]{2}[^\\/]+[\\/][^\\/]+)/i.test(input))
  )
    throw new Error("工作目录必须是绝对路径")
  const workspaceDir = paths.resolve(input)
  const workspaceMode = config.workspaceMode
  if (workspaceMode !== "auto" && workspaceMode !== "custom")
    throw new Error("工作区模式无效")
  const protectedPaths = [
    paths.parse(workspaceDir).root,
    paths.parse(home).root,
    home,
    paths.dirname(home),
    ...(platform === "win32"
      ? ["C:\\Windows", "C:\\Program Files", "C:\\Program Files (x86)"]
      : ["/etc", "/usr", "/System", "/Library", "/private", "/var"]),
  ]
  const equal = (left: string, right: string) =>
    platform === "win32"
      ? left.toLowerCase() === right.toLowerCase()
      : left === right
  if (protectedPaths.some((item) => equal(workspaceDir, paths.resolve(item))))
    throw new Error("请选择独立工作目录，不能使用用户根目录或系统目录")
  return {
    backend: config.backend!,
    ...(config.backend === "sandbox" && config.sandboxProvider
      ? { sandboxProvider: config.sandboxProvider }
      : {}),
    workspaceDir,
    workspaceMode,
  }
}

function validateDefaultExecutionSettings(value: unknown, home: string) {
  const config = validateExecutionSettings(value, home)
  if (
    config.workspaceMode === "auto" &&
    config.workspaceDir !== defaultTaskWorkspaceRoot(home)
  )
    throw new Error("自动工作区必须使用默认目录")
  return config
}

export async function ensureDefaultWorkspace(
  config: ExecutionSettings,
  home: string
) {
  if (config.workspaceMode !== "auto") return
  if (config.workspaceDir !== defaultTaskWorkspaceRoot(home)) return
  await ensureWorkspaceDirectory(config.workspaceDir)
}

async function readStoredExecutionSettings(
  filePath: string,
  home: string
): Promise<ExecutionSettings> {
  try {
    const stored: unknown = JSON.parse(await readFile(filePath, "utf8"))
    return validateDefaultExecutionSettings(stored, home)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return defaultExecutionSettings(home)
    }
    throw new Error("执行配置读取失败，请检查本机配置文件", { cause: error })
  }
}

export async function readExecutionSettings(
  filePath: string,
  home: string
): Promise<ExecutionSettings> {
  const config = await readStoredExecutionSettings(filePath, home)
  await ensureDefaultWorkspace(config, home)
  return config
}

async function atomicWrite(filePath: string, value: unknown) {
  const temporary = `${filePath}.${randomUUID()}.tmp`
  const contents = JSON.stringify(value, null, 2)
  if (Buffer.byteLength(contents) > 4 * 1024 * 1024)
    throw new Error("执行配置超过存储限制")
  try {
    await writeFile(temporary, contents, {
      mode: 0o600,
      flag: "wx",
    })
    await rename(temporary, filePath)
  } finally {
    await rm(temporary, { force: true })
  }
}

export async function writeExecutionSettings(
  filePath: string,
  config: unknown,
  home: string
) {
  const validated = validateDefaultExecutionSettings(config, home)
  await ensureDefaultWorkspace(validated, home)
  await atomicWrite(filePath, validated)
  return validated
}

export class ConversationExecutionProfiles {
  private pending = Promise.resolve()

  private readonly filePath: string
  private readonly home: string

  constructor(filePath: string, home: string) {
    this.filePath = filePath
    this.home = home
  }

  private async read(): Promise<Record<string, ConversationExecutionProfile>> {
    try {
      const contents = await readFile(this.filePath, "utf8")
      if (Buffer.byteLength(contents) > 4 * 1024 * 1024)
        throw new Error("执行会话配置过大")
      const parsed: unknown = JSON.parse(contents)
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        throw new Error("执行会话配置无效")
      return parsed as Record<string, ConversationExecutionProfile>
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return Object.create(null) as Record<
          string,
          ConversationExecutionProfile
        >
      throw new Error("执行会话配置读取失败", { cause: error })
    }
  }

  private async validate(
    key: string,
    stored: ConversationExecutionProfile
  ): Promise<ConversationExecutionProfile> {
    const validated = validateExecutionSettings(stored, this.home)
    if (validated.backend === "local" && validated.workspaceMode === "auto")
      validateTaskWorkspaceDirectory(key, validated.workspaceDir)
    if (stored.worktree !== undefined) {
      if (
        validated.backend !== "local" ||
        validated.workspaceMode !== "custom" ||
        !stored.worktree ||
        stored.worktree.profileKey !== key ||
        typeof stored.worktreeSourceKey !== "string" ||
        stored.worktreeSourceKey.split(":")[0] !== key.split(":")[0] ||
        !["draft", "active", "orphan"].includes(stored.worktreeState ?? "") ||
        typeof stored.worktreeCreatedAt !== "string" ||
        !Number.isFinite(Date.parse(stored.worktreeCreatedAt))
      )
        throw new Error("Worktree 对话授权无效")
      await validateWorkspaceWorktree(validated.workspaceDir, stored.worktree)
      return {
        ...validated,
        ...(stored.locked ? { locked: true } : {}),
        worktree: stored.worktree,
        worktreeSourceKey: stored.worktreeSourceKey,
        worktreeState: stored.worktreeState,
        worktreeCreatedAt: stored.worktreeCreatedAt,
      }
    }
    if (stored.worktreeIntent) {
      if (
        validated.backend !== "local" ||
        validated.workspaceMode !== "custom" ||
        typeof stored.worktreeIntent.baseBranch !== "string" ||
        !stored.worktreeIntent.baseBranch ||
        stored.worktreeIntent.sourcePath !== validated.workspaceDir
      )
        throw new Error("待创建 Worktree 配置无效")
    }
    if (
      stored.associatedWorktree &&
      (validated.backend !== "local" ||
        stored.associatedWorktree.profileKey !== key ||
        stored.associatedWorktree.sourceRepo !== validated.workspaceDir)
    )
      throw new Error("关联 Worktree 配置无效")
    return {
      ...validated,
      ...(stored.locked ? { locked: true } : {}),
      ...(stored.worktreeIntent
        ? { worktreeIntent: stored.worktreeIntent }
        : {}),
      ...(stored.associatedWorktree
        ? { associatedWorktree: stored.associatedWorktree }
        : {}),
      ...(stored.associatedWorktree && stored.worktreeOrphaned
        ? { worktreeOrphaned: true }
        : {}),
    }
  }

  async getExisting(
    key: string
  ): Promise<ConversationExecutionProfile | undefined> {
    if (!key || key.length > 512 || /[\0\r\n]/.test(key))
      throw new Error("会话标识无效")
    const operation = this.pending.then(async () => {
      const profiles = await this.read()
      return Object.hasOwn(profiles, key)
        ? this.validate(key, profiles[key]!)
        : undefined
    })
    this.pending = operation.then(
      () => {},
      () => {}
    )
    return operation
  }

  async getOrCreate(
    key: string,
    config: ExecutionSettings
  ): Promise<ConversationExecutionProfile> {
    if (!key || key.length > 512 || /[\0\r\n]/.test(key))
      throw new Error("会话标识无效")
    const operation = this.pending.then(async () => {
      let profiles = await this.read()
      if (Object.hasOwn(profiles, key)) {
        const validated = await this.validate(key, profiles[key]!)
        if (
          validated.backend === "local" &&
          validated.workspaceMode === "auto"
        ) {
          await ensureTaskWorkspace(validated.workspaceDir)
        }
        return validated
      }
      const validated = validateExecutionSettings(config, this.home)
      if (validated.backend === "local" && validated.workspaceMode === "auto") {
        validated.workspaceDir = taskWorkspaceDirectory(this.home, key)
        await ensureTaskWorkspace(validated.workspaceDir)
      }
      profiles = { ...profiles, [key]: validated }
      await atomicWrite(this.filePath, profiles)
      return validated
    })
    this.pending = operation.then(
      () => {},
      () => {}
    )
    return operation
  }

  async environment(
    key: string | undefined,
    config: ExecutionSettings
  ): Promise<WorkspaceEnvironment> {
    await this.pending
    const profiles = await this.read()
    const profile: ConversationExecutionProfile =
      key && Object.hasOwn(profiles, key)
        ? await this.validate(key, profiles[key]!)
        : validateExecutionSettings(config, this.home)
    const sourcePath = profile.worktree?.sourceRepo ?? profile.workspaceDir
    if (profile.backend === "sandbox")
      return {
        backend: "sandbox",
        ...(profile.sandboxProvider
          ? { sandboxProvider: profile.sandboxProvider }
          : {}),
        mode: "local",
        state: "local",
        path: null,
        sourcePath: "",
        branch: null,
        baseBranch: null,
        branches: [],
        repository: false,
        associatedWorktreePath: null,
      }
    const root = await readWorkspaceBranches(sourcePath)
    const current = profile.worktree
      ? await readWorkspaceBranches(profile.workspaceDir, profile.worktree)
      : root
    return {
      backend: "local",
      mode: profile.worktree || profile.worktreeIntent ? "worktree" : "local",
      state: profile.worktree
        ? "ready"
        : profile.worktreeIntent
          ? "pending"
          : "local",
      path: profile.worktreeIntent ? null : profile.workspaceDir,
      sourcePath,
      branch: profile.worktreeIntent ? null : current.branch,
      baseBranch: profile.worktreeIntent?.baseBranch ?? null,
      branches: root.branches,
      repository: root.repository,
      associatedWorktreePath:
        profile.associatedWorktree?.target ?? profile.worktree?.target ?? null,
    }
  }

  async configureEnvironment(
    key: string,
    config: ExecutionSettings,
    mode: "local" | "worktree",
    baseBranch?: string,
    backend?: ExecutionSettings["backend"],
    sandboxProvider?: SandboxProvider | null
  ) {
    if (
      !/^[a-f0-9]{64}:[a-zA-Z0-9_-]{1,128}$/.test(key) ||
      !["local", "worktree"].includes(mode)
    )
      throw new Error("工作区配置无效")
    const operation = this.pending.then(async () => {
      const profiles = await this.read()
      const profile: ConversationExecutionProfile = Object.hasOwn(profiles, key)
        ? await this.validate(key, profiles[key]!)
        : validateExecutionSettings(config, this.home)
      if (profile.locked)
        throw new Error("对话开始后不能更改工作位置，请新建对话")
      if (backend !== undefined) {
        profile.backend = validateExecutionSettings(
          { ...profile, backend },
          this.home
        ).backend
      }
      if (profile.backend === "local") profile.sandboxProvider = undefined
      else if (sandboxProvider !== undefined) {
        if (sandboxProvider !== null && profile.backend !== "sandbox")
          throw new Error("只有服务端沙箱可以指定服务商")
        profile.sandboxProvider = validateExecutionSettings(
          { ...profile, sandboxProvider: sandboxProvider ?? undefined },
          this.home
        ).sandboxProvider
      }
      if (profile.backend === "sandbox" && mode !== "local")
        throw new Error("服务端沙箱不支持 Worktree")
      if (profile.worktree)
        throw new Error("现有 Worktree 请使用切换工作区操作")
      if (profile.backend === "local" && profile.workspaceMode === "auto") {
        profile.workspaceDir = taskWorkspaceDirectory(this.home, key)
        await ensureTaskWorkspace(profile.workspaceDir)
      }
      if (mode === "worktree") {
        if (profile.backend !== "local")
          throw new Error("Worktree 需要本机项目目录")
        const branches = await readWorkspaceBranches(profile.workspaceDir)
        if (!baseBranch || !branches.branches.includes(baseBranch))
          throw new Error("请选择有效的基础分支")
        profiles[key] = {
          ...profile,
          workspaceMode: "custom",
          worktreeIntent: { baseBranch, sourcePath: profile.workspaceDir },
        }
      } else {
        const local = { ...profile }
        delete local.worktreeIntent
        profiles[key] = local
      }
      await atomicWrite(this.filePath, profiles)
    })
    this.pending = operation.then(
      () => {},
      () => {}
    )
    await operation
    return this.environment(key, config)
  }

  async lockEnvironment(key: string, config: ExecutionSettings) {
    await this.getOrCreate(key, config)
    const operation = this.pending.then(async () => {
      const profiles = await this.read()
      const profile = await this.validate(key, profiles[key]!)
      if (!profile.locked)
        await atomicWrite(this.filePath, {
          ...profiles,
          [key]: { ...profile, locked: true },
        })
    })
    this.pending = operation.then(
      () => {},
      () => {}
    )
    await operation
    return this.environment(key, config)
  }

  private async createManagedWorktree(
    key: string,
    source: ConversationExecutionProfile,
    ref: string,
    copyChanges: boolean,
    branch?: string,
    targetPath?: string
  ) {
    const parent = defaultTaskWorkspaceRoot(this.home)
    await ensureWorkspaceDirectory(parent)
    const directory = path.join(parent, "Worktrees")
    await ensureWorkspaceDirectory(directory)
    const base = await realpath(directory)
    const repoDirectory = path.join(
      base,
      path.basename(source.worktree?.sourceRepo ?? source.workspaceDir)
    )
    await ensureWorkspaceDirectory(repoDirectory)
    return createWorkspaceWorktree(
      source.workspaceDir,
      targetPath ??
        path.join(
          repoDirectory,
          createHash("sha256").update(key).digest("hex").slice(0, 24)
        ),
      key,
      source.worktree,
      {
        ref,
        newBranch: branch ?? `buddy/worktree-${randomUUID().slice(0, 8)}`,
        copyChanges,
      }
    )
  }

  async materialize(key: string) {
    const operation = this.pending.then(async () => {
      const profiles = await this.read()
      if (!Object.hasOwn(profiles, key)) throw new Error("对话工作区配置不存在")
      const profile = await this.validate(key, profiles[key]!)
      if (!profile.worktreeIntent) return profile
      const release = beginWorkspaceWrite(profile.workspaceDir)
      try {
        const root = await readWorkspaceBranches(profile.workspaceDir)
        const intent = profile.worktreeIntent
        if (!root.branches.includes(intent.baseBranch))
          throw new Error("基础分支已失效，请重新选择")
        const binding = await this.createManagedWorktree(
          key,
          profile,
          intent.baseBranch,
          root.branch === intent.baseBranch
        )
        const target: ConversationExecutionProfile = {
          ...(profile.locked ? { locked: true } : {}),
          backend: "local",
          workspaceMode: "custom",
          workspaceDir: binding.target,
          worktree: binding,
          worktreeSourceKey: key,
          worktreeState: "active",
          worktreeCreatedAt: new Date().toISOString(),
        }
        try {
          await atomicWrite(this.filePath, { ...profiles, [key]: target })
        } catch (cause) {
          await removeWorkspaceWorktree(binding).catch(() => {})
          throw new Error(
            `Worktree 配置保存失败，工作目录：${binding.target}`,
            { cause }
          )
        }
        return target
      } finally {
        release()
      }
    })
    this.pending = operation.then(
      () => {},
      () => {}
    )
    return operation
  }

  async handoffEnvironment(
    key: string,
    mode: "local" | "worktree",
    worktreeName?: string
  ) {
    if (
      !/^[a-f0-9]{64}:[a-zA-Z0-9_-]{1,128}$/.test(key) ||
      !["local", "worktree"].includes(mode)
    )
      throw new Error("工作区切换参数无效")
    const operation = this.pending.then(async () => {
      const profiles = await this.read()
      if (!Object.hasOwn(profiles, key)) throw new Error("此对话尚未关联工作区")
      const profile = await this.validate(key, profiles[key]!)
      if (profile.locked)
        throw new Error("对话开始后不能更改工作位置，请新建对话")
      const linked = profile.worktree ?? profile.associatedWorktree
      if (
        linked &&
        Object.entries(profiles).some(
          ([otherKey, other]) =>
            otherKey !== key &&
            (other.worktree?.target === linked.target ||
              other.associatedWorktree?.target === linked.target)
        )
      )
        throw new Error("此 Worktree 仍被其他对话使用，不能转移改动")
      const releases: (() => void)[] = []
      try {
        for (const directory of new Set(
          [
            profile.worktree?.sourceRepo ?? profile.workspaceDir,
            linked?.target,
          ].filter((value): value is string => !!value)
        ))
          releases.push(beginWorkspaceWrite(directory))
        invalidateWorkspacePreparations(
          profile.worktree?.sourceRepo ?? profile.workspaceDir
        )
        if (linked) invalidateWorkspacePreparations(linked.target)
        const { handoffWorkspaceProfile } = await import("./workspace-handoff")
        return await handoffWorkspaceProfile(
          profile,
          mode,
          (ref, branch) =>
            this.createManagedWorktree(key, profile, ref, false, branch),
          (target) =>
            atomicWrite(this.filePath, { ...profiles, [key]: target }),
          worktreeName
        )
      } finally {
        releases.reverse().forEach((release) => release())
      }
    })
    this.pending = operation.then(
      () => {},
      () => {}
    )
    const profile = await operation
    return this.environment(key, profile)
  }

  async openWorktree(
    key: string,
    openPath: (directory: string) => Promise<string>
  ) {
    const profile = await this.getExisting(key)
    const binding = profile?.worktree ?? profile?.associatedWorktree
    if (!binding) throw new Error("Worktree 记录不存在")
    await validateWorkspaceWorktree(binding.target, binding)
    const error = await openPath(binding.target)
    if (error) throw new Error(error)
  }

  async fork(
    sourceKey: string,
    targetKey: string
  ): Promise<ConversationExecutionProfile> {
    if (
      !/^[a-f0-9]{64}:[a-zA-Z0-9_-]{1,128}$/.test(sourceKey) ||
      !/^[a-f0-9]{64}:[a-zA-Z0-9_-]{1,128}$/.test(targetKey) ||
      sourceKey === targetKey ||
      sourceKey.split(":")[0] !== targetKey.split(":")[0]
    )
      throw new Error("目标对话必须是同一账号的新对话")
    const operation = this.pending.then(async () => {
      const profiles = await this.read()
      if (!Object.hasOwn(profiles, sourceKey))
        throw new Error("源对话没有绑定工作区")
      const source = await this.validate(sourceKey, profiles[sourceKey]!)
      if (Object.hasOwn(profiles, targetKey)) {
        throw new Error("目标对话已经绑定工作区，请新建对话")
      }
      const target: ConversationExecutionProfile = source.worktree
        ? {
            ...source,
            worktree: { ...source.worktree, profileKey: targetKey },
            worktreeSourceKey: sourceKey,
          }
        : {
            ...source,
            ...(source.associatedWorktree
              ? {
                  associatedWorktree: {
                    ...source.associatedWorktree,
                    profileKey: targetKey,
                  },
                }
              : {}),
          }
      if (target.backend === "local" && target.workspaceMode === "auto") {
        target.workspaceDir = taskWorkspaceDirectory(this.home, targetKey)
        await ensureTaskWorkspace(target.workspaceDir)
      }
      try {
        await atomicWrite(this.filePath, { ...profiles, [targetKey]: target })
      } catch (error) {
        throw new Error("对话工作区绑定保存失败，请重试", { cause: error })
      }
      return target
    })
    this.pending = operation.then(
      () => {},
      () => {}
    )
    return operation
  }

  async delete(key: string): Promise<void> {
    const operation = this.pending.then(async () => {
      const profiles = await this.read()
      if (!Object.hasOwn(profiles, key)) return
      const profile = profiles[key]!
      if (profile.worktree)
        profiles[key] = { ...profile, worktreeState: "orphan" }
      else if (profile.associatedWorktree)
        profiles[key] = { ...profile, worktreeOrphaned: true }
      else delete profiles[key]
      await atomicWrite(this.filePath, profiles)
    })
    this.pending = operation.catch(() => {})
    return operation
  }

  async listWorktrees(account: string): Promise<WorkspaceManagedWorktree[]> {
    if (!/^[a-f0-9]{64}$/.test(account)) throw new Error("账号数据源无效")
    await this.pending
    const profiles = await this.read()
    const items: WorkspaceManagedWorktree[] = []
    for (const [key, profile] of Object.entries(profiles)) {
      const binding = profile.worktree ?? profile.associatedWorktree
      if (!key.startsWith(account + ":") || !binding) continue
      let error: string | null = null
      let branch = binding.branch
      try {
        await this.validate(key, profile)
        await validateWorkspaceWorktree(binding.target, binding)
        branch = (await readWorkspaceBranches(binding.target, binding)).branch
      } catch (cause) {
        error = cause instanceof Error ? cause.message : String(cause)
      }
      items.push({
        conversationId: key.slice(account.length + 1),
        path: binding.target,
        head: binding.head,
        sourcePath: binding.sourceRepo,
        state: profile.worktree
          ? profile.worktreeState!
          : profile.worktreeOrphaned
            ? "orphan"
            : "active",
        createdAt: profile.worktreeCreatedAt ?? null,
        branch,
        associated: !profile.worktree,
        error,
      })
    }
    return items.sort((a, b) =>
      (b.createdAt ?? "").localeCompare(a.createdAt ?? "")
    )
  }

  async manageWorktree(
    key: string,
    action: "resume" | "active" | "remove",
    force = false
  ) {
    if (!/^[a-f0-9]{64}:[a-zA-Z0-9_-]{1,128}$/.test(key))
      throw new Error("会话标识无效")
    const operation = this.pending.then(async () => {
      const profiles = await this.read()
      if (!Object.hasOwn(profiles, key)) throw new Error("Worktree 记录不存在")
      const profile = await this.validate(key, profiles[key]!)
      const binding = profile.worktree ?? profile.associatedWorktree
      if (!binding) throw new Error("此对话没有独立 Worktree")
      await validateWorkspaceWorktree(binding.target, binding)
      if (action === "remove") {
        if (
          Object.entries(profiles).some(
            ([otherKey, other]) =>
              otherKey !== key &&
              (other.worktree?.target === binding.target ||
                other.associatedWorktree?.target === binding.target)
          )
        )
          throw new Error("此 Worktree 仍被其他对话使用")
        const status = await readWorkspaceGitStatus(binding.target, binding)
        const ignored = await executeWorkspaceGit(
          binding.target,
          ["ls-files", "--others", "--ignored", "--exclude-standard", "-z"],
          128 * 1024,
          binding.gitDir
        )
        const head = await executeWorkspaceGit(
          binding.target,
          ["rev-parse", "--verify", "HEAD"],
          1024,
          binding.gitDir
        )
        if (
          !force &&
          (!status.repository ||
            status.entries.length ||
            ignored.code !== 0 ||
            ignored.reason ||
            ignored.stdout.length ||
            head.code !== 0 ||
            head.reason ||
            head.stdout.trim() !== binding.head)
        )
          throw new Error(
            "Worktree 有未保存变更或新增提交，已保留目录，请先手动处理"
          )
        await removeWorkspaceWorktree(binding, force)
        invalidateWorkspacePreparations(binding.target)
        if (profile.associatedWorktree) {
          const local = { ...profile }
          delete local.associatedWorktree
          delete local.worktreeOrphaned
          profiles[key] = local
        } else
          profiles[key] = {
            backend: "local",
            workspaceMode: "custom",
            workspaceDir: binding.sourceRepo,
          }
      } else {
        profile.worktreeState = action === "active" ? "active" : "draft"
        profiles[key] = profile
      }
      await atomicWrite(this.filePath, profiles)
      return profile
    })
    this.pending = operation.then(
      () => {},
      () => {}
    )
    return operation
  }
}
