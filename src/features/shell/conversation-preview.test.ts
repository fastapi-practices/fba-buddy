import { describe, expect, it } from "vitest"

import {
  conversationPreviewAssistantName,
  conversationPreviewProjectName,
  conversationPreviewText,
  conversationPreviewTime,
} from "@/features/shell/conversation-preview"
import type { ConversationListItem } from "@/lib/types"
import { conversationListItemFixture } from "@/test/conversation-fixtures"

function item(patch: Partial<ConversationListItem> = {}): ConversationListItem {
  return conversationListItemFixture({
    ...patch,
    id: patch.id ?? 1,
    title: patch.title ?? "标题",
  })
}

describe("conversation preview", () => {
  it("prefers last message time, then updated, then created", () => {
    expect(
      conversationPreviewTime(
        item({
          last_message_time: "2026-09-10T01:00:00Z",
          updated_time: "2026-09-09T01:00:00Z",
        })
      )
    ).toBe("2026-09-10T01:00:00Z")
    expect(
      conversationPreviewTime(item({ updated_time: "2026-09-09T01:00:00Z" }))
    ).toBe("2026-09-09T01:00:00Z")
    expect(conversationPreviewTime(item())).toBe("2026-01-01T00:00:00Z")
  })

  it("trims last message preview and treats blanks as empty", () => {
    expect(
      conversationPreviewText(item({ last_message_preview: "  你好  " }))
    ).toBe("你好")
    expect(
      conversationPreviewText(item({ last_message_preview: "   " }))
    ).toBeNull()
    expect(conversationPreviewText(item())).toBeNull()
  })

  it("resolves project and assistant names from ids", () => {
    const chat = item({ project_id: 8, assistant_id: 3 })
    expect(
      conversationPreviewProjectName(chat, [{ id: 8, name: "工作" }])
    ).toBe("工作")
    expect(
      conversationPreviewAssistantName(chat, [{ id: 3, name: "写作助手" }])
    ).toBe("写作助手")
    expect(
      conversationPreviewProjectName(item(), [{ id: 8, name: "工作" }])
    ).toBeNull()
    expect(
      conversationPreviewAssistantName(item({ assistant_id: 9 }), [
        { id: 3, name: "写作助手" },
      ])
    ).toBeNull()
  })
})
