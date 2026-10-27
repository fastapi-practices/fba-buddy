import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { expect, it, vi } from "vitest"
import { executionProfileKey } from "./account-source"
import {
  ConversationExecutionProfiles,
  defaultExecutionSettings,
  ensureDefaultWorkspace,
  readExecutionSettings,
  validateExecutionSettings,
  writeExecutionSettings,
} from "./desktop-execution-settings"

it.each(["local", "sandbox"] as const)(
  "locks the selected %s location when a conversation starts and restores it after restart",
  async (backend) => {
    const home = await mkdtemp(path.join(os.tmpdir(), "buddy-location-test-"))
    const file = path.join(home, "profiles.json")
    const key = executionProfileKey(
      { accountId: "7", backendUrl: "http://localhost/api/v1" },
      "location-chat"
    )
    const defaults = defaultExecutionSettings(home)
    try {
      const profiles = new ConversationExecutionProfiles(file, home)
      const draft = await profiles.configureEnvironment(
        key,
        defaults,
        "local",
        undefined,
        backend
      )
      expect(draft.backend).toBe(backend)
      const locked = await profiles.lockEnvironment(key, defaults)
      expect(locked.backend).toBe(backend)
      const restarted = new ConversationExecutionProfiles(file, home)
      expect((await restarted.getExisting(key))?.locked).toBe(true)
      expect(
        (
          await restarted.environment(key, {
            ...defaults,
            backend: "sandbox",
          })
        ).backend
      ).toBe(backend)
      await expect(
        restarted.configureEnvironment(
          key,
          defaults,
          "local",
          undefined,
          backend === "local" ? "sandbox" : "local"
        )
      ).rejects.toThrow("对话开始后不能更改工作位置")
      await expect(
        restarted.handoffEnvironment(key, "worktree")
      ).rejects.toThrow("对话开始后不能更改工作位置")
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  }
)

it("defaults to the user's fbabuddy directory and validates protected paths", () => {
  const defaults = defaultExecutionSettings("/Users/demo")
  expect(defaults).toEqual({
    backend: "local",
    workspaceDir: "/Users/demo/.fbabuddy",
    workspaceMode: "auto",
  })
  for (const workspaceDir of [
    "/",
    "/Users/demo",
    "/etc",
    "relative",
    "/tmp/bad\0path",
  ]) {
    expect(() =>
      validateExecutionSettings({ ...defaults, workspaceDir }, "/Users/demo")
    ).toThrow()
  }
  expect(() =>
    validateExecutionSettings(
      { ...defaults, backend: "unknown" },
      "/Users/demo"
    )
  ).toThrow("执行后端")
  expect(() =>
    validateExecutionSettings(
      { ...defaults, workspaceMode: undefined },
      "/Users/demo"
    )
  ).toThrow("工作区模式")
  expect(
    validateExecutionSettings(
      { ...defaults, workspaceDir: "/Users/demo/Documents/FbaBuddy" },
      "/Users/demo"
    ).workspaceDir
  ).toBe("/Users/demo/Documents/FbaBuddy")
})

it.each([
  ["darwin", "/Users/demo", "/Users/demo/.fbabuddy"],
  ["linux", "/home/demo", "/home/demo/.fbabuddy"],
  ["win32", "C:\\Users\\demo", "C:\\Users\\demo\\.fbabuddy"],
] as const)("resolves dedicated paths on %s", (platform, home, expected) => {
  const config = defaultExecutionSettings(home, platform)
  expect(config.workspaceDir).toBe(expected)
  expect(
    validateExecutionSettings(
      { ...config, workspaceDir: "~/.fbabuddy" },
      home,
      platform
    ).workspaceDir
  ).toBe(expected)
  for (const workspaceDir of [
    "",
    "relative",
    "~someone/project",
    "~",
    "~/..",
    "bad\npath",
    "bad\0path",
    ...(platform === "win32"
      ? [
          "C:project",
          "\\project",
          "c:\\users\\DEMO",
          "C:\\Windows",
          "D:\\",
          "\\\\server\\share\\",
        ]
      : ["/"]),
  ]) {
    expect(() =>
      validateExecutionSettings({ ...config, workspaceDir }, home, platform)
    ).toThrow()
  }
  const custom = platform === "win32" ? "D:\\Projects\\custom" : "/tmp/custom"
  expect(
    validateExecutionSettings(
      { ...config, workspaceDir: custom },
      home,
      platform
    ).workspaceDir
  ).toBe(custom)
  if (platform === "win32") {
    expect(
      validateExecutionSettings(
        { ...config, workspaceDir: "~\\.fbabuddy" },
        home,
        platform
      ).workspaceDir
    ).toBe(expected)
    expect(
      validateExecutionSettings(
        { ...config, workspaceDir: "\\\\server\\share\\project" },
        home,
        platform
      ).workspaceDir
    ).toBe("\\\\server\\share\\project")
  }
})

it("creates only the default directory and rejects files and symlinks", async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), "buddy-workspace-test-"))
  const config = defaultExecutionSettings(home)
  try {
    await ensureDefaultWorkspace(config, home)
    expect((await lstat(config.workspaceDir)).isDirectory()).toBe(true)
    await ensureDefaultWorkspace(config, home)
    const custom = path.join(home, "custom")
    await ensureDefaultWorkspace({ ...config, workspaceDir: custom }, home)
    await expect(lstat(custom)).rejects.toMatchObject({ code: "ENOENT" })
    await rm(config.workspaceDir, { recursive: true })
    await writeFile(config.workspaceDir, "not a directory")
    await expect(ensureDefaultWorkspace(config, home)).rejects.toThrow(
      "独立目录"
    )
    await rm(config.workspaceDir)
    await mkdir(custom)
    await symlink(
      custom,
      config.workspaceDir,
      process.platform === "win32" ? "junction" : "dir"
    )
    await expect(ensureDefaultWorkspace(config, home)).rejects.toThrow(
      "符号链接"
    )
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

it.each(["read", "write"] as const)(
  "rejects a non-default directory in automatic settings on %s",
  async (operation) => {
    const home = await mkdtemp(
      path.join(os.tmpdir(), "buddy-default-validation-")
    )
    try {
      const configPath = path.join(home, "settings.json")
      const otherRoot = path.join(home, "other-workspace")
      const stored = {
        backend: "local",
        workspaceDir: otherRoot,
        workspaceMode: "auto",
      }
      if (operation === "read")
        await writeFile(configPath, JSON.stringify(stored))
      const operationResult =
        operation === "read"
          ? readExecutionSettings(configPath, home)
          : writeExecutionSettings(configPath, stored, home)
      await expect(operationResult).rejects.toThrow(
        operation === "read" ? "读取失败" : "自动工作区必须使用默认目录"
      )
      await expect(lstat(otherRoot)).rejects.toMatchObject({
        code: "ENOENT",
      })
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  }
)

it("keeps explicit custom settings at their selected directory", async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), "buddy-custom-default-"))
  try {
    const configPath = path.join(home, "settings.json")
    for (const workspaceDir of [
      path.join(home, ".fbabuddy"),
      path.join(home, "Documents", "FbaBuddy"),
      path.join(home, "custom-workspace"),
    ]) {
      const config = { backend: "local", workspaceDir, workspaceMode: "custom" }
      await writeFile(configPath, JSON.stringify(config))
      expect(await readExecutionSettings(configPath, home)).toEqual(config)
    }
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

it("rejects automatic conversation bindings outside their task directory", async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), "buddy-task-validation-"))
  try {
    const file = path.join(home, "profiles.json")
    const defaults = defaultExecutionSettings(home)
    await writeFile(file, JSON.stringify({ "user:conversation": defaults }))
    const profiles = new ConversationExecutionProfiles(file, home)
    await expect(profiles.getExisting("user:conversation")).rejects.toThrow(
      "自动对话工作区必须使用任务目录"
    )
    await expect(
      profiles.getOrCreate("user:conversation", defaults)
    ).rejects.toThrow("自动对话工作区必须使用任务目录")
    await expect(lstat(defaults.workspaceDir)).rejects.toMatchObject({
      code: "ENOENT",
    })
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

it("preserves task files and bindings across restarts on later dates", async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), "buddy-task-default-"))
  vi.useFakeTimers({ toFake: ["Date"] })
  try {
    vi.setSystemTime(new Date(2026, 9, 13))
    const file = path.join(home, "profiles.json")
    const defaults = defaultExecutionSettings(home)
    const original = new ConversationExecutionProfiles(file, home)
    const existing = await original.getOrCreate("user:existing", defaults)
    const { workspaceDir } = existing
    await writeFile(path.join(workspaceDir, "result.txt"), "existing result")
    vi.setSystemTime(new Date(2026, 9, 14))
    const profiles = new ConversationExecutionProfiles(file, home)
    expect(await profiles.getExisting("user:existing")).toEqual(existing)
    expect(await profiles.getOrCreate("user:existing", defaults)).toEqual(
      existing
    )
    expect(await readFile(path.join(workspaceDir, "result.txt"), "utf8")).toBe(
      "existing result"
    )
    const created = await profiles.getOrCreate("user:new", defaults)
    expect(workspaceDir).toContain(path.join("2026", "10", "13"))
    expect(created.workspaceDir).toContain(path.join("2026", "10", "14"))
    expect(
      created.workspaceDir.startsWith(path.join(home, ".fbabuddy") + path.sep)
    ).toBe(true)
    expect(
      (await lstat(path.join(created.workspaceDir, "inbound"))).isDirectory()
    ).toBe(true)
  } finally {
    vi.useRealTimers()
    await rm(home, { recursive: true, force: true })
  }
})

