import { execFile } from "node:child_process"
import { promisify } from "node:util"
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { accountSourceHash, executionProfileKey } from "./account-source"
import {
  ConversationExecutionProfiles,
  defaultExecutionSettings,
  validateExecutionSettings,
} from "./desktop-execution-settings"
import { beginWorkspaceRun } from "./workspace-run"

vi.mock("node:fs/promises", async (original) => {
  const actual = await original<typeof import("node:fs/promises")>()
  return { ...actual, rename: vi.fn(actual.rename) }
})

const exec = promisify(execFile)
const account = { backendUrl: "https://buddy.test/api/v1", accountId: "42" }
const sourceKey = executionProfileKey(account, "source")
const targetKey = executionProfileKey(account, "target")
let home: string
let repository: string
let file: string
let profiles: ConversationExecutionProfiles

async function git(...args: string[]) {
  return (
    await exec("git", ["-C", repository, ...args], {
      env: {
        PATH: process.env.PATH,
        HOME: home,
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_GLOBAL: os.devNull,
        GIT_AUTHOR_NAME: "Test",
        GIT_AUTHOR_EMAIL: "test@example.invalid",
        GIT_COMMITTER_NAME: "Test",
        GIT_COMMITTER_EMAIL: "test@example.invalid",
      },
    })
  ).stdout.trim()
}

function localConfig() {
  return {
    backend: "local" as const,
    workspaceDir: repository,
    workspaceMode: "custom" as const,
  }
}

async function createWorktree(key = targetKey, branch = "main") {
  await profiles.configureEnvironment(key, localConfig(), "worktree", branch)
  return profiles.materialize(key)
}

beforeEach(async () => {
  home = await realpath(
    await mkdtemp(path.join(os.tmpdir(), "buddy-worktree-profile-"))
  )
  repository = path.join(home, "project")
  file = path.join(home, "profiles.json")
  await mkdir(repository)
  await git("init", "-b", "main")
  await writeFile(path.join(repository, "main.txt"), "committed\n")
  await git("add", "main.txt")
  await git("-c", "core.hooksPath=" + os.devNull, "commit", "-m", "fixture")
  profiles = new ConversationExecutionProfiles(file, home)
  await profiles.getOrCreate(sourceKey, localConfig())
})

afterEach(async () => {
  vi.mocked(rename).mockClear()
  await rm(home, { recursive: true, force: true })
})

it("stores a draft intent and creates a named worktree only when execution is prepared", async () => {
  await writeFile(path.join(repository, "main.txt"), "source edits\n")
  const pending = await profiles.configureEnvironment(
    targetKey,
    localConfig(),
    "worktree",
    "main"
  )
  expect(pending).toMatchObject({
    mode: "worktree",
    state: "pending",
    path: null,
    baseBranch: "main",
    sourcePath: repository,
  })
  expect(await profiles.listWorktrees(accountSourceHash(account))).toEqual([])
  expect(
    (await git("worktree", "list", "--porcelain")).match(/^worktree /gm)
  ).toHaveLength(1)
  const restarted = new ConversationExecutionProfiles(file, home)
  const target = await restarted.materialize(targetKey)
  expect(target.worktree?.branch).toMatch(/^buddy\/worktree-/)
  expect(
    await readFile(path.join(target.workspaceDir, "main.txt"), "utf8")
  ).toBe("source edits\n")
  expect(await readFile(path.join(repository, "main.txt"), "utf8")).toBe(
    "source edits\n"
  )
  expect(await git("branch", "--show-current")).toBe("main")
  expect(
    await Promise.all([
      restarted.materialize(targetKey),
      restarted.materialize(targetKey),
    ])
  ).toEqual([target, target])
  expect(await restarted.environment(targetKey, localConfig())).toMatchObject({
    mode: "worktree",
    state: "ready",
    path: target.workspaceDir,
    branch: target.worktree!.branch,
  })
})

it("uses a selected base branch without changing the root checkout or copying unrelated edits", async () => {
  await git("branch", "other-base")
  await writeFile(path.join(repository, "main.txt"), "root private edits\n")
  const target = await createWorktree(targetKey, "other-base")
  expect(
    await readFile(path.join(target.workspaceDir, "main.txt"), "utf8")
  ).toBe("committed\n")
  expect(await git("branch", "--show-current")).toBe("main")
  expect(await readFile(path.join(repository, "main.txt"), "utf8")).toBe(
    "root private edits\n"
  )
  await profiles.configureEnvironment(
    executionProfileKey(account, "cancelled"),
    localConfig(),
    "worktree",
    "main"
  )
  const cancelled = await profiles.configureEnvironment(
    executionProfileKey(account, "cancelled"),
    localConfig(),
    "local"
  )
  expect(cancelled).toMatchObject({
    mode: "local",
    state: "local",
    path: repository,
  })
})

it("requires a valid branch and a local Git workspace before saving a pending intent", async () => {
  const before = await readFile(file, "utf8")
  await expect(
    profiles.configureEnvironment(
      targetKey,
      localConfig(),
      "worktree",
      "missing"
    )
  ).rejects.toThrow("基础分支")
  await expect(
    profiles.configureEnvironment(
      targetKey,
      { ...localConfig(), backend: "sandbox" },
      "worktree",
      "main"
    )
  ).rejects.toThrow("服务端沙箱不支持 Worktree")
  expect(await readFile(file, "utf8")).toBe(before)
})

