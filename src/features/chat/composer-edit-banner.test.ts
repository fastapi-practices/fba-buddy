import { afterEach, describe, expect, it, vi } from "vitest"

import { useComposerStore } from "@/features/chat/composer-store"

describe("flashLocate", () => {
  afterEach(() => {
    vi.useRealTimers()
    useComposerStore.setState({ locatedMessageId: null, locatedNonce: 0 })
  })

  it("marks the message then clears the highlight", () => {
    vi.useFakeTimers()
    useComposerStore.setState({ locatedMessageId: null, locatedNonce: 0 })
    useComposerStore.getState().flashLocate("u2")
    expect(useComposerStore.getState()).toMatchObject({
      locatedMessageId: "u2",
      locatedNonce: 1,
    })
    useComposerStore.getState().flashLocate("u2")
    expect(useComposerStore.getState().locatedNonce).toBe(2)
    vi.advanceTimersByTime(1800)
    expect(useComposerStore.getState().locatedMessageId).toBeNull()
  })
})

describe("startEditing", () => {
  it("records the message and its conversation, leaves the draft alone", () => {
    /* 草稿由所在栏的输入框就地填充，全局 draft 不动，免得串到分屏另一栏 */
    useComposerStore.setState({
      draft: "正在写",
      editingMessageId: null,
      editingConversationId: null,
    })
    useComposerStore.getState().startEditing("u2", "原来的问题", "conv-1")
    expect(useComposerStore.getState()).toMatchObject({
      editingMessageId: "u2",
      editingConversationId: "conv-1",
      draft: "正在写",
    })
    useComposerStore.getState().clearInput()
    expect(useComposerStore.getState().editingMessageId).toBeNull()
    expect(useComposerStore.getState().editingConversationId).toBeNull()
    expect(useComposerStore.getState().draft).toBe("")
  })
})
