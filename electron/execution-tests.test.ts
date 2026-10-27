import { mkdtemp, readFile, realpath, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { createExecutionSession, type ExecutionSession } from "./execution"
import { createLocalLaunch } from "./execution-isolation"
import type { ExecutionCommandResult } from "../src/shared/execution"
import { readWorkspaceGitDiff, readWorkspaceGitStatus } from "./workspace-git"
import { validateWorkspaceWorktree } from "./workspace-worktree"

vi.mock("./workspace-git", () => ({
  readWorkspaceGitDiff: vi.fn(),
  readWorkspaceGitStatus: vi.fn(),
}))
vi.mock("./workspace-worktree", () => ({
  validateWorkspaceWorktree: vi.fn(async () => {}),
}))

// 仅替换沙箱启动适配，结果来自真实 shell 和受限进程执行器
vi.mock("./execution-isolation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./execution-isolation")>()
  return {
    ...actual,
    resolveLocalIsolation: vi.fn(async () => ({
      kind: "seatbelt",
      executable: "/usr/bin/sandbox-exec",
      shell: "/bin/bash",
      node: process.execPath,
      readRoots: [],
    })),
    createLocalLaunch: vi.fn<typeof actual.createLocalLaunch>(
      async (_isolation, cwd, _permission, executable, args, env) => ({
        executable,
        args,
        cwd,
        env: { PATH: "/usr/bin:/bin", ...env },
      })
    ),
  }
})

let session: ExecutionSession
let directory: string
beforeEach(async () => {
  directory = await realpath(await mkdtemp(path.join(tmpdir(), "buddy-tests-")))
  session = await createExecutionSession({
    backend: "local",
    workspaceDir: directory,
    permissionMode: "default",
    runtimeDirectory: "/managed-runtimes",
  })
  vi.mocked(createLocalLaunch).mockClear()
})
afterEach(async () => {
  await session.stop()
  await rm(directory, { recursive: true, force: true })
  vi.clearAllMocks()
})

it("reports structured command and test output with native exit codes", async () => {
  expect(await session.handle("run_bash", { command: "printf old" })).toBe(
    "exit 0\nold"
  )
  const result = (await session.handle("run_tests", {
    command: "printf '%s' /workspace; printf failure >&2; exit 7",
  })) as ExecutionCommandResult
  expect(result).toMatchObject({
    command: `printf '%s' '${directory}'; printf failure >&2; exit 7`,
    exit_code: 7,
    stdout: directory,
    stderr: "failure",
    reason: "completed",
    truncated: false,
    output_complete: true,
    result_available: true,
  })
  expect(result.started_at).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/)
  expect(result.duration_ms).toBeGreaterThanOrEqual(0)
  expect(await session.handle("run_tests", { command: "true" })).toMatchObject({
    exit_code: 0,
    reason: "completed",
    output_complete: true,
    result_available: true,
  })
  expect(
    await session.handle("run_command", {
      command: "printf command; printf failure >&2; exit 4",
    })
  ).toMatchObject({
    exit_code: 4,
    stdout: "command",
    stderr: "failure",
    reason: "completed",
    output_complete: true,
    result_available: true,
  })
})

it("dispatches only fixed Git reads and preserves staged versus unstaged scopes", async () => {
  vi.mocked(readWorkspaceGitStatus).mockResolvedValue({
    repository: true,
    branch: "main",
    upstream: null,
    ahead: 0,
    behind: 0,
    entries: [
      {
        path: "app.txt",
        index: "M",
        worktree: "M",
        staged: true,
        untracked: false,
      },
    ],
  })
  vi.mocked(readWorkspaceGitDiff).mockImplementation(
    async (_root, _input, _binding, scope) => ({
      repository: true,
      path: null,
      diff: `${scope} change`,
      additions: 1,
      deletions: 0,
      truncated: false,
    })
  )
  expect(await session.handle("git_status")).toContain('MM "app.txt"')
  expect(await session.handle("git_diff")).toBe(
    "已暂存差异：\nstaged change\n未暂存差异：\nunstaged change"
  )
  expect(
    vi.mocked(readWorkspaceGitDiff).mock.calls.map((call) => call[3])
  ).toEqual(["staged", "unstaged"])
  vi.mocked(readWorkspaceGitDiff).mockClear()
  expect(await session.handle("git_diff", { scope: "unstaged" })).toContain(
    "unstaged change"
  )
  expect(readWorkspaceGitDiff).toHaveBeenCalledExactlyOnceWith(
    directory,
    undefined,
    undefined,
    "unstaged"
  )
  for (const params of [
    { scope: "--ext-diff" },
    { scope: "staged", root: "/outside" },
    { gitDir: "/outside" },
  ])
    await expect(session.handle("git_diff", params)).rejects.toThrow(
      "Invalid Git"
    )
  await expect(
    session.handle("git_status", { root: "/outside" })
  ).rejects.toThrow("Invalid Git")
  expect(createLocalLaunch).not.toHaveBeenCalled()
})

