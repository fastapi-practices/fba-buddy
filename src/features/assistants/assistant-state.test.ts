import { beforeEach, describe, expect, it } from "vitest"

import { assistantOpening } from "@/features/assistants/assistant"
import {
  selectConversationAssistant,
  startAssistantChat,
} from "@/features/assistants/assistant-state"
import { useComposerStore } from "@/features/chat/composer-store"
import { useSelectionStore } from "@/features/shell/selection-store"
import type { AssistantItem } from "@/lib/types"

describe("selectConversationAssistant", () => {
  beforeEach(() => {
    useSelectionStore.setState({
      selectedConversationId: null,
      selectedAssistantId: null,
      chatEpoch: 0,
      chatPaneKey: "draft-0",
    })
    useComposerStore.setState({ draft: "" })
  })

  it("keeps a draft chat and only stores the assistant id", async () => {
    await selectConversationAssistant(12)
    expect(useSelectionStore.getState().selectedAssistantId).toBe(12)
    expect(useSelectionStore.getState().selectedConversationId).toBeNull()
    expect(useSelectionStore.getState().chatPaneKey).toBe("draft-0")
  })

  it("starts a new conversation when switching assistants on an existing chat", async () => {
    useSelectionStore.setState({
      selectedConversationId: "conv-1",
      selectedAssistantId: 1,
      chatPaneKey: "conv-1",
    })
    await selectConversationAssistant(12)
    const ui = useSelectionStore.getState()
    expect(ui.selectedAssistantId).toBe(12)
    expect(ui.selectedConversationId).toBeNull()
    expect(ui.chatPaneKey).toMatch(/^draft-/)
    expect(ui.chatPaneKey).not.toBe("conv-1")
  })

  it("fills the composer with an opening and does not require a title change", async () => {
    await selectConversationAssistant(12, { opening: "  早上好，从提纲开始  " })
    expect(useSelectionStore.getState().selectedAssistantId).toBe(12)
    expect(useComposerStore.getState().draft).toBe("早上好，从提纲开始")
  })

  it("starts a new chat with an opening from the assistants page", () => {
    useSelectionStore.setState({
      selectedConversationId: "conv-1",
      selectedAssistantId: 1,
      chatPaneKey: "conv-1",
    })
    startAssistantChat(9, "  从提纲开始  ")
    const ui = useSelectionStore.getState()
    expect(ui.selectedAssistantId).toBe(9)
    expect(ui.selectedConversationId).toBeNull()
    expect(ui.chatPaneKey).toMatch(/^draft-/)
    expect(useComposerStore.getState().draft).toBe("从提纲开始")
  })

  it("clears the selected assistant on a draft chat", async () => {
    useSelectionStore.setState({ selectedAssistantId: 12 })
    await selectConversationAssistant(null)
    expect(useSelectionStore.getState().selectedAssistantId).toBeNull()
  })

  it("fills the first starter when summoning without a chosen quote", () => {
    const assistant: AssistantItem = {
      id: 9,
      name: "写作助手",
      description: null,
      category: null,
      sort: 0,
      usage_count: 0,
      starters: ["  从提纲开始  ", "继续写"],
    }
    startAssistantChat(assistant.id, assistantOpening(assistant))
    expect(useComposerStore.getState().draft).toBe("从提纲开始")
  })
})
