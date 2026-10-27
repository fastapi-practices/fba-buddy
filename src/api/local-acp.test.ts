import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { apiRequest } from "@/api/http"
import { toForwardedPropsApi } from "@/api/chat-body"
import { openLocalAcp, withLocalAcpStream } from "@/api/local-acp"
import type { ForwardedProps } from "@/lib/types"

vi.mock("@/api/http", () => ({ apiRequest: vi.fn() }))
const startAcp = vi.fn(async () => {})
const stopAcp = vi.fn(async () => {})
const prepareAcp = vi.fn(async (config: object) => ({
  ...config,
  preparationId: "prepared",
}))
const config = { command: "/local/codex-acp", args: [], cwd: "/local/project" }
const props: ForwardedProps = {
  provider_id: 1,
  model_id: "test",
  agent_mode: "coding",
  acp_runner: true,
  acp_runner_name: "codex",
  acp_runner_config: config,
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal("window", {
    location: { href: "http://127.0.0.1:5173" },
    buddyDesktop: {
      startAcp,
      stopAcp,
      prepareAcp,
    },
  })
  vi.mocked(apiRequest).mockResolvedValue({
    bridge_id: "a".repeat(32),
    ticket: "ticket",
  })
})
afterEach(() => vi.unstubAllGlobals())

it("keeps the launch configuration on the device and sends only the bridge id", async () => {
  const request = vi.fn(async (forwarded: ForwardedProps) => {
    const body = toForwardedPropsApi(forwarded)
    expect(body.acpBridgeId).toBe("a".repeat(32))
    expect(body).not.toHaveProperty("acpRunnerConfig")
    return new Response("done")
  })
  const source = { accountId: "42", backendUrl: "http://localhost/api/v1" }
  const response = await withLocalAcpStream(
    props,
    request,
    undefined,
    "conversation-1",
    source
  )
  expect(await response.text()).toBe("done")
  expect(startAcp).toHaveBeenCalledWith(
    expect.objectContaining({
      config: { ...config, preparationId: "prepared" },
      preparationId: "prepared",
      source,
    })
  )
  expect(prepareAcp).toHaveBeenCalledWith(config, "conversation-1", source)
  expect(apiRequest).toHaveBeenCalledWith(
    "/acp/bridges",
    expect.objectContaining({
      body: JSON.stringify({ runner: "codex", cwd: config.cwd }),
    })
  )
  expect(stopAcp).toHaveBeenCalledWith("a".repeat(32))
})

it("does not kill a local run when switching conversations unsubscribes from SSE", async () => {
  const controller = new AbortController()
  const source = new ReadableStream<Uint8Array>({})
  const response = await withLocalAcpStream(
    props,
    async () => new Response(source),
    controller.signal,
    "conversation-1"
  )
  controller.abort()
  await response.body!.cancel()
  expect(stopAcp).not.toHaveBeenCalled()
})

it("closes a local process when the generation request fails", async () => {
  await expect(
    withLocalAcpStream(
      props,
      async () => {
        throw new Error("request failed")
      },
      undefined,
      "conversation-1"
    )
  ).rejects.toThrow("request failed")
  expect(stopAcp).toHaveBeenCalledWith("a".repeat(32))
})

it("rejects an unavailable ACP workspace before creating a bridge or launching", async () => {
  prepareAcp.mockRejectedValueOnce(new Error("当前对话绑定云端工作区"))
  const request = vi.fn(async () => new Response("done"))
  await expect(
    withLocalAcpStream(props, request, undefined, "worktree-conversation")
  ).rejects.toThrow("当前对话绑定云端工作区")
  expect(apiRequest).not.toHaveBeenCalled()
  expect(startAcp).not.toHaveBeenCalled()
  expect(request).not.toHaveBeenCalled()
})

it("requires a conversation for ACP generation but permits standalone configuration checks", async () => {
  const request = vi.fn(async () => new Response("done"))
  await expect(withLocalAcpStream(props, request)).rejects.toThrow("会话标识")
  expect(prepareAcp).not.toHaveBeenCalled()
  const bridge = await openLocalAcp("codex", config)
  expect(prepareAcp).toHaveBeenCalledWith(config, undefined, undefined)
  bridge.close()
})

it("rejects browser-only execution and aborted preparation without launching", async () => {
  const controller = new AbortController()
  controller.abort()
  await expect(
    openLocalAcp("codex", config, controller.signal)
  ).rejects.toThrow()
  expect(startAcp).not.toHaveBeenCalled()
  vi.stubGlobal("window", { location: { href: "http://localhost" } })
  await expect(openLocalAcp("codex", config)).rejects.toThrow("桌面端")
})

it("asks an Electron renderer with a stale preload to restart the app", async () => {
  vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 Electron/44.0.0" })
  vi.stubGlobal("window", { location: { href: "http://localhost" } })

  await expect(openLocalAcp("codex", config)).rejects.toThrow(
    "完全退出并重新启动桌面应用"
  )
})
