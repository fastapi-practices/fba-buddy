import { describe, expect, it } from "vitest"

import { shouldMarkConversationUnread } from "@/features/chat/conversation-unread"

describe("shouldMarkConversationUnread", () => {
  it("marks a completed reply unread when another conversation is open", () => {
    expect(
      shouldMarkConversationUnread({
        conversationId: "a",
        viewedConversationId: "b",
      })
    ).toBe(true)
  })

  it("marks a completed reply unread after leaving the chat page", () => {
    expect(
      shouldMarkConversationUnread({
        conversationId: "a",
        viewedConversationId: null,
      })
    ).toBe(true)
  })

  it("keeps the open conversation read even when the window is unfocused", () => {
    expect(
      shouldMarkConversationUnread({
        conversationId: "a",
        viewedConversationId: "a",
      })
    ).toBe(false)
  })
})
