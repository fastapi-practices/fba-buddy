import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { apiRequest, apiStream } from "@/api/http"
import {
  beginDataSourceChange,
  currentAccountSource,
} from "@/lib/account-source"
import { useHistoryCacheStatusStore } from "@/lib/history-cache-status"
import { useSessionStore } from "@/lib/session"
import { notifyError } from "@/lib/notify"
import type { AuthUser } from "@/lib/types"

vi.mock("@/lib/notify", () => ({ notifyError: vi.fn() }))

const historyCache = vi.fn()
const fetchMock = vi.fn()
const cachedAt = "2026-10-10T06:00:00.000Z"
const detail = {
  conversation_id: "c1",
  title: "Server history",
  messages_snapshot: { messages: [] },
}

function response(value: unknown, status = 200) {
  return new Response(
    JSON.stringify({ code: status, data: value, msg: "backend error" }),
    {
      status,
      headers: { "Content-Type": "application/json" },
    }
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  beginDataSourceChange()
  useHistoryCacheStatusStore.setState({ offline: false, cachedAt: null })
  useSessionStore.setState({
    accessToken: "token",
    user: { id: 1 } as AuthUser,
  })
  historyCache.mockResolvedValue(null)
  fetchMock.mockResolvedValue(response(detail))
  vi.stubGlobal("fetch", fetchMock)
  vi.stubGlobal("window", {
    location: { href: "http://localhost:4174/" },
    buddyDesktop: {
      historyCache,
      loadSession: vi.fn(async () => null),
      saveSession: vi.fn(async () => true),
      clearSession: vi.fn(async () => true),
    },
  })
})

afterEach(() => {
  useSessionStore.setState({ accessToken: null, user: null })
  useHistoryCacheStatusStore.setState({ offline: false, cachedAt: null })
  vi.unstubAllGlobals()
})

it("fetches authoritative server history and caches only its successful result", async () => {
  expect(await apiRequest("/conversations/c1")).toEqual(detail)
  expect(fetchMock).toHaveBeenCalledOnce()
  const headers = new Headers(fetchMock.mock.calls[0]![1].headers)
  expect(headers.get("Authorization")).toBe("Bearer token")
  expect(historyCache).toHaveBeenCalledExactlyOnceWith({
    action: "put",
    source: currentAccountSource(),
    path: "/conversations/c1",
    value: detail,
  })
})

it("falls back to the same account's snapshot only on a network failure", async () => {
  fetchMock.mockRejectedValue(new TypeError("offline"))
  historyCache.mockResolvedValue({ value: detail, cachedAt })
  expect(await apiRequest("/conversations/c1")).toEqual(detail)
  expect(historyCache).toHaveBeenCalledExactlyOnceWith({
    action: "get",
    source: currentAccountSource(),
    path: "/conversations/c1",
  })
  expect(useHistoryCacheStatusStore.getState()).toEqual({
    offline: true,
    cachedAt,
  })
  expect(notifyError).not.toHaveBeenCalled()
})

it.each([401, 403, 404, 500])(
  "does not use cached history after HTTP %s",
  async (status) => {
    fetchMock.mockImplementation(async () => response(null, status))
    historyCache.mockResolvedValue({ value: detail, cachedAt })
    await expect(
      apiRequest("/conversations/c1", { silent: true })
    ).rejects.toMatchObject({ code: status })
    expect(
      historyCache.mock.calls.some(([request]) => request.action === "get")
    ).toBe(false)
  }
)

it("does not serve account caches to an anonymous session", async () => {
  useSessionStore.setState({ accessToken: null, user: null })
  fetchMock.mockRejectedValue(new TypeError("offline"))
  await expect(
    apiRequest("/conversations/c1", { silent: true })
  ).rejects.toMatchObject({ code: 0 })
  expect(historyCache).not.toHaveBeenCalled()
})

it("invalidates deleted conversation snapshots only after the server accepts deletion", async () => {
  fetchMock.mockResolvedValue(response(null))
  await apiRequest("/conversations/c1", { method: "DELETE" })
  expect(historyCache).toHaveBeenCalledExactlyOnceWith({
    action: "delete-conversation",
    source: currentAccountSource(),
    conversationId: "c1",
  })
  historyCache.mockClear()
  fetchMock.mockResolvedValue(response(null, 500))
  await expect(
    apiRequest("/conversations/c1", { method: "DELETE", silent: true })
  ).rejects.toMatchObject({ code: 500 })
  expect(historyCache).not.toHaveBeenCalled()
})

