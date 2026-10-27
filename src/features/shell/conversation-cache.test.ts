import { QueryClient } from "@tanstack/react-query"
import { describe, expect, it } from "vitest"

import { removeConversationFromCaches } from "@/features/shell/conversation-cache"

describe("removeConversationFromCaches", () => {
  it("removes the conversation from list and infinite page snapshots", () => {
    const queryClient = new QueryClient()
    const keep = { conversation_id: "keep", title: "Keep" }
    const archived = { conversation_id: "archived", title: "Archived" }
    queryClient.setQueryData(["conversations", "list", "work"], {
      items: [keep, archived],
    })
    queryClient.setQueryData(["conversations", "archived"], [keep, archived])
    queryClient.setQueryData(["conversations", "image", "source"], {
      pages: [{ items: [keep, archived], has_more: true }],
      pageParams: [null],
    })

    removeConversationFromCaches(queryClient, "archived")

    expect(queryClient.getQueryData(["conversations", "list", "work"])).toEqual(
      { items: [keep] }
    )
    expect(queryClient.getQueryData(["conversations", "archived"])).toEqual([
      keep,
    ])
    expect(
      queryClient.getQueryData(["conversations", "image", "source"])
    ).toEqual({
      pages: [{ items: [keep], has_more: true }],
      pageParams: [null],
    })
  })
})