it("revalidates bound worktree metadata before launch and blocks replaced bindings before writes", async () => {
  await session.stop()
  const worktree = {
    profileKey: "profile",
    sourceRepo: "/source",
    commonGitDir: "/source/.git",
    target: directory,
    gitDir: "/source/.git/worktrees/task",
    head: "a".repeat(40),
  }
  session = await createExecutionSession({
    backend: "local",
    workspaceDir: directory,
    permissionMode: "default",
    runtimeDirectory: "/managed",
    worktree,
  })
  expect(validateWorkspaceWorktree).toHaveBeenCalledWith(directory, worktree)
  expect(vi.mocked(createLocalLaunch).mock.calls.at(-1)?.[6]).toEqual([
    worktree.commonGitDir,
    worktree.gitDir,
  ])
  vi.mocked(createLocalLaunch).mockClear()
  vi.mocked(validateWorkspaceWorktree).mockRejectedValueOnce(
    new Error("Worktree binding changed")
  )
  await expect(
    session.handle("write_file", { path: "new.txt", content: "blocked" })
  ).rejects.toThrow("binding changed")
  expect(createLocalLaunch).not.toHaveBeenCalled()
  await expect(readFile(path.join(directory, "new.txt"))).rejects.toMatchObject(
    { code: "ENOENT" }
  )
})

it("reports deadlines and user cancellation without synthetic exit codes", async () => {
  const timed = await session.handle("run_tests", {
    command: "printf partial; sleep 10",
    timeout_ms: 100,
  })
  expect(timed).toMatchObject({
    exit_code: null,
    stdout: "partial",
    reason: "deadline",
    output_complete: false,
    result_available: true,
  })
  const pending = session.handle("run_tests", {
    command: "printf started > started; sleep 10",
  })
  await vi.waitFor(async () =>
    expect(await readFile(path.join(directory, "started"), "utf8")).toBe(
      "started"
    )
  )
  await session.stop()
  expect(await pending).toMatchObject({
    exit_code: null,
    reason: "cancelled",
    output_complete: false,
    result_available: true,
  })
})

it("bounds escaped test output within the desktop RPC frame", async () => {
  const result = (await session.handle("run_tests", {
    command: "head -c 800000 /dev/zero",
  })) as ExecutionCommandResult
  expect(result).toMatchObject({
    reason: "output-limit",
    truncated: true,
    output_complete: false,
    result_available: true,
  })
  expect(Buffer.byteLength(result.stdout + result.stderr)).toBeLessThanOrEqual(
    512 * 1024
  )
  expect(result.stdout).toContain("\u0000")
  expect(
    Buffer.byteLength(
      JSON.stringify({ id: "a".repeat(32), result, error: null })
    )
  ).toBeLessThan(4 * 1024 * 1024)
  await expect(
    session.handle("run_tests", {
      command: "echo " + "/workspace ".repeat(5500),
    })
  ).rejects.toThrow("Mapped command exceeds size limit")
})

it("distinguishes launch errors and signal termination from normal test failures", async () => {
  vi.mocked(createLocalLaunch).mockResolvedValueOnce({
    executable: path.join(directory, "missing-shell"),
    args: [],
    cwd: directory,
    env: {},
  })
  const failed = await session.handle("run_tests", { command: "true" })
  expect(failed).toMatchObject({
    exit_code: null,
    reason: "execution-error",
    output_complete: false,
    result_available: false,
  })
  const killed = await session.handle("run_tests", { command: "kill -TERM $$" })
  expect(killed).toMatchObject({
    exit_code: null,
    reason: "execution-error",
    output_complete: false,
    result_available: true,
  })
})

it("preserves cancellation while shell launch is still preparing", async () => {
  let release: () => void = () => {}
  vi.mocked(createLocalLaunch).mockImplementationOnce(
    async (_isolation, cwd, _permission, executable, args) => {
      await new Promise<void>((resolve) => {
        release = resolve
      })
      return { executable, args, cwd, env: { PATH: "/usr/bin:/bin" } }
    }
  )
  const pending = session.handle("run_tests", { command: "true" })
  await vi.waitFor(() => expect(createLocalLaunch).toHaveBeenCalledOnce())
  await session.stop()
  release()
  expect(await pending).toMatchObject({
    exit_code: null,
    reason: "cancelled",
    output_complete: false,
    result_available: false,
  })
})

it("bounds decoded invalid UTF-8 without splitting replacement characters", async () => {
  const result = (await session.handle("run_tests", {
    command:
      "head -c 262144 /dev/zero | tr '\\000' '\\377'; printf '\\377' >&2",
  })) as ExecutionCommandResult
  expect(result).toMatchObject({
    exit_code: 0,
    reason: "output-limit",
    truncated: true,
    output_complete: false,
    result_available: true,
  })
  expect(result.stdout).toMatch(/^\uFFFD+$/)
  expect(result.stdout.length).toBe(Math.floor((512 * 1024) / 3))
  expect(result.stderr).toBe("")
  expect(Buffer.byteLength(result.stdout + result.stderr)).toBeLessThanOrEqual(
    512 * 1024
  )
})