it("keeps linked authorization for history forks and rejects forged persisted bindings", async () => {
  const target = await createWorktree()
  const historyKey = executionProfileKey(account, "history")
  const history = await profiles.fork(targetKey, historyKey)
  expect(history.workspaceDir).toBe(target.workspaceDir)
  expect(history.worktree?.profileKey).toBe(historyKey)
  expect(validateExecutionSettings(history, home)).not.toHaveProperty(
    "worktree"
  )
  expect(
    await profiles.getOrCreate(historyKey, defaultExecutionSettings(home))
  ).toEqual(history)
  await expect(profiles.handoffEnvironment(targetKey, "local")).rejects.toThrow(
    "其他对话"
  )
  const persisted = JSON.parse(await readFile(file, "utf8"))
  persisted[targetKey].worktree.profileKey = sourceKey
  await writeFile(file, JSON.stringify(persisted))
  await expect(profiles.getExisting(targetKey)).rejects.toThrow("对话授权")
})

it("moves staged and unstaged changes to a worktree and back within the same conversation", async () => {
  await writeFile(path.join(repository, "main.txt"), "staged edit\n")
  await git("add", "main.txt")
  await writeFile(
    path.join(repository, "main.txt"),
    "staged edit\nunstaged edit\n"
  )
  await writeFile(path.join(repository, "new.txt"), "untracked\n")
  const into = await profiles.handoffEnvironment(sourceKey, "worktree")
  expect(into).toMatchObject({ mode: "worktree", state: "ready" })
  const checkout = (await profiles.getExisting(sourceKey))!
  expect(await git("status", "--porcelain")).toBe("")
  const targetStatus = (
    await exec("git", ["-C", checkout.workspaceDir, "status", "--porcelain"])
  ).stdout
  expect(targetStatus).toContain("MM main.txt")
  expect(targetStatus).toContain("?? new.txt")
  const back = await profiles.handoffEnvironment(sourceKey, "local")
  expect(back).toMatchObject({
    mode: "local",
    path: repository,
    associatedWorktreePath: checkout.workspaceDir,
  })
  expect(await git("status", "--porcelain")).toContain("MM main.txt")
  expect(await readFile(path.join(repository, "new.txt"), "utf8")).toBe(
    "untracked\n"
  )
  expect(
    (await profiles.listWorktrees(accountSourceHash(account)))[0]
  ).toMatchObject({
    conversationId: "source",
    associated: true,
    path: checkout.workspaceDir,
  })
  const again = await profiles.handoffEnvironment(sourceKey, "worktree")
  expect(again.path).toBe(checkout.workspaceDir)
  expect(await git("status", "--porcelain")).toBe("")
  expect(await git("stash", "list")).toBe("")
}, 15_000)

it("restores both original working trees after conflicting transfer", async () => {
  const target = await createWorktree()
  await writeFile(
    path.join(target.workspaceDir, "main.txt"),
    "worktree conflict\n"
  )
  await writeFile(path.join(repository, "main.txt"), "local conflict\n")
  await expect(profiles.handoffEnvironment(targetKey, "local")).rejects.toThrow(
    "已恢复原工作区"
  )
  expect((await profiles.getExisting(targetKey))!.workspaceDir).toBe(
    target.workspaceDir
  )
  expect(await readFile(path.join(repository, "main.txt"), "utf8")).toBe(
    "local conflict\n"
  )
  expect(
    await readFile(path.join(target.workspaceDir, "main.txt"), "utf8")
  ).toBe("worktree conflict\n")
  expect(await git("stash", "list")).toBe("")
})

it("refuses switching while a local execution is active", async () => {
  const run = await beginWorkspaceRun(repository)
  try {
    await expect(
      profiles.handoffEnvironment(sourceKey, "worktree")
    ).rejects.toThrow("仍有执行")
  } finally {
    await run.finish()
  }
  expect((await profiles.getExisting(sourceKey))!.workspaceDir).toBe(repository)
})

it("preserves worktree files on conversation deletion and removes them only when cleanup is requested", async () => {
  const target = await createWorktree()
  await writeFile(
    path.join(target.workspaceDir, "draft.txt"),
    "keep this work\n"
  )
  await profiles.delete(targetKey)
  expect(
    await readFile(path.join(target.workspaceDir, "draft.txt"), "utf8")
  ).toBe("keep this work\n")
  expect(
    (await profiles.listWorktrees(accountSourceHash(account)))[0]
  ).toMatchObject({ conversationId: "target", state: "orphan", error: null })
  expect(
    await profiles.listWorktrees(
      accountSourceHash({ ...account, accountId: "other" })
    )
  ).toEqual([])
  await expect(profiles.manageWorktree(targetKey, "remove")).rejects.toThrow(
    "未保存变更"
  )
  await profiles.manageWorktree(targetKey, "remove", true)
  await expect(
    readFile(path.join(target.workspaceDir, "draft.txt"))
  ).rejects.toMatchObject({ code: "ENOENT" })
  expect((await profiles.getExisting(targetKey))!.workspaceDir).toBe(repository)
  expect(await git("branch", "--list", target.worktree!.branch!)).toContain(
    target.worktree!.branch
  )
})

it("preserves draft intent when materialized profile persistence fails", async () => {
  await profiles.configureEnvironment(
    targetKey,
    localConfig(),
    "worktree",
    "main"
  )
  vi.mocked(rename).mockRejectedValueOnce(new Error("disk full"))
  await expect(profiles.materialize(targetKey)).rejects.toThrow("保存失败")
  expect((await profiles.getExisting(targetKey))!.worktreeIntent).toMatchObject(
    { baseBranch: "main" }
  )
  expect(
    (await git("worktree", "list", "--porcelain")).match(/^worktree /gm)
  ).toHaveLength(1)
  expect((await profiles.materialize(targetKey)).worktree).toBeDefined()
})
