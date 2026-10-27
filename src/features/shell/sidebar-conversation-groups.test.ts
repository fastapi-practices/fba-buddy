import { describe, expect, it } from "vitest"

import { partitionSidebarConversations } from "@/features/shell/sidebar-conversation-groups"
import type { ConversationListItem } from "@/lib/types"
import { conversationListItemFixture } from "@/test/conversation-fixtures"

function item(
  patch: Partial<ConversationListItem> &
    Pick<ConversationListItem, "conversation_id" | "title">
): ConversationListItem {
  return conversationListItemFixture({
    ...patch,
    id: patch.id ?? 1,
    title: patch.title,
    conversation_id: patch.conversation_id,
  })
}

describe("partitionSidebarConversations", () => {
  it("puts every pinned chat in the pinned group regardless of project", () => {
    const pinnedLoose = item({
      conversation_id: "p1",
      title: "loose",
      is_pinned: true,
    })
    const pinnedProject = item({
      conversation_id: "p2",
      title: "project",
      project_id: 8,
      is_pinned: true,
    })
    const ungrouped = item({ conversation_id: "u1", title: "ungrouped" })
    const inProject = item({
      conversation_id: "u2",
      title: "in-project",
      project_id: 8,
    })

    const { pinned, byProject } = partitionSidebarConversations([
      pinnedLoose,
      pinnedProject,
      ungrouped,
      inProject,
    ])

    expect(pinned).toEqual([pinnedLoose, pinnedProject])
    expect(byProject.get(null)).toEqual([ungrouped])
    expect(byProject.get(8)).toEqual([inProject])
  })

  it("returns unpinned chats to their project after they leave the pin group", () => {
    const { pinned, byProject } = partitionSidebarConversations([
      item({
        conversation_id: "c1",
        title: "back",
        project_id: 3,
        is_pinned: false,
      }),
    ])
    expect(pinned).toEqual([])
    expect(byProject.get(3)?.map((entry) => entry.conversation_id)).toEqual([
      "c1",
    ])
  })

  it("hides archived chats from both groups", () => {
    const { pinned, byProject } = partitionSidebarConversations([
      item({
        conversation_id: "p1",
        title: "pinned archived",
        is_pinned: true,
        is_archived: true,
      }),
      item({
        conversation_id: "u1",
        title: "archived",
        is_archived: true,
      }),
      item({ conversation_id: "u2", title: "visible" }),
    ])

    expect(pinned).toEqual([])
    expect(byProject.get(null)?.map((entry) => entry.conversation_id)).toEqual([
      "u2",
    ])
  })
})
