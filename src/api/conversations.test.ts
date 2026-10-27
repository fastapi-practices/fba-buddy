import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  clearConversationLoads,
  getConversation,
  listConversations,
  patchConversationWorkspace,
} from "@/api/conversations"
import * as http from "@/api/http"
import {
  beginDataSourceChange,
  useAccountSourceStore,
} from "@/lib/account-source"
import type {
  AuthUser,
  ConversationDetail,
  ConversationDetailWire,
} from "@/lib/types"
import { useSessionStore } from "@/lib/session"
import { useHistoryCacheStatusStore } from "@/lib/history-cache-status"
import { notifyError } from "@/lib/notify"
import { conversationAgentMode } from "@/features/chat/conversation-mode"
import { conversationDetailFixture } from "@/test/conversation-fixtures"

vi.mock("@/lib/notify", () => ({
  notifyError: vi.fn(),
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function detailWire(detail: ConversationDetail): ConversationDetailWire {
  return {
    id: detail.id,
    conversationId: detail.conversation_id,
    title: detail.title,
    agentMode: detail.agent_mode,
    projectId: detail.project_id,
    assistantId: detail.assistant_id,
    goal: detail.goal,
    origin: detail.origin,
    surface: detail.surface,
    isPinned: detail.is_pinned,
    isArchived: detail.is_archived,
    isGenerating: detail.is_generating,
    source: detail.source,
    providerId: detail.provider_id,
    modelId: detail.model_id,
    revision: detail.revision,
    createdTime: detail.created_time,
    updatedTime: detail.updated_time,
    messagesSnapshot: detail.messages_snapshot,
    historyHasMore: detail.history_has_more,
    historyCursor: detail.history_cursor,
  }
}

function detailResponse(value: ConversationDetailWire) {
  return new Response(JSON.stringify({ code: 200, data: value }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}

describe("listConversations", () => {
  afterEach(() => vi.restoreAllMocks())

  it("requests image conversations with cursor pagination and cancellation", async () => {
    const page = { items: [], has_more: false, next_cursor: null }
    const request = vi.spyOn(http, "apiRequest").mockResolvedValue(page)
    const signal = new AbortController().signal

    expect(
      await listConversations(
        { surface: "image", cursor: "next+page/2", size: 30 },
        { signal, silent: true }
      )
    ).toEqual(page)
    expect(request).toHaveBeenCalledExactlyOnceWith(
      "/conversations?surface=image&cursor=next%2Bpage%2F2&size=30",
      { signal, silent: true }
    )
  })

  it("keeps the server's chat surface default for existing callers", async () => {
    const request = vi
      .spyOn(http, "apiRequest")
      .mockResolvedValue({ items: [] })

    await listConversations()

    expect(request).toHaveBeenCalledExactlyOnceWith("/conversations", {})
  })

  it.each(["chat", "work", "coding"] as const)(
    "requests the %s list view without applying an exact mode filter",
    async (view) => {
      const request = vi
        .spyOn(http, "apiRequest")
        .mockResolvedValue({ items: [] })

      await listConversations({ view })

      expect(request).toHaveBeenCalledExactlyOnceWith(
        `/conversations?view=${view}`,
        {}
      )
    }
  )

  it("combines list view and exact mode with project, assistant, archive and pagination filters", async () => {
    const request = vi
      .spyOn(http, "apiRequest")
      .mockResolvedValue({ items: [] })
    const signal = new AbortController().signal

    await listConversations(
      {
        project_id: 7,
        assistant_id: 3,
        q: "launch plan",
        archived: true,
        surface: "chat",
        view: "coding",
        agent_mode: "work",
        cursor: "next+page/2",
        size: 30,
      },
      { signal }
    )

    expect(request).toHaveBeenCalledExactlyOnceWith(
      "/conversations?project_id=7&assistant_id=3&q=launch+plan&archived=true&surface=chat&view=coding&agent_mode=work&cursor=next%2Bpage%2F2&size=30",
      { signal }
    )
  })

  it("normalizes the backend's camelCase list fields for conversation navigation", async () => {
    const item = {
      id: 1,
      conversationId: "existing-chat",
      title: "Existing conversation",
      agentMode: "coding",
      projectId: 2,
      assistantId: 3,
      origin: "web",
      surface: "chat",
      isPinned: true,
      isArchived: true,
      isGenerating: true,
      source: "cloud",
      lastMessagePreview: "Saved reply",
      lastMessageTime: "2026-10-12T08:00:00Z",
      revision: 4,
      createdTime: "2026-10-11T08:00:00Z",
      updatedTime: "2026-10-12T08:00:00Z",
    }
    vi.spyOn(http, "apiRequest").mockResolvedValue({
      items: [item],
      has_more: true,
      next_cursor: "next-page",
    })

    expect(await listConversations()).toEqual({
      items: [
        {
          id: 1,
          conversation_id: "existing-chat",
          title: "Existing conversation",
          agent_mode: "coding",
          project_id: 2,
          assistant_id: 3,
          origin: "web",
          surface: "chat",
          is_pinned: true,
          is_archived: true,
          is_generating: true,
          source: "cloud",
          last_message_preview: "Saved reply",
          last_message_time: "2026-10-12T08:00:00Z",
          revision: 4,
          created_time: "2026-10-11T08:00:00Z",
          updated_time: "2026-10-12T08:00:00Z",
        },
      ],
      has_more: true,
      next_cursor: "next-page",
    })
    expect(conversationAgentMode("existing-chat")).toBe("coding")
  })
})

describe("conversation list validation", () => {
  afterEach(() => vi.restoreAllMocks())

  it("rejects list items without a usable conversation ID", async () => {
    vi.spyOn(http, "apiRequest").mockResolvedValue({
      items: [{ id: 1, title: "Missing conversation ID" }],
      has_more: false,
      next_cursor: null,
    })

    await expect(listConversations()).rejects.toThrow()
  })
})

describe("getConversation", () => {
  beforeEach(() => {
    clearConversationLoads()
    useSessionStore.setState({ accessToken: null, user: null })
    useHistoryCacheStatusStore.setState({ offline: false, cachedAt: null })
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return detailResponse(
          detailWire(
            conversationDetailFixture({ id: 1, conversation_id: "c1" })
          )
        )
      })
    )
  })

  afterEach(() => {
    clearConversationLoads()
    useSessionStore.setState({ accessToken: null, user: null })
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("reuses an in-flight request for the same conversation", async () => {
    const first = getConversation("c1")
    const second = getConversation("c1")
    expect(second).toBe(first)
    await Promise.all([first, second])
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it("keeps a missing creation probe silent and forwards its cancellation signal", async () => {
    vi.mocked(notifyError).mockClear()
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 404, msg: "Missing", data: null }), {
        status: 404,
      })
    )
    const controller = new AbortController()
    await expect(
      getConversation("pending-chat", {
        refresh: true,
        silent: true,
        signal: controller.signal,
      })
    ).rejects.toMatchObject({ code: 404 })
    expect(notifyError).not.toHaveBeenCalled()
    const signal = vi.mocked(fetch).mock.calls[0]![1]!.signal!
    controller.abort()
    expect(signal.aborted).toBe(true)
  })

  it("refreshes after a run without letting an earlier read clear its in-flight request or cache stale history", async () => {
    const older = deferred<Response>()
    const terminal = deferred<Response>()
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(terminal.promise)
    const historyCache = vi.fn().mockResolvedValue(null)
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
    useSessionStore.setState({
      accessToken: "token",
      user: { id: 1 } as AuthUser,
    })
    const first = getConversation("c1", { messageLimit: 50 })
    const fresh = getConversation("c1", { messageLimit: 50, refresh: true })
    expect(fresh).not.toBe(first)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

    older.resolve(
      detailResponse(
        detailWire(
          conversationDetailFixture({ id: 1, title: "Still generating" })
        )
      )
    )
    await first
    expect(getConversation("c1", { messageLimit: 50 })).toBe(fresh)
    expect(historyCache.mock.calls.map(([request]) => request.action)).toEqual([
      "invalidate-conversation",
    ])

    const completed = conversationDetailFixture({
      id: 1,
      title: "Completed reply",
    })
    terminal.resolve(detailResponse(detailWire(completed)))
    expect(await fresh).toEqual(completed)
    expect(historyCache.mock.calls.map(([request]) => request.action)).toEqual([
      "invalidate-conversation",
      "put",
    ])
    expect(historyCache).toHaveBeenLastCalledWith(
      expect.objectContaining({ value: detailWire(completed) })
    )
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("does not start the refreshed read in another account while cache invalidation is pending", async () => {
    const invalidation = deferred<null>()
    const historyCache = vi.fn().mockReturnValue(invalidation.promise)
    vi.stubGlobal("window", {
      location: { href: "http://localhost:4174/" },
      buddyDesktop: {
        historyCache,
        loadSession: vi.fn(async () => null),
        saveSession: vi.fn(async () => true),
        clearSession: vi.fn(async () => true),
      },
    })
    useSessionStore.setState({ user: { id: 1 } as AuthUser })
    const fresh = getConversation("c1", { refresh: true })
    const rejected = expect(fresh).rejects.toMatchObject({ name: "AbortError" })
    beginDataSourceChange()
    useSessionStore.setState({ user: { id: 2 } as AuthUser })
    invalidation.resolve(null)
    await rejected
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe("patchConversationWorkspace", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    useAccountSourceStore.setState({ account: "anonymous" })
  })

  it("does not write old conversation metadata into a new source after a pending read", async () => {
    let resolveDetail!: (value: ConversationDetailWire) => void
    const detail = new Promise<ConversationDetailWire>((resolve) => {
      resolveDetail = resolve
    })
    const request = vi
      .spyOn(http, "apiRequest")
      .mockResolvedValue(null)
      .mockReturnValueOnce(detail)
    const patching = patchConversationWorkspace("same-conversation-id", {
      project_id: 2,
    })
    const rejected = expect(patching).rejects.toMatchObject({
      name: "AbortError",
    })

    beginDataSourceChange()
    useAccountSourceStore.setState({ account: "new-account", ready: true })
    resolveDetail(
      detailWire(
        conversationDetailFixture({
          id: 1,
          title: "Old source conversation",
          project_id: 1,
          assistant_id: 9,
          goal: "Existing goal",
        })
      )
    )
    await rejected

    expect(request).toHaveBeenCalledExactlyOnceWith(
      "/conversations/same-conversation-id",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
  })
})