it("persists desktop selections and pins existing conversations", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "buddy-profile-test-"))
  try {
    const home = dir
    const configPath = path.join(dir, "settings.json")
    const defaults = await readExecutionSettings(configPath, home)
    expect(defaults).toEqual(defaultExecutionSettings(home))
    await writeFile(configPath, JSON.stringify(defaults))
    expect(await readExecutionSettings(configPath, home)).toEqual(defaults)
    await writeExecutionSettings(
      configPath,
      { ...defaults, backend: "local" },
      home
    )
    expect((await readExecutionSettings(configPath, home)).backend).toBe(
      "local"
    )
    await writeExecutionSettings(
      configPath,
      { ...defaults, backend: "sandbox" },
      home
    )
    expect(await readExecutionSettings(configPath, home)).toEqual({
      ...defaults,
      backend: "sandbox",
    })
    const file = path.join(dir, "profiles.json")
    const profiles = new ConversationExecutionProfiles(file, home)
    const first = await profiles.getOrCreate("user:conversation-1", defaults)
    expect(first.workspaceMode).toBe("auto")
    expect(first.workspaceDir).toContain(path.join(home, ".fbabuddy"))
    expect(
      (await lstat(path.join(first.workspaceDir, "inbound"))).isDirectory()
    ).toBe(true)
    const next = {
      ...defaults,
      backend: "sandbox" as const,
      workspaceDir: "/Users/demo/Documents/FbaBuddy",
      workspaceMode: "custom" as const,
    }
    expect(await profiles.getOrCreate("user:conversation-1", next)).toEqual(
      first
    )
    expect(await profiles.getOrCreate("user:conversation-2", next)).toEqual(
      next
    )
    expect(
      await new ConversationExecutionProfiles(file, home).getOrCreate(
        "user:conversation-1",
        next
      )
    ).toEqual(first)
    await expect(profiles.getOrCreate("", next)).rejects.toThrow("会话标识")
    await writeFile(
      configPath,
      JSON.stringify({
        ...defaults,
        backend: "invalid",
      })
    )
    await expect(readExecutionSettings(configPath, home)).rejects.toThrow(
      "读取失败"
    )
    await writeFile(
      file,
      JSON.stringify({
        "user:conversation-invalid": { ...defaults, backend: "invalid" },
      })
    )
    await expect(
      profiles.getOrCreate("user:conversation-invalid", defaults)
    ).rejects.toThrow("执行后端无效")
    await writeFile(configPath, "invalid JSON")
    await expect(readExecutionSettings(configPath, home)).rejects.toThrow(
      "读取失败"
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

it("deletes only the requested backend-account execution profile", async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), "buddy-profile-source-"))
  try {
    const file = path.join(home, "profiles.json")
    const profiles = new ConversationExecutionProfiles(file, home)
    const source = { backendUrl: "https://one.test/api/v1", accountId: "1" }
    const other = { ...source, backendUrl: "https://two.test/api/v1" }
    const defaults = defaultExecutionSettings(home)
    const firstKey = executionProfileKey(source, "conversation")
    const otherKey = executionProfileKey(other, "conversation")
    await profiles.getOrCreate(firstKey, defaults)
    await profiles.getOrCreate(otherKey, {
      ...defaults,
      backend: "sandbox",
    })
    await profiles.delete(firstKey)
    const persisted = JSON.parse(await readFile(file, "utf8")) as Record<
      string,
      unknown
    >
    expect(persisted).not.toHaveProperty(firstKey)
    expect(persisted).toHaveProperty(otherKey)
    await profiles.delete(firstKey)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
