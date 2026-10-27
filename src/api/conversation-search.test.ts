import { beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError, apiRequest } from "./http"
import {
  getConversation,
  listConversations,
  searchConversationMessages,
} from "./conversations"
import { searchConversations } from "./conversation-search"
import type { SearchResult } from "./conversation-search"
import type { ConversationListItem } from "@/lib/types"
import { conversationDetailFixture } from "@/test/conversation-fixtures"

vi.mock("./http", () => ({
  apiRequest: vi.fn(),
  ApiError: class extends Error {
    code: number
    constructor(code: number, message: string) {
      super(message)
      this.code = code
    }
  },
}))
vi.mock("./conversations", () => ({
  getConversation: vi.fn(),
  listConversations: vi.fn(),
  searchConversationMessages: vi.fn(),
}))
vi.mock("@/lib/account-source", () => ({
  dataSourceKey: () => "account:test:0",
  dataSourceSignal: (signal?: AbortSignal) =>
    signal ?? new AbortController().signal,
}))
beforeEach(() => {
  vi.resetAllMocks()
})

const conversation = (id: string, title = id, archived = false) =>
  ({
    conversation_id: id,
    title,
    is_archived: archived,
  }) as ConversationListItem
const hit = (id: number, text = "needle") => ({
  message_id: id,
  snapshot_id: `message-${id}`,
  message_index: id,
  role: "assistant",
  text,
  excerpt: text.slice(0, 240),
})
async function collect(query = "needle") {
  const items: SearchResult[] = []
  let cursor: string | null = null
  for (let n = 0; n < 200; n++) {
    const page = await searchConversations({ query, cursor, limit: 7 })
    items.push(...page.items)
    expect(page.complete).toBe(!page.has_more)
    if (page.complete) return items
    expect(page.next_cursor).toBeTruthy()
    cursor = page.next_cursor
  }
  throw new Error("Search did not finish")
}

describe("unified conversation search", () => {
  it("searches beyond the first conversation and message pages, including archives, with at most four concurrent requests", async () => {
    const chats = Array.from({ length: 101 }, (_, index) =>
      conversation(
        `chat-${index}`,
        index === 100 ? "Needle title" : `chat-${index}`
      )
    )
    vi.mocked(listConversations).mockImplementation(async (params) =>
      params?.archived
        ? {
            items: [conversation("archived", "needle archive", true)],
            has_more: false,
            next_cursor: null,
          }
        : params?.cursor
          ? { items: chats.slice(100), has_more: false, next_cursor: null }
          : {
              items: chats.slice(0, 100),
              has_more: true,
              next_cursor: "active-next",
            }
    )
    let active = 0,
      maximum = 0
    vi.mocked(searchConversationMessages).mockImplementation(
      async (id, query, cursor) => {
        active++
        maximum = Math.max(maximum, active)
        await Promise.resolve()
        active--
        expect(query).toBe("needle")
        if (id === "chat-100")
          return cursor
            ? { items: [hit(51), hit(52)], has_more: false, next_cursor: null }
            : {
                items: Array.from({ length: 50 }, (_, index) => hit(index + 1)),
                has_more: true,
                next_cursor: "message-next",
              }
        return {
          items: id === "archived" ? [hit(1000)] : [],
          has_more: false,
          next_cursor: null,
        }
      }
    )
    const items = await collect("  NeEdLe  ")
    expect(items.filter((item) => item.kind === "message")).toHaveLength(53)
    expect(items.filter((item) => item.kind === "conversation")).toHaveLength(2)
    expect(
      items.some((item) => item.is_archived && item.message_id === 1000)
    ).toBe(true)
    expect(maximum).toBeLessThanOrEqual(4)
    expect(listConversations).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: "active-next" }),
      expect.anything()
    )
  })

  it.each([404, 405, 501])(
    "reports an unavailable message-search endpoint (%i) without scanning history",
    async (status) => {
      vi.mocked(listConversations).mockResolvedValue({
        items: [conversation("chat")],
        has_more: false,
        next_cursor: null,
      })
      vi.mocked(searchConversationMessages).mockRejectedValue(
        new ApiError(status, "unsupported")
      )
      await expect(collect()).rejects.toMatchObject({ code: status })
      expect(apiRequest).not.toHaveBeenCalled()
    }
  )

  it("scopes search to the current conversation and centers summaries on deep matches", async () => {
    vi.mocked(getConversation).mockResolvedValue(
      conversationDetailFixture({
        id: 1,
        conversation_id: "current",
        title: "title",
        is_archived: false,
      })
    )
    vi.mocked(searchConversationMessages).mockResolvedValue({
      items: [hit(1, `${"prefix ".repeat(100)}NEEDLE ending`)],
      has_more: false,
      next_cursor: null,
    })
    const page = await searchConversations({
      query: "needle",
      conversationId: "current",
    })
    expect(page.complete).toBe(true)
    expect(page.items[0]?.excerpt).toContain("NEEDLE ending")
    expect(page.items[0]?.excerpt?.length).toBeLessThan(250)
    expect(listConversations).not.toHaveBeenCalled()
    expect(getConversation).toHaveBeenCalledWith("current", {
      signal: expect.any(AbortSignal),
      silent: true,
    })
  })

  it("does not turn network errors, broken pagination, or cancellation into a complete empty result", async () => {
    vi.mocked(listConversations).mockResolvedValue({
      items: [conversation("chat")],
      has_more: false,
      next_cursor: null,
    })
    vi.mocked(searchConversationMessages).mockRejectedValue(
      new ApiError(503, "offline")
    )
    await expect(searchConversations({ query: "needle" })).rejects.toThrow(
      "offline"
    )
    vi.mocked(searchConversationMessages).mockResolvedValue({
      items: [],
      has_more: true,
      next_cursor: null,
    })
    await expect(searchConversations({ query: "needle" })).rejects.toThrow(
      "尚未完成"
    )
    const controller = new AbortController()
    vi.mocked(searchConversationMessages).mockImplementation(
      async (_id, _q, _cursor, options) => {
        controller.abort()
        expect(options?.signal).toBe(controller.signal)
        return { items: [], has_more: false, next_cursor: null }
      }
    )
    await expect(
      searchConversations({ query: "needle", signal: controller.signal })
    ).rejects.toThrow()
  })

  it("uses the local unified endpoint, supports blank queries, and rejects mismatched continuation queries", async () => {
    expect(await searchConversations({ query: " \n " })).toMatchObject({
      complete: true,
      items: [],
    })
    expect(listConversations).not.toHaveBeenCalled()
    vi.mocked(listConversations).mockResolvedValue({
      items: [conversation("chat")],
      has_more: true,
      next_cursor: "next",
    })
    vi.mocked(searchConversationMessages).mockResolvedValue({
      items: [hit(1)],
      has_more: false,
      next_cursor: null,
    })
    const page = await searchConversations({ query: "needle", limit: 1 })
    await expect(
      searchConversations({ query: "other", cursor: page.next_cursor })
    ).rejects.toThrow("游标")
  })
})
