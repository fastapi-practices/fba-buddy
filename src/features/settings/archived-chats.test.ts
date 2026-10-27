import { describe, expect, it } from "vitest"

import {
  conversationMatchesArchivedFilters,
  groupArchivedConversations,
  parseArchivedAssistantFilter,
  parseArchivedProjectFilter,
} from "@/features/settings/archived-chats"
import type { ConversationListItem, ProjectItem } from "@/lib/types"
import { conversationListItemFixture } from "@/test/conversation-fixtures"

function chat(
  partial: Partial<ConversationListItem> &
    Pick<ConversationListItem, "conversation_id" | "title">
): ConversationListItem {
  return conversationListItemFixture({
    ...partial,
    id: partial.id ?? 1,
    title: partial.title,
    conversation_id: partial.conversation_id,
    is_archived: true,
  })
}

const projects: ProjectItem[] = [
  {
    id: 2,
    user_id: 1,
    name: "beta",
    sort: 2,
    archived: false,
  },
  {
    id: 1,
    user_id: 1,
    name: "alpha",
    sort: 1,
    archived: false,
  },
]

describe("archived chat filters", () => {
  it("parses project and assistant filter values", () => {
    expect(parseArchivedProjectFilter("all")).toBe("all")
    expect(parseArchivedProjectFilter("none")).toBe("none")
    expect(parseArchivedProjectFilter("8")).toBe(8)
    expect(parseArchivedProjectFilter("nope")).toBe("all")
    expect(parseArchivedAssistantFilter("all")).toBe("all")
    expect(parseArchivedAssistantFilter("3")).toBe(3)
  })

  it("filters by title, project, and assistant", () => {
    const item = chat({
      conversation_id: "a",
      title: "周报草稿",
      project_id: 1,
      assistant_id: 9,
    })
    expect(
      conversationMatchesArchivedFilters(item, {
        query: "周报",
        projectFilter: "all",
        assistantFilter: "all",
      })
    ).toBe(true)
    expect(
      conversationMatchesArchivedFilters(item, {
        query: "日报",
        projectFilter: "all",
        assistantFilter: "all",
      })
    ).toBe(false)
    expect(
      conversationMatchesArchivedFilters(item, {
        query: "",
        projectFilter: "none",
        assistantFilter: "all",
      })
    ).toBe(false)
    expect(
      conversationMatchesArchivedFilters(item, {
        query: "",
        projectFilter: 1,
        assistantFilter: 9,
      })
    ).toBe(true)
  })
})

describe("groupArchivedConversations", () => {
  it("groups named projects first, then 无项目, newest first", () => {
    const items = [
      chat({
        conversation_id: "u1",
        title: "未分组旧",
        last_message_time: "2026-09-01T00:00:00.000Z",
      }),
      chat({
        conversation_id: "p2",
        title: "beta 新",
        project_id: 2,
        last_message_time: "2026-09-09T00:00:00.000Z",
      }),
      chat({
        conversation_id: "p1",
        title: "alpha",
        project_id: 1,
        last_message_time: "2026-09-08T00:00:00.000Z",
      }),
      chat({
        conversation_id: "u2",
        title: "未分组新",
        last_message_time: "2026-09-10T00:00:00.000Z",
      }),
    ]
    const groups = groupArchivedConversations(items, projects)
    expect(groups.map((group) => group.name)).toEqual([
      "alpha",
      "beta",
      "无项目",
    ])
    expect(groups[2]?.items.map((item) => item.conversation_id)).toEqual([
      "u2",
      "u1",
    ])
  })
})
