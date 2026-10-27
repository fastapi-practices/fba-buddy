import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { createExecutionSession } from "./execution"
import {
  prepareLocalExecution,
  startLocalExecution,
  stopLocalExecution,
  stopLocalExecutions,
} from "./local-execution"
import type { ExecutionSettings } from "../src/shared/execution"
import type { ExecutionResult } from "./execution"
import { validateWorkspaceWorktree } from "./workspace-worktree"
import { invalidateWorkspacePreparations } from "./workspace-run"

vi.mock("node:fs/promises", () => ({ mkdir: vi.fn(async () => {}) }))
vi.mock("./execution-isolation", () => ({
  validateExecutionWorkspace: vi.fn(async (directory: string) => directory),
}))
vi.mock("./execution", () => ({ createExecutionSession: vi.fn() }))
vi.mock("./workspace-worktree", () => ({
  validateWorkspaceWorktree: vi.fn(async () => {}),
}))
const config: ExecutionSettings = {
  backend: "local",
  workspaceDir: "/workspace-test",
  workspaceMode: "custom",
}
const stop = vi.fn(async () => {})
const handle = vi.fn(async (): Promise<ExecutionResult> => "result")

class TestSocket {
  static OPEN = 1
  static sockets: TestSocket[] = []
  readyState = 1
  bufferedAmount = 0
  onopen?: () => void
  onmessage?: (message: { data: string }) => void
  onerror?: () => void
  onclose?: () => void
  send = vi.fn()
  close = vi.fn(() => {
    this.readyState = 3
    this.onclose?.()
  })
  constructor() {
    TestSocket.sockets.push(this)
  }
  message(value: unknown) {
    this.onmessage?.({ data: JSON.stringify(value) })
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  TestSocket.sockets = []
  vi.stubGlobal("WebSocket", TestSocket)
  vi.mocked(createExecutionSession).mockResolvedValue({
    cwd: config.workspaceDir,
    handle,
    stop,
  })
})
afterEach(async () => {
  await stopLocalExecutions()
  vi.unstubAllGlobals()
})

async function connect(owner = 1) {
  const preparation = await prepareLocalExecution(config, owner)
  const payload = {
    bridgeId: "a".repeat(32),
    preparationId: preparation.preparationId,
    ticket: "secret".repeat(8),
    url: `wss://example.test/api/v1/execution/bridges/${"a".repeat(32)}`,
    permissionMode: "auto" as const,
  }
  const pending = startLocalExecution(payload, owner, "/managed-runtimes")
  const socket = TestSocket.sockets.at(-1)!
  const ready = {
    type: "ready",
    backend: "local",
    cwd: config.workspaceDir,
    permission_mode: "auto",
    capabilities: [],
    limits: { max_file_bytes: 100, bash_timeout_seconds: 1 },
  }
  return { socket, payload, pending, ready }
}

it("binds prepared workspace and permissions to the authenticated ready message", async () => {
  const connection = await connect()
  connection.socket.onopen?.()
  expect(JSON.parse(connection.socket.send.mock.calls[0][0])).toEqual({
    ticket: connection.payload.ticket,
  })
  connection.socket.message(connection.ready)
  await connection.pending
  expect(createExecutionSession).toHaveBeenCalledWith({
    backend: "local",
    workspaceDir: config.workspaceDir,
    permissionMode: "default",
    runtimeDirectory: "/managed-runtimes",
    checkpointDirectory: undefined,
    workspaceRevision: 0,
  })
  connection.socket.message({ type: "ping" })
  expect(connection.socket.send).toHaveBeenCalledWith(
    JSON.stringify({ type: "pong" })
  )
  await stopLocalExecution(connection.payload.bridgeId, 2)
  expect(stop).not.toHaveBeenCalled()
  await stopLocalExecution(connection.payload.bridgeId, 1)
  expect(stop).toHaveBeenCalledOnce()
})

it.each([false, true])(
  "gates binary input frames on negotiated capability %s",
  async (enabled) => {
    const connection = await connect()
    connection.socket.message({
      ...connection.ready,
      capabilities: enabled ? ["input_files_v1"] : [],
    })
    await connection.pending
    const params = {
      path: `inbound/${"a".repeat(64)}-input.bin`,
      sha256: "a".repeat(64),
      content_base64: "A".repeat(5 * 1024 * 1024),
    }
    connection.socket.message({
      id: "b".repeat(32),
      method: "write_input_file",
      params,
    })
    if (enabled)
      await vi.waitFor(() =>
        expect(handle).toHaveBeenCalledWith("write_input_file", params)
      )
    else {
      expect(handle).not.toHaveBeenCalled()
      expect(connection.socket.close).toHaveBeenCalled()
    }
  }
)

