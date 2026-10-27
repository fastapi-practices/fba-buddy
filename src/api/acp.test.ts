import { afterEach, expect, it, vi } from "vitest"

import { checkAcpAgent } from "@/api/acp"
import { apiRequest } from "@/api/http"
import { openLocalAcp } from "@/api/local-acp"

vi.mock("@/api/local-acp", () => ({
  openLocalAcp: vi.fn(async () => ({ id: "local-bridge", close: vi.fn() })),
}))
vi.mock("@/api/http", () => ({ apiRequest: vi.fn() }))
afterEach(() => vi.restoreAllMocks())

it("checks the supplied launch configuration and permission mode", async () => {
  const result = {
    available: false,
    message: "missing executable",
    code: "agent_exited",
    latency_ms: 10,
  }
  vi.mocked(apiRequest).mockResolvedValueOnce(result)
  const config = { command: "/opt/my agent", args: ["acp", "a b"] }
  expect(await checkAcpAgent("codex", config, "ask")).toEqual(result)
  expect(openLocalAcp).toHaveBeenCalledWith(
    "codex",
    config,
    expect.any(AbortSignal)
  )
  expect(apiRequest).toHaveBeenCalledWith(
    "/acp/codex/check",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        bridge_id: "local-bridge",
        permission_mode: "ask",
      }),
      silent: true,
    })
  )
})

it("does not treat an unsupported or malformed response as available", async () => {
  for (const response of [
    null,
    {},
    { available: "true", message: "ok", code: "ok", latency_ms: 1 },
    { available: true, message: "ok", latency_ms: 1 },
    { available: true, message: "ok", code: "", latency_ms: 1 },
  ]) {
    vi.mocked(apiRequest).mockResolvedValueOnce(response)
    await expect(
      checkAcpAgent("pi", { command: "npx", args: [] }, "ask")
    ).rejects.toThrow("检测服务返回了无效结果")
  }
})

it("preserves unknown diagnostic codes and the server message", async () => {
  const result = {
    available: false,
    message: "服务端返回的新诊断信息",
    code: "future_agent_error",
    latency_ms: 10,
  }
  vi.mocked(apiRequest).mockResolvedValueOnce(result)
  expect(
    await checkAcpAgent("codex", { command: "codex", args: [] }, "ask")
  ).toEqual(result)
})

it("preserves timeout errors even when the HTTP layer reports a network error", async () => {
  const reason = new DOMException("Timed out", "TimeoutError")
  vi.spyOn(AbortSignal, "timeout").mockReturnValue(AbortSignal.abort(reason))
  vi.mocked(apiRequest).mockRejectedValueOnce(new Error("网络异常"))
  await expect(
    checkAcpAgent("pi", { command: "npx", args: [] }, "ask")
  ).rejects.toBe(reason)
})
