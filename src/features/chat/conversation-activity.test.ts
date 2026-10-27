import { afterEach, describe, expect, it } from "vitest"

import {
  conversationIsGenerating,
  setConversationGenerating,
  useConversationActivityStore,
} from "@/features/chat/conversation-activity"

describe("conversationIsGenerating", () => {
  it("keeps the spinner on while the local run is still open", () => {
    expect(conversationIsGenerating("a", false, ["a"])).toBe(true)
    expect(conversationIsGenerating("a", true, [])).toBe(true)
    expect(conversationIsGenerating("a", false, ["b"])).toBe(false)
  })
})

describe("setConversationGenerating", () => {
  afterEach(() => {
    useConversationActivityStore.setState({
      generatingIds: [],
      messageEpochById: {},
    })
  })

  it("tracks and clears a conversation run", () => {
    setConversationGenerating("conv-1", true)
    setConversationGenerating("conv-1", true)
    expect(useConversationActivityStore.getState().generatingIds).toEqual([
      "conv-1",
    ])
    setConversationGenerating("conv-1", false)
    expect(useConversationActivityStore.getState().generatingIds).toEqual([])
  })

  it("ignores empty ids", () => {
    setConversationGenerating(null, true)
    expect(useConversationActivityStore.getState().generatingIds).toEqual([])
  })
})

describe("bumpMessages", () => {
  afterEach(() => {
    useConversationActivityStore.setState({
      generatingIds: [],
      messageEpochById: {},
    })
  })

  it("increments the reload epoch for a conversation", () => {
    useConversationActivityStore.getState().bumpMessages("conv-1")
    useConversationActivityStore.getState().bumpMessages("conv-1")
    expect(
      useConversationActivityStore.getState().messageEpochById["conv-1"]
    ).toBe(2)
  })
})
