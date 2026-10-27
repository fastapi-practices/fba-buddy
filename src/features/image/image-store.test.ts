import { beforeEach, describe, expect, it } from "vitest"

import { useImageStore, type ImageGenItem } from "@/features/image/image-store"

function item(conversationId: string): ImageGenItem {
  return {
    id: conversationId,
    conversationId,
    prompt: conversationId,
    content: "",
    urls: [],
    status: "complete",
    createdAt: 1,
    size: "auto",
    quality: "auto",
    aspect: "1:1",
  }
}

beforeEach(() => {
  useImageStore.setState({
    prompt: "",
    items: [],
    selectedConversationId: null,
  })
})

describe("image store", () => {
  it("removes every local record for a deleted conversation and resets its selection", () => {
    useImageStore.setState({
      prompt: "draft",
      items: [item("deleted"), item("keep"), item("deleted")],
      selectedConversationId: "deleted",
    })

    useImageStore.getState().removeConversation("deleted")

    expect(useImageStore.getState()).toMatchObject({
      prompt: "",
      items: [item("keep")],
      selectedConversationId: null,
    })
  })
})
