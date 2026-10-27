import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
} from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { executionProfileKey } from "./account-source"
import { ConversationExecutionProfiles } from "./desktop-execution-settings"
import { ProjectWorkspaces } from "./project-workspace"

const source = { backendUrl: "https://buddy.example/api/v1", accountId: "1" }
let directory: string
let first: string
let second: string
let file: string
let store: ProjectWorkspaces
let profiles: ConversationExecutionProfiles

beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "buddy-project-workspace-"))
  first = path.join(directory, "project-a")
  second = path.join(directory, "project-b")
  await Promise.all([mkdir(first), mkdir(second)])
  file = path.join(directory, "projects.json")
  store = new ProjectWorkspaces(file, os.homedir())
  profiles = new ConversationExecutionProfiles(
    path.join(directory, "profiles.json"),
    os.homedir()
  )
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

describe("device local project workspaces", () => {
  it("persists a source folder without touching the project and isolates accounts and backends", async () => {
    await store.set(source, 7, first)
    store = new ProjectWorkspaces(file, os.homedir())
    expect(await store.get(source, 7)).toBe(await realpath(first))
    expect(await store.get({ ...source, accountId: "2" }, 7)).toBeNull()
    expect(
      await store.get(
        { ...source, backendUrl: "https://other.example/api/v1" },
        7
      )
    ).toBeNull()
    expect(await store.get(source, 8)).toBeNull()
    expect(await readFile(file, "utf8")).not.toContain(source.backendUrl)
  })

  it("binds new coding chats to the project folder and keeps existing chats stable after replacing it", async () => {
    await store.set(source, 7, first)
    expect(await store.bindConversation(source, 7, "chat-one", profiles)).toBe(
      await realpath(first)
    )
    await store.set(source, 7, second)
    expect(await store.bindConversation(source, 7, "chat-one", profiles)).toBe(
      await realpath(first)
    )
    expect(await store.bindConversation(source, 7, "chat-two", profiles)).toBe(
      await realpath(second)
    )
    expect(
      await profiles.getExisting(executionProfileKey(source, "chat-two"))
    ).toEqual({
      backend: "local",
      workspaceDir: await realpath(second),
      workspaceMode: "custom",
    })
    await store.set(source, 7, null)
    expect(
      await store.bindConversation(source, 7, "chat-three", profiles)
    ).toBeNull()
    expect(
      await profiles.getExisting(executionProfileKey(source, "chat-three"))
    ).toBeUndefined()
    expect(
      (await profiles.getExisting(executionProfileKey(source, "chat-two")))
        ?.workspaceDir
    ).toBe(await realpath(second))
  })

  it("rejects unavailable, relative, protected and symlinked protected folders", async () => {
    for (const selected of [
      "relative",
      os.homedir(),
      path.parse(directory).root,
      path.join(directory, "missing"),
    ]) {
      await expect(store.set(source, 7, selected)).rejects.toThrow()
    }
    const link = path.join(directory, "home-link")
    await symlink(os.homedir(), link, "dir")
    await expect(store.set(source, 7, link)).rejects.toThrow()
    expect(await store.get(source, 7)).toBeNull()
    await store.set(source, 7, first)
    await rm(first, { recursive: true })
    await expect(
      store.bindConversation(source, 7, "missing-folder-chat", profiles)
    ).rejects.toThrow()
    expect(
      await profiles.getExisting(
        executionProfileKey(source, "missing-folder-chat")
      )
    ).toBeUndefined()
  })

  it("serializes simultaneous folder changes without dropping other projects", async () => {
    await Promise.all([
      store.set(source, 7, first),
      store.set(source, 8, second),
    ])
    expect(await store.get(source, 7)).toBe(await realpath(first))
    expect(await store.get(source, 8)).toBe(await realpath(second))
    await expect(store.set(source, -1, first)).rejects.toThrow("项目标识无效")
  })

  it("opens the verified project directory and reports native failures without changing its binding", async () => {
    await store.set(source, 7, first)
    const before = await readFile(file, "utf8")
    const openPath = vi.fn(async () => "")
    expect(await store.openDirectory(source, 7, openPath)).toBe(
      await realpath(first)
    )
    expect(openPath).toHaveBeenCalledExactlyOnceWith(await realpath(first))
    openPath.mockResolvedValueOnce("The system could not open this folder")
    await expect(store.openDirectory(source, 7, openPath)).rejects.toThrow(
      "打开项目目录失败：The system could not open this folder"
    )
    expect(await readFile(file, "utf8")).toBe(before)
  })

  it("copies the complete bound path even when its directory has become unavailable", async () => {
    const selected = path.join(directory, "目录 with spaces")
    await mkdir(selected)
    await store.set(source, 7, selected)
    const canonical = await realpath(selected)
    await rm(selected, { recursive: true })
    const writeText = vi.fn(async () => {})
    expect(await store.copyDirectoryPath(source, 7, writeText)).toBe(canonical)
    expect(writeText).toHaveBeenCalledExactlyOnceWith(canonical)
    writeText.mockRejectedValueOnce(new Error("Clipboard unavailable"))
    await expect(store.copyDirectoryPath(source, 7, writeText)).rejects.toThrow(
      "Clipboard unavailable"
    )
    expect(await store.get(source, 7)).toBe(canonical)
  })

  it("rejects projects without a folder and isolates native operations by account and backend", async () => {
    await store.set(source, 7, first)
    const openPath = vi.fn(async () => "")
    const writeText = vi.fn(async () => {})
    for (const selectedSource of [
      { ...source, accountId: "2" },
      { ...source, backendUrl: "https://other.example/api/v1" },
    ]) {
      await expect(
        store.openDirectory(selectedSource, 7, openPath)
      ).rejects.toThrow("项目尚未关联本地目录")
      await expect(
        store.copyDirectoryPath(selectedSource, 7, writeText)
      ).rejects.toThrow("项目尚未关联本地目录")
    }
    await expect(store.openDirectory(source, 8, openPath)).rejects.toThrow(
      "项目尚未关联本地目录"
    )
    await expect(store.copyDirectoryPath(source, 8, writeText)).rejects.toThrow(
      "项目尚未关联本地目录"
    )
    expect(openPath).not.toHaveBeenCalled()
    expect(writeText).not.toHaveBeenCalled()
  })

  it("does not open an unavailable or newly protected bound directory", async () => {
    await store.set(source, 7, first)
    const openPath = vi.fn(async () => "")
    await rm(first, { recursive: true })
    await expect(store.openDirectory(source, 7, openPath)).rejects.toThrow()
    await symlink(os.homedir(), first, "dir")
    await expect(store.openDirectory(source, 7, openPath)).rejects.toThrow()
    expect(openPath).not.toHaveBeenCalled()
  })
})
