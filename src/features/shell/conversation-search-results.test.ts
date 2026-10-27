import { describe, expect, it, vi } from "vitest"
import type {
  ConversationSearchPage,
  SearchResult,
} from "@/api/conversation-search"
import {
  conversationSearchHighlight,
  loadConversationSearchPage,
  mergeConversationSearchResults,
  mergeLiveConversationSearchResults,
} from "./conversation-search-results"

const message: SearchResult = {
  kind: "message",
  conversation_id: "old-chat",
  title: "Old chat",
  message_id: 71,
  snapshot_id: "assistant-71",
  excerpt: "The needle appears here",
}
const page = (
  items: SearchResult[],
  next_cursor: string | null = null
): ConversationSearchPage => ({
  items,
  next_cursor,
  has_more: !!next_cursor,
  complete: !next_cursor,
})

describe("conversation search results", () => {
  it("continues beyond empty scan pages without showing a false empty result", async () => {
    const search = vi
      .fn()
      .mockResolvedValueOnce(page([], "older-1"))
      .mockResolvedValueOnce(page([], "older-2"))
      .mockResolvedValueOnce(page([message], "older-3"))
    const progress = vi.fn()
    expect(
      await loadConversationSearchPage(search, { query: "needle" }, progress)
    ).toEqual(page([message], "older-3"))
    expect(search.mock.calls.map(([request]) => request.cursor)).toEqual([
      undefined,
      "older-1",
      "older-2",
    ])
    expect(progress).toHaveBeenCalledTimes(3)
  })

  it("rejects looping and incomplete scans instead of declaring no results", async () => {
    const looping = vi.fn().mockResolvedValue(page([], "same"))
    await expect(
      loadConversationSearchPage(looping, { query: "needle" })
    ).rejects.toThrow()
    expect(looping).toHaveBeenCalledTimes(2)
    const incomplete = vi
      .fn()
      .mockResolvedValue({ ...page([]), complete: false })
    await expect(
      loadConversationSearchPage(incomplete, { query: "needle" })
    ).rejects.toThrow()
  })

  it("does not publish stale responses or continue scanning after cancellation", async () => {
    const controller = new AbortController()
    const search = vi.fn(async () => {
      controller.abort()
      return page([message], "next")
    })
    const progress = vi.fn()
    await expect(
      loadConversationSearchPage(
        search,
        {
          query: "needle",
          signal: controller.signal,
        },
        progress
      )
    ).rejects.toMatchObject({ name: "AbortError" })
    expect(search).toHaveBeenCalledTimes(1)
    expect(progress).not.toHaveBeenCalled()
  })

  it("keeps partial results distinct across conversations and occurrences", () => {
    const second = { ...message, conversation_id: "other-chat" }
    const repeated = { ...message, occurrence: 1 }
    expect(
      mergeConversationSearchResults([message], [message, second, repeated])
    ).toEqual([message, second, repeated])
  })

  it("highlights literal terms without parsing markup or regular expressions", () => {
    expect(
      conversationSearchHighlight("A <script> and a <script>", "<script>")
    ).toEqual([
      { text: "A ", match: false },
      { text: "<script>", match: true },
      { text: " and a ", match: false },
      { text: "<script>", match: true },
    ])
    expect(
      conversationSearchHighlight("FILE.ts and file.ts", "file.ts")
        .filter((part) => part.match)
        .map((part) => part.text)
    ).toEqual(["FILE.ts", "file.ts"])
  })

  it("keeps an unsaved live match searchable and deduplicates it after persistence", () => {
    const live = {
      source: "local:device:1",
      conversationId: "old-chat",
      messages: [
        {
          id: "assistant-71",
          role: "assistant" as const,
          content: "The live needle",
          isPlaceholder: true,
          status: "streaming" as const,
        },
      ],
    }
    const options = {
      source: live.source,
      query: "needle",
      fallbackTitle: "New chat",
    }
    const unsaved = mergeLiveConversationSearchResults([], [live], options)
    expect(unsaved).toHaveLength(1)
    expect(unsaved[0]).toMatchObject({
      snapshot_id: "assistant-71",
      text: "The live needle",
    })
    expect(unsaved[0].message_id).toBeUndefined()
    const saved = mergeLiveConversationSearchResults(
      [{ ...message, is_archived: true }],
      [live],
      options
    )
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({
      message_id: 71,
      snapshot_id: "assistant-71",
      is_archived: true,
      title: "Old chat",
    })
    expect(mergeConversationSearchResults(unsaved, [message])).toHaveLength(1)
    expect(
      mergeConversationSearchResults(
        [{ ...message, snapshot_id: undefined }],
        saved
      )
    ).toHaveLength(1)
  })

  it("isolates live sources and current scope, using the known conversation title", () => {
    const entry = {
      source: "cloud:alice:4",
      conversationId: "one",
      messages: [{ id: "live", role: "user" as const, content: "needle" }],
    }
    const options = {
      source: entry.source,
      query: "needle",
      titles: { one: "Known title" },
      fallbackTitle: "New chat",
    }
    expect(
      mergeLiveConversationSearchResults([], [entry], options)[0].title
    ).toBe("Known title")
    expect(
      mergeLiveConversationSearchResults([], [entry], {
        ...options,
        source: "cloud:bob:4",
      })
    ).toEqual([])
    expect(
      mergeLiveConversationSearchResults([], [entry], {
        ...options,
        conversationId: "other",
      })
    ).toEqual([])
  })

  it("updates live matches from the latest published pane without retaining old stored text", () => {
    const old = {
      source: "local:device:1",
      conversationId: "old-chat",
      messages: [
        {
          id: "assistant-71",
          role: "assistant" as const,
          pk: 71,
          content: "old needle text",
        },
      ],
    }
    const fresh = {
      ...old,
      messages: [{ ...old.messages[0], content: "new needle text" }],
    }
    const options = {
      source: old.source,
      query: "needle",
      fallbackTitle: "New chat",
    }
    expect(
      mergeLiveConversationSearchResults([message], [old, fresh], options)
    ).toMatchObject([{ text: "new needle text" }])
    const shortened = {
      ...fresh,
      messages: [{ ...fresh.messages[0], content: "edited away" }],
    }
    expect(
      mergeLiveConversationSearchResults([message], [old, shortened], options)
    ).toEqual([])
  })
})
