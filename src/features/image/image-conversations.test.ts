import { describe, expect, it } from "vitest"
import {
  mergeImageConversationMessages,
  mergeImageConversationRecords,
} from "./image-conversations"
import type { ImageGenItem } from "./image-store"
import type { ChatMessage, ConversationListItem } from "@/lib/types"
import {
  conversationDetailFixture,
  conversationListItemFixture,
} from "@/test/conversation-fixtures"

const local = (conversationId: string, updatedAt: number): ImageGenItem => ({
  id: conversationId,
  conversationId,
  prompt: "local title",
  content: "",
  urls: [],
  status: "complete",
  createdAt: updatedAt,
  updatedAt,
  size: "auto",
  quality: "auto",
  aspect: "1:1",
})
const remote = (conversationId: string): ConversationListItem =>
  conversationListItemFixture({
    id: 1,
    conversation_id: conversationId,
    title: "saved title",
    surface: "image",
    last_message_preview: "saved preview",
  })

describe("image conversation history", () => {
  it("merges server pages by conversation ID while retaining local records without a cap", () => {
    const records = mergeImageConversationRecords(
      [remote("shared"), remote("shared"), remote("server")],
      [
        {
          ...local("shared", Date.parse("2026-10-02T00:00:00Z")),
          status: "streaming",
        },
        ...Array.from({ length: 40 }, (_, i) => local(`local-${i}`, i)),
      ]
    )
    expect(records).toHaveLength(42)
    expect(records[0]).toMatchObject({
      conversationId: "shared",
      title: "saved title",
      isGenerating: true,
    })
    expect(records.at(-1)?.conversationId).toBe("local-0")
  })

  it("keeps earlier loaded messages when refreshing the recent page", () => {
    const current: ChatMessage[] = [
      { id: "old-user", role: "user", content: "first picture" },
      { id: "old-assistant", role: "assistant", content: "first result" },
      { id: "new-user", role: "user", content: "make it blue" },
      { id: "live", role: "assistant", content: "partial" },
    ]
    const next = mergeImageConversationMessages(
      conversationDetailFixture({
        id: 1,
        title: "drawing",
        history_has_more: true,
        history_cursor: "before-new",
        messages_snapshot: {
          messages: [
            { id: "new-user", role: "user", content: "make it blue" },
            { id: "saved", role: "assistant", content: "blue result" },
          ],
        },
      }),
      current
    )
    expect(next.map((message) => message.id)).toEqual([
      "old-user",
      "old-assistant",
      "new-user",
      "saved",
    ])
  })
})