it("rejects offline mutations and new streams while allowing an online history refresh", async () => {
  useHistoryCacheStatusStore.setState({ offline: true, cachedAt })
  await expect(
    apiRequest("/projects", { method: "POST", silent: true })
  ).rejects.toThrow("只能查看缓存历史")
  await expect(
    apiStream("/chat/completions", { method: "POST", silent: true })
  ).rejects.toThrow("只能查看缓存历史")
  expect(fetchMock).not.toHaveBeenCalled()
  await apiRequest("/conversations/c1")
  expect(useHistoryCacheStatusStore.getState().offline).toBe(false)
})

it("never returns a delayed cached response after switching accounts", async () => {
  fetchMock.mockRejectedValue(new TypeError("offline"))
  let resolveCache!: (value: unknown) => void
  historyCache.mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveCache = resolve
      })
  )
  const request = apiRequest("/conversations/c1", { silent: true })
  const rejected = expect(request).rejects.toMatchObject({ name: "AbortError" })
  await vi.waitFor(() => expect(historyCache).toHaveBeenCalled())
  beginDataSourceChange()
  useSessionStore.setState({ user: { id: 2 } as AuthUser })
  resolveCache({ value: detail, cachedAt })
  await rejected
  expect(useHistoryCacheStatusStore.getState().offline).toBe(false)
})

it("uses the backend for streams without creating a second local history", async () => {
  fetchMock.mockResolvedValue(
    new Response("data: {}\n\n", {
      headers: { "Content-Type": "text/event-stream" },
    })
  )
  const stream = await apiStream("/chat/completions", {
    method: "POST",
    body: JSON.stringify({ threadId: "c1" }),
  })
  expect(await stream.text()).toBe("data: {}\n\n")
  expect(historyCache).toHaveBeenCalledExactlyOnceWith({
    action: "invalidate-conversation",
    source: currentAccountSource(),
    conversationId: "c1",
  })
  expect(fetchMock.mock.calls[0]![0]).toMatch(/\/chat\/completions$/)
})

it("invalidates accepted regeneration streams without clearing history on errors", async () => {
  const path = "/conversations/c1/messages/2/regenerate"
  fetchMock.mockResolvedValue(
    new Response("data: {}\n\n", {
      headers: { "Content-Type": "text/event-stream" },
    })
  )
  await apiStream(path, { method: "POST" })
  expect(historyCache).toHaveBeenCalledExactlyOnceWith({
    action: "invalidate-conversation",
    source: currentAccountSource(),
    conversationId: "c1",
  })
  historyCache.mockClear()
  fetchMock.mockResolvedValue(response(null, 400))
  await apiStream(path, { method: "POST" })
  expect(historyCache).not.toHaveBeenCalled()
})

it("does not return a delayed snapshot after the same conversation is deleted", async () => {
  fetchMock.mockRejectedValueOnce(new TypeError("offline"))
  let resolveCache!: (value: unknown) => void
  historyCache.mockImplementation((request) =>
    request.action === "get"
      ? new Promise((resolve) => {
          resolveCache = resolve
        })
      : Promise.resolve(null)
  )
  const reading = apiRequest("/conversations/c1", { silent: true })
  const rejected = expect(reading).rejects.toMatchObject({ code: 0 })
  await vi.waitFor(() => expect(historyCache).toHaveBeenCalled())
  fetchMock.mockResolvedValue(response(null))
  await apiRequest("/conversations/c1", { method: "DELETE", silent: true })
  resolveCache({ value: detail, cachedAt })
  await rejected
  expect(useHistoryCacheStatusStore.getState().offline).toBe(false)
})

it("does not clear a new session when an old token refresh fails late", async () => {
  let resolveRefresh!: (value: Response) => void
  fetchMock.mockResolvedValueOnce(response(null, 401)).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveRefresh = resolve
      })
  )
  const reading = apiRequest("/model-options", { silent: true })
  const rejected = expect(reading).rejects.toMatchObject({ name: "AbortError" })
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  beginDataSourceChange()
  useSessionStore.setState({
    accessToken: "new-token",
    user: { id: 2 } as AuthUser,
  })
  resolveRefresh(response(null, 401))
  await rejected
  expect(useSessionStore.getState().user?.id).toBe(2)
  expect(useSessionStore.getState().accessToken).toBe("new-token")
})
