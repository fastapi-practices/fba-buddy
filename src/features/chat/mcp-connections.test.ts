import { QueryClient } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { listMcps } from "@/api"
import { ApiError } from "@/api/http"
import { getMcpOauth } from "@/api/mcp-oauth"
import { queryKeys } from "@/api/query-keys"
import { openWorkspace } from "@/app/navigation"
import { toast } from "@/components/ui/toast"
import {
  checkSelectedMcpConnections,
  createMcpFailureRecovery,
  isMcpRecoveryEvent,
  notifyMcpConnectionCheck,
  readMcpRunEvents,
} from "@/features/chat/mcp-connections"
import { mcpOauthQueryKey } from "@/features/mcp/use-mcp-oauth"
import type { McpItem } from "@/lib/types"

vi.mock("@/api", () => ({ listMcps: vi.fn() }))
vi.mock("@/api/mcp-oauth", () => ({ getMcpOauth: vi.fn() }))
vi.mock("@/app/navigation", () => ({ openWorkspace: vi.fn() }))
vi.mock("@/components/ui/toast", () => ({ toast: { add: vi.fn() } }))

const mcp: McpItem = {
  id: 42,
  name: "Calendar",
  description: null,
  user_id: 0,
  type: 2,
  url: "https://mcp.example.com/calendar",
}
const connected = {
  configured: true,
  connected: true,
  expires_time: "2026-10-13T12:00:00Z",
}
const disconnected = {
  configured: true,
  connected: false,
  expires_time: null,
}
let queryClient: QueryClient

beforeEach(() => {
  vi.clearAllMocks()
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  vi.mocked(listMcps).mockResolvedValue([mcp])
  vi.mocked(getMcpOauth).mockResolvedValue(connected)
})

afterEach(() => queryClient.clear())

describe("checkSelectedMcpConnections", () => {
  it("skips all requests without selected MCPs", async () => {
    expect(await checkSelectedMcpConnections(queryClient, [], 1)).toEqual({
      allowed: true,
    })
    expect(listMcps).not.toHaveBeenCalled()
    expect(getMcpOauth).not.toHaveBeenCalled()
  })

  it("checks fresh status even when a persisted selection was cached connected", async () => {
    queryClient.setQueryData(mcpOauthQueryKey(mcp, 1), connected)
    vi.mocked(getMcpOauth).mockResolvedValue(disconnected)
    expect(await checkSelectedMcpConnections(queryClient, [42], 1)).toEqual({
      allowed: false,
      disconnected: true,
    })
    expect(getMcpOauth).toHaveBeenCalledTimes(1)
    expect(queryClient.getQueryData(mcpOauthQueryKey(mcp, 1))).toEqual(
      disconnected
    )
  })

  it("allows MCPs whose platform OAuth is disabled", async () => {
    vi.mocked(getMcpOauth).mockResolvedValue({
      ...disconnected,
      configured: false,
    })
    expect(
      await checkSelectedMcpConnections(queryClient, [42], 1)
    ).toMatchObject({
      allowed: true,
    })
  })

  it("queries only selected HTTPS builtin remote MCPs", async () => {
    vi.mocked(listMcps).mockResolvedValue([
      mcp,
      { ...mcp, id: 43, user_id: 7 },
      { ...mcp, id: 44, type: 0 },
      { ...mcp, id: 45, url: "http://mcp.example.com" },
      { ...mcp, id: 46 },
    ])
    await checkSelectedMcpConnections(queryClient, [42, 43, 44, 45], 1)
    expect(getMcpOauth).toHaveBeenCalledTimes(1)
    expect(getMcpOauth).toHaveBeenCalledWith(42, expect.any(AbortSignal))
  })

  it("blocks on status failure and refreshes the visible MCP list", async () => {
    const error = new ApiError(403, "Forbidden")
    vi.mocked(getMcpOauth).mockRejectedValue(error)
    const invalidate = vi.spyOn(queryClient, "invalidateQueries")
    expect(await checkSelectedMcpConnections(queryClient, [42], 1)).toEqual({
      allowed: false,
      error,
    })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.mcps() })
    expect(queryClient.getQueryState(mcpOauthQueryKey(mcp, 1))?.error).toBe(
      error
    )
  })

  it("blocks deleted or inaccessible selected MCPs", async () => {
    vi.mocked(listMcps).mockResolvedValue([])
    expect(await checkSelectedMcpConnections(queryClient, [42], 1)).toEqual({
      allowed: false,
    })
    expect(getMcpOauth).not.toHaveBeenCalled()
  })
})

