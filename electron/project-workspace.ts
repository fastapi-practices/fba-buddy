import { randomUUID } from "node:crypto"
import { readFile, rename, rm, writeFile } from "node:fs/promises"
import type { AccountSource } from "../src/shared/account-source"
import { accountSourceHash, executionProfileKey } from "./account-source"
import {
  ConversationExecutionProfiles,
  validateExecutionSettings,
} from "./desktop-execution-settings"
import { validateExecutionWorkspace } from "./execution-isolation"

const MAX_CONTENT_BYTES = 1024 * 1024

export class ProjectWorkspaces {
  private pending = Promise.resolve()
  private readonly filePath: string
  private readonly home: string

  constructor(filePath: string, home: string) {
    this.filePath = filePath
    this.home = home
  }

  private key(source: AccountSource, projectId: number) {
    if (!Number.isSafeInteger(projectId) || projectId <= 0)
      throw new Error("项目标识无效")
    return `${accountSourceHash(source)}:${projectId}`
  }

  private async read(): Promise<Record<string, string>> {
    try {
      const content = await readFile(this.filePath, "utf8")
      if (Buffer.byteLength(content) > MAX_CONTENT_BYTES)
        throw new Error("项目目录配置过大")
      const value: unknown = JSON.parse(content)
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("项目目录配置无效")
      if (
        Object.entries(value).some(
          ([key, directory]) =>
            !/^[a-f0-9]{64}:\d+$/.test(key) || typeof directory !== "string"
        )
      )
        throw new Error("项目目录配置无效")
      return value as Record<string, string>
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === "ENOENT") return {}
      throw new Error("本机项目目录读取失败", { cause })
    }
  }

  async get(source: AccountSource, projectId: number) {
    const key = this.key(source, projectId)
    await this.pending
    return (await this.read())[key] ?? null
  }

  async set(
    source: AccountSource,
    projectId: number,
    directory: string | null
  ) {
    const key = this.key(source, projectId)
    const operation = this.pending.then(async () => {
      const stored = await this.read()
      const selected =
        directory === null ? null : await this.validateDirectory(directory)
      if (selected) stored[key] = selected
      else delete stored[key]
      const content = JSON.stringify(stored, null, 2)
      if (Buffer.byteLength(content) > MAX_CONTENT_BYTES)
        throw new Error("项目目录配置过大")
      const temporary = `${this.filePath}.${randomUUID()}.tmp`
      try {
        await writeFile(temporary, content, { mode: 0o600, flag: "wx" })
        await rename(temporary, this.filePath)
      } finally {
        await rm(temporary, { force: true })
      }
      return selected
    })
    this.pending = operation.then(
      () => {},
      () => {}
    )
    return operation
  }

  async validateDirectory(directory: string) {
    const config = validateExecutionSettings(
      {
        backend: "local",
        workspaceDir: directory,
        workspaceMode: "custom",
      },
      this.home
    )
    const resolved = await validateExecutionWorkspace(config.workspaceDir)
    return validateExecutionSettings(
      { ...config, workspaceDir: resolved },
      this.home
    ).workspaceDir
  }

  private async requireDirectory(source: AccountSource, projectId: number) {
    const directory = await this.get(source, projectId)
    if (!directory) throw new Error("项目尚未关联本地目录")
    return directory
  }

  async openDirectory(
    source: AccountSource,
    projectId: number,
    openPath: (directory: string) => Promise<string>
  ) {
    const directory = await this.validateDirectory(
      await this.requireDirectory(source, projectId)
    )
    const error = await openPath(directory)
    if (error) throw new Error(`打开项目目录失败：${error}`)
    return directory
  }

  async copyDirectoryPath(
    source: AccountSource,
    projectId: number,
    writeText: (directory: string) => void | Promise<void>
  ) {
    const directory = await this.requireDirectory(source, projectId)
    await writeText(directory)
    return directory
  }

  async bindConversation(
    source: AccountSource,
    projectId: number,
    conversationId: string,
    profiles: ConversationExecutionProfiles
  ) {
    const key = executionProfileKey(source, conversationId)
    const directory = await this.get(source, projectId)
    if (!directory) return null
    const existing = await profiles.getExisting(key)
    if (existing) return existing.workspaceDir
    const workspaceDir = await this.validateDirectory(directory)
    const profile = await profiles.getOrCreate(key, {
      backend: "local",
      workspaceDir,
      workspaceMode: "custom",
    })
    return profile.workspaceDir
  }
}