it("rejects a ready message that changes the prepared workspace", async () => {
  const connection = await connect()
  connection.socket.message({ ...connection.ready, cwd: "/outside" })
  await expect(connection.pending).rejects.toThrow("不匹配")
  expect(createExecutionSession).not.toHaveBeenCalled()
})

it("passes only the trusted prepared worktree binding into an enabled executor", async () => {
  const worktree = {
    profileKey: "account/conversation",
    sourceRepo: "/source",
    commonGitDir: "/source/.git",
    target: config.workspaceDir,
    gitDir: "/source/.git/worktrees/task",
    head: "a".repeat(40),
    branch: "buddy/task",
  }
  const prepared = await prepareLocalExecution({ ...config, worktree }, 1)
  expect(validateWorkspaceWorktree).toHaveBeenCalledWith(
    config.workspaceDir,
    worktree
  )
  expect(prepared).not.toHaveProperty("worktree")
  const payload = {
    bridgeId: "c".repeat(32),
    preparationId: prepared.preparationId,
    ticket: "secret".repeat(8),
    url: `wss://example.test/api/v1/execution/bridges/${"c".repeat(32)}`,
    permissionMode: "auto" as const,
  }
  const pending = startLocalExecution(payload, 1, "/managed-runtimes")
  await vi.waitFor(() => expect(TestSocket.sockets).toHaveLength(1))
  const socket = TestSocket.sockets.at(-1)!
  socket.message({
    type: "ready",
    backend: "local",
    cwd: config.workspaceDir,
    permission_mode: "auto",
    capabilities: ["workspace_git_v1"],
    limits: { max_file_bytes: 100, bash_timeout_seconds: 1 },
  })
  await pending
  expect(createExecutionSession).toHaveBeenCalledWith(
    expect.objectContaining({ worktree })
  )
  socket.message({
    id: "d".repeat(32),
    method: "git_diff",
    params: { scope: "staged" },
  })
  await vi.waitFor(() =>
    expect(handle).toHaveBeenCalledWith("git_diff", { scope: "staged" })
  )
})

it.each(["prepare", "start"])(
  "rejects a workspace handoff while %s is validating the worktree",
  async (phase) => {
    const workspaceDir = `/workspace-handoff-${phase}`
    const worktree = {
      profileKey: "account/conversation",
      sourceRepo: "/source",
      commonGitDir: "/source/.git",
      target: workspaceDir,
      gitDir: "/source/.git/worktrees/task",
      head: "a".repeat(40),
      branch: "buddy/task",
    }
    const settings = { ...config, workspaceDir, worktree }
    const preparation =
      phase === "start" ? await prepareLocalExecution(settings, 1) : null
    let finishValidation!: () => void
    const validation = new Promise<void>((resolve) => {
      finishValidation = resolve
    })
    vi.mocked(validateWorkspaceWorktree).mockImplementationOnce(
      () => validation
    )
    const pending = preparation
      ? startLocalExecution(
          {
            bridgeId: "e".repeat(32),
            preparationId: preparation.preparationId,
            ticket: "secret".repeat(8),
            url: `wss://example.test/api/v1/execution/bridges/${"e".repeat(32)}`,
            permissionMode: "auto",
          },
          1,
          "/managed-runtimes"
        )
      : prepareLocalExecution(settings, 1)
    const rejected = expect(pending).rejects.toThrow(
      phase === "start" ? "准备已失效" : "工作区已切换"
    )
    await vi.waitFor(() =>
      expect(validateWorkspaceWorktree).toHaveBeenCalledTimes(
        phase === "start" ? 2 : 1
      )
    )
    invalidateWorkspacePreparations(workspaceDir)
    finishValidation()
    await rejected
    expect(TestSocket.sockets).toHaveLength(0)
    expect(createExecutionSession).not.toHaveBeenCalled()
  }
)

it.each(["git_status", "git_diff"])(
  "rejects unnegotiated %s before executor dispatch",
  async (method) => {
    const connection = await connect()
    connection.socket.message(connection.ready)
    await connection.pending
    connection.socket.message({ id: "d".repeat(32), method, params: {} })
    expect(connection.socket.close).toHaveBeenCalled()
    expect(handle).not.toHaveBeenCalled()
  }
)

