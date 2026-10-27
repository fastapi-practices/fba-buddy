import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { streamCompletion } from "@/api/chat"
import { withExecutionStream } from "@/api/local-execution"
import { beginDataSourceChange } from "@/lib/account-source"
import { useHistoryCacheStatusStore } from "@/lib/history-cache-status"
import { useSessionStore } from "@/lib/session"
import type { ChatSendPayload } from "@/lib/types"

vi.mock("@/api/local-execution", () => ({ withExecutionStream: vi.fn() }))
vi.mock("@/lib/notify", () => ({ notifyError: vi.fn() }))

const fetchMock = vi.fn<typeof fetch>()
const body: ChatSendPayload = {
  conversation_id: "bound-worktree",
  messages: [{ id: "message-1", role: "user", content: "Run the tests" }],
  forwarded_props: {
    provider_id: 1,
    model_id: "test-model",
    agent_mode: "coding",
  },
}

beforeEach(() => {
  vi.resetAllMocks()
  beginDataSourceChange()
  useHistoryCacheStatusStore.setState({ offline: false, cachedAt: null })
  useSessionStore.setState({ accessToken: "test-token", user: null })
  vi.mocked(withExecutionStream).mockImplementation((_id, props, request) =>
    request(props)
  )
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  useSessionStore.setState({ accessToken: null, user: null })
  useHistoryCacheStatusStore.setState({ offline: false, cachedAt: null })
  vi.unstubAllGlobals()
})

it("announces the request immediately before the actual completion fetch", async () => {
  const onRequest = vi.fn()
  fetchMock.mockImplementationOnce(async (_url, init) => {
    expect(onRequest).toHaveBeenCalledOnce()
    expect(init).not.toHaveProperty("onRequest")
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer test-token"
    )
    return new Response("data: done\n\n", {
      headers: { "Content-Type": "text/event-stream" },
    })
  })

  const response = await streamCompletion(body, undefined, { onRequest })

  expect(await response.text()).toBe("data: done\n\n")
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
    expect.stringMatching(/\/chat\/completions$/),
    expect.objectContaining({ method: "POST" })
  )
  expect(onRequest).toHaveBeenCalledOnce()
})

it("passes the selected project into desktop execution preparation", async () => {
  fetchMock.mockResolvedValueOnce(
    new Response("data: {}\n\n", {
      headers: { "content-type": "text/event-stream" },
    })
  )
  await streamCompletion({ ...body, project_id: 7 })
  expect(withExecutionStream).toHaveBeenCalledWith(
    body.conversation_id,
    body.forwarded_props,
    expect.any(Function),
    undefined,
    expect.any(Function),
    7
  )
})

it.each(["工作目录绑定已失效", "账号数据源不匹配"])(
  "does not announce a request when local preparation rejects: %s",
  async (message) => {
    const onRequest = vi.fn()
    vi.mocked(withExecutionStream).mockRejectedValueOnce(new Error(message))

    await expect(
      streamCompletion(body, undefined, { onRequest })
    ).rejects.toThrow(message)

    expect(onRequest).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  }
)

it.each(["network", "http-503"])(
  "keeps the attempted request visible after a %s failure",
  async (failure) => {
    const onRequest = vi.fn()
    if (failure === "network")
      fetchMock.mockRejectedValueOnce(new TypeError("connection lost"))
    else
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: 503, msg: "service unavailable" }),
          {
            status: 503,
            headers: { "Content-Type": "application/json" },
          }
        )
      )

    await expect(
      streamCompletion(body, undefined, { onRequest })
    ).rejects.toMatchObject({ code: failure === "network" ? 0 : 503 })

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(onRequest).toHaveBeenCalledOnce()
  }
)

it("records the attempted completion when HTTP authentication and refresh fail", async () => {
  const onRequest = vi.fn()
  fetchMock
    .mockResolvedValueOnce(new Response(null, { status: 401 }))
    .mockResolvedValueOnce(new Response(null, { status: 401 }))

  await expect(
    streamCompletion(body, undefined, { onRequest })
  ).rejects.toMatchObject({ code: 401 })

  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(fetchMock.mock.calls[0]![0]).toMatch(/\/chat\/completions$/)
  expect(fetchMock.mock.calls[1]![0]).toMatch(/\/auth\/refresh$/)
  expect(onRequest).toHaveBeenCalledOnce()
})

it("does not announce or fetch a completion when already aborted", async () => {
  const onRequest = vi.fn()
  const controller = new AbortController()
  controller.abort()

  await expect(
    streamCompletion(body, controller.signal, { onRequest })
  ).rejects.toMatchObject({ name: "AbortError" })

  expect(onRequest).not.toHaveBeenCalled()
  expect(fetchMock).not.toHaveBeenCalled()
})

it("does not announce or fetch a completion while cached history is offline", async () => {
  const onRequest = vi.fn()
  useHistoryCacheStatusStore.setState({ offline: true })

  await expect(
    streamCompletion(body, undefined, { onRequest })
  ).rejects.toMatchObject({ code: 0 })

  expect(onRequest).not.toHaveBeenCalled()
  expect(fetchMock).not.toHaveBeenCalled()
})

it("does not import old message attachments after the account changed during ACP preparation", async () => {
  vi.mocked(withExecutionStream).mockImplementationOnce(
    async (_id, _props, _request, _signal, beforeStart) => {
      beginDataSourceChange()
      await beforeStart?.()
      throw new Error("unexpected completion")
    }
  )
  await expect(
    streamCompletion({
      ...body,
      forwarded_props: { ...body.forwarded_props, acp_runner: true },
    })
  ).rejects.toThrow("账号已切换")
  expect(fetchMock).not.toHaveBeenCalled()
})