describe("MCP recovery events", () => {
  it.each([
    { type: "RUN_ERROR", message: "Provider limit reached" },
    { type: "TOOL_CALL_RESULT", isError: true },
    { type: "TOOL_CALL_RESULT", is_error: true },
    { type: "TOOL_CALL_RESULT", status: "failed" },
    { type: "TOOL_CALL_RESULT", content: '{"isError":true}' },
    {
      type: "REASONING_ENCRYPTED_VALUE",
      subtype: "message",
      encryptedValue: '{"pydantic_ai":{"outcome":"failed"}}',
    },
  ])("observes a real failure: %j", (event) => {
    expect(isMcpRecoveryEvent(event)).toBe(true)
  })

  it.each([
    { type: "TOOL_CALL_RESULT", content: "OAuth error example" },
    { type: "TOOL_CALL_RESULT", content: '{"isError":false}' },
    { type: "TOOL_CALL_RESULT", status: "success" },
    { type: "RUN_FINISHED" },
    {
      type: "REASONING_ENCRYPTED_VALUE",
      subtype: "message",
      encryptedValue: '{"pydantic_ai":{"outcome":"denied"}}',
    },
    {
      type: "REASONING_ENCRYPTED_VALUE",
      subtype: "message",
      encryptedValue: '{"pydantic_ai":{"outcome":"interrupted"}}',
    },
  ])("ignores text, success, refusal and interruption: %j", (event) => {
    expect(isMcpRecoveryEvent(event)).toBe(false)
  })

  it("preserves streamed events while observing failures", async () => {
    const events = [
      {
        type: "TOOL_CALL_RESULT",
        messageId: "result",
        toolCallId: "call",
        role: "tool",
        content: "failed",
        isError: true,
      },
      { type: "RUN_ERROR", message: "Failed" },
    ]
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")
          )
        )
        controller.close()
      },
    })
    const failure = vi.fn()
    const received = []
    for await (const event of readMcpRunEvents(body, failure))
      received.push(event)
    expect(received).toEqual(events)
    expect(failure).toHaveBeenCalledTimes(2)
  })
})

describe("createMcpFailureRecovery", () => {
  it("loads missing MCP metadata for a restored run before refreshing its connection", async () => {
    const recover = createMcpFailureRecovery(queryClient, [42], 1, () => true)
    recover()
    await vi.waitFor(() => expect(toast.add).toHaveBeenCalledTimes(1))
    expect(listMcps).toHaveBeenCalledTimes(1)
    expect(getMcpOauth).toHaveBeenCalledTimes(1)
    expect(queryClient.getQueryData(mcpOauthQueryKey(mcp, 1))).toEqual(
      connected
    )
  })

  it("starts a new GET after failure instead of joining an earlier status request", async () => {
    queryClient.setQueryData(queryKeys.mcps(), [mcp])
    vi.mocked(getMcpOauth)
      .mockImplementationOnce(
        (_id, signal) =>
          new Promise((_resolve, reject) => {
            signal?.addEventListener("abort", () =>
              reject(new DOMException("Cancelled", "AbortError"))
            )
          })
      )
      .mockResolvedValueOnce(disconnected)
    const earlier = queryClient.fetchQuery({
      queryKey: mcpOauthQueryKey(mcp, 1),
      queryFn: ({ signal }) => getMcpOauth(mcp.id, signal),
    })
    void earlier.catch(() => {})
    createMcpFailureRecovery(queryClient, [42], 1, () => true)()
    await vi.waitFor(() => expect(toast.add).toHaveBeenCalledTimes(1))
    expect(getMcpOauth).toHaveBeenCalledTimes(2)
    expect(queryClient.getQueryData(mcpOauthQueryKey(mcp, 1))).toEqual(
      disconnected
    )
  })

  it("refreshes once per failed run and provides a neutral connection action", async () => {
    queryClient.setQueryData(queryKeys.mcps(), [mcp])
    vi.mocked(getMcpOauth).mockResolvedValue(disconnected)
    const invalidate = vi.spyOn(queryClient, "invalidateQueries")
    const recover = createMcpFailureRecovery(queryClient, [42], 1, () => true)
    recover()
    recover()
    await vi.waitFor(() => expect(toast.add).toHaveBeenCalledTimes(1))
    expect(getMcpOauth).toHaveBeenCalledTimes(1)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.mcps() })
    expect(queryClient.getQueryData(mcpOauthQueryKey(mcp, 1))).toEqual(
      disconnected
    )
    const toastOptions = vi.mocked(toast.add).mock.calls[0]![0]
    expect(toastOptions).toMatchObject({ type: "info" })
    toastOptions.actionProps?.onClick?.({} as never)
    expect(openWorkspace).toHaveBeenCalledWith("mcp")
  })

  it("does not refresh or show connection hints for an unrelated run", () => {
    queryClient.setQueryData(queryKeys.mcps(), [mcp])
    createMcpFailureRecovery(queryClient, [], 1, () => true)()
    expect(getMcpOauth).not.toHaveBeenCalled()
    expect(toast.add).not.toHaveBeenCalled()
  })

  it("suppresses stale-account recovery and hints", async () => {
    queryClient.setQueryData(queryKeys.mcps(), [mcp])
    let current = true
    const recover = createMcpFailureRecovery(
      queryClient,
      [42],
      1,
      () => current
    )
    recover()
    current = false
    await Promise.resolve()
    await Promise.resolve()
    expect(getMcpOauth).not.toHaveBeenCalled()
    expect(queryClient.getQueryData(mcpOauthQueryKey(mcp, 1))).toBeUndefined()
    expect(toast.add).not.toHaveBeenCalled()
  })
})

it("offers MCP connection details after a blocked preflight", () => {
  notifyMcpConnectionCheck({ allowed: false, disconnected: true })
  const toastOptions = vi.mocked(toast.add).mock.calls[0]![0]
  expect(toastOptions).toMatchObject({ type: "error" })
  toastOptions.actionProps?.onClick?.({} as never)
  expect(openWorkspace).toHaveBeenCalledWith("mcp")
})