it("applies server limits to commands and writes, and cleans up on disconnect", async () => {
  const connection = await connect()
  connection.socket.message(connection.ready)
  await connection.pending
  const id = "b".repeat(32)
  connection.socket.message({
    id,
    method: "run_bash",
    params: { command: "echo test", timeout_ms: 30000 },
  })
  await vi.waitFor(() =>
    expect(handle).toHaveBeenCalledWith("run_bash", {
      command: "echo test",
      timeout_ms: 1000,
    })
  )
  connection.socket.message({
    id,
    method: "write_file",
    params: { path: "large", content: "a".repeat(101) },
  })
  await vi.waitFor(() =>
    expect(
      connection.socket.send.mock.calls.map(([text]) => JSON.parse(text))
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          error: expect.objectContaining({ code: "EXECUTION_ERROR" }),
        }),
      ])
    )
  )
  connection.socket.close()
  await vi.waitFor(() => expect(stop).toHaveBeenCalledOnce())
})

it("rejects unsupported backends and another renderer's preparation", async () => {
  await expect(
    prepareLocalExecution({ ...config, backend: "sandbox" }, 1)
  ).rejects.toThrow("仅支持 local")
  const prepared = await prepareLocalExecution(config, 1)
  await expect(
    startLocalExecution(
      {
        bridgeId: "c".repeat(32),
        preparationId: prepared.preparationId,
        ticket: "secret".repeat(8),
        url: `wss://example.test/execution/bridges/${"c".repeat(32)}`,
        permissionMode: "full",
      },
      2,
      "/managed"
    )
  ).rejects.toThrow("准备已失效")
})

it("advertises structured tests and applies negotiated command limits", async () => {
  expect(await prepareLocalExecution(config, 1)).toMatchObject({
    capabilities: [
      "run_tests_v1",
      "workspace_git_v1",
      "input_files_v1",
      "command_v1",
    ],
  })
  const connection = await connect()
  connection.socket.message({
    ...connection.ready,
    capabilities: ["run_tests_v1", "command_v1"],
  })
  await connection.pending
  const result = {
    command: "test command",
    exit_code: null,
    stdout: "\u0000".repeat(512 * 1024),
    stderr: "",
    reason: "output-limit" as const,
    started_at: new Date().toISOString(),
    duration_ms: 100,
    truncated: true,
    output_complete: false,
    result_available: true,
  }
  handle.mockResolvedValueOnce(result)
  const id = "d".repeat(32)
  connection.socket.message({
    id,
    method: "run_tests",
    params: { command: "test command" },
  })
  await vi.waitFor(() =>
    expect(handle).toHaveBeenCalledWith("run_tests", {
      command: "test command",
      timeout_ms: 1000,
    })
  )
  await vi.waitFor(() => {
    const frame = connection.socket.send.mock.calls.find(([text]) =>
      String(text).includes(id)
    )?.[0]
    expect(frame).toBeDefined()
    expect(Buffer.byteLength(frame)).toBeLessThan(4 * 1024 * 1024)
    expect(JSON.parse(frame)).toEqual({ id, result, error: null })
  })
  handle.mockResolvedValueOnce(result)
  connection.socket.message({
    id: "e".repeat(32),
    method: "run_command",
    params: { command: "command test" },
  })
  await vi.waitFor(() =>
    expect(handle).toHaveBeenCalledWith("run_command", {
      command: "command test",
      timeout_ms: 1000,
    })
  )
  expect(connection.socket.close).not.toHaveBeenCalled()
})

it("rejects structured tests unless they are explicitly negotiated", async () => {
  const connection = await connect()
  connection.socket.message(connection.ready)
  await connection.pending
  connection.socket.message({
    id: "e".repeat(32),
    method: "run_tests",
    params: { command: "test command" },
  })
  await vi.waitFor(() => expect(connection.socket.close).toHaveBeenCalled())
  expect(handle).not.toHaveBeenCalled()
})

it("rejects commands unless command_v1 is explicitly negotiated", async () => {
  const connection = await connect()
  connection.socket.message(connection.ready)
  await connection.pending
  connection.socket.message({
    id: "f".repeat(32),
    method: "run_command",
    params: { command: "command test" },
  })
  await vi.waitFor(() => expect(connection.socket.close).toHaveBeenCalled())
  expect(handle).not.toHaveBeenCalled()
})

it.each([undefined, null, "run_tests_v1", {}, ["run_tests_v1", null], [1]])(
  "rejects a ready message with invalid capabilities %j",
  async (capabilities) => {
    const connection = await connect()
    connection.socket.message({ ...connection.ready, capabilities })
    await expect(connection.pending).rejects.toThrow("无效的协议能力")
    expect(connection.socket.close).toHaveBeenCalled()
    expect(createExecutionSession).not.toHaveBeenCalled()
    expect(handle).not.toHaveBeenCalled()
  }
)
