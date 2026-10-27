import { afterEach, beforeEach, expect, it, vi } from "vitest"

import {
  bindAppNavigate,
  openConversation,
  startDraftChat,
} from "@/app/navigation"
import { useComposerStore } from "@/features/chat/composer-store"
import {
  conversationAgentMode,
  useConversationModeStore,
} from "@/features/chat/conversation-mode"
import { useRightSidebarStore } from "@/features/shell/right-sidebar-store"
import { useSelectionStore } from "@/features/shell/selection-store"
import { dataSourceKey } from "@/lib/account-source"
import type { AgentMode } from "@/lib/types"

beforeEach(() => {
  useSelectionStore.setState(useSelectionStore.getInitialState(), true)
  useComposerStore.setState(useComposerStore.getInitialState(), true)
  useConversationModeStore.setState(
    useConversationModeStore.getInitialState(),
    true
  )
  useRightSidebarStore.setState(useRightSidebarStore.getInitialState(), true)
})

afterEach(() => {
  bindAppNavigate(null)
  useSelectionStore.setState(useSelectionStore.getInitialState(), true)
  useComposerStore.setState(useComposerStore.getInitialState(), true)
  useConversationModeStore.setState(
    useConversationModeStore.getInitialState(),
    true
  )
  useRightSidebarStore.setState(useRightSidebarStore.getInitialState(), true)
})

it("opens an existing conversation with its ID and clears its unread state", () => {
  const navigate = vi.fn()
  bindAppNavigate(navigate)
  useSelectionStore.getState().markConversationUnread("existing-chat")

  openConversation("existing-chat")

  expect(navigate).toHaveBeenCalledExactlyOnceWith(
    "/chat/existing-chat",
    undefined
  )
  expect(useSelectionStore.getState()).toMatchObject({
    selectedConversationId: "existing-chat",
    chatPaneKey: "existing-chat",
    unreadConversationIds: [],
  })
})

it.each([undefined, null, "", "   "])(
  "keeps the current conversation when a missing ID reaches navigation: %s",
  (id) => {
    const navigate = vi.fn()
    bindAppNavigate(navigate)
    openConversation("existing-chat")
    navigate.mockClear()
    const current = useSelectionStore.getState()

    openConversation(id as unknown as string)

    expect(useSelectionStore.getState()).toBe(current)
    expect(navigate).not.toHaveBeenCalled()
  }
)

it.each<AgentMode>(["chat", "work", "coding"])(
  "new conversations inherit the manually selected %s mode after opening another conversation",
  (mode) => {
    const navigate = vi.fn()
    bindAppNavigate(navigate)
    useComposerStore.getState().setAgentMode(mode)
    const conversationMode = mode === "work" ? "chat" : "work"
    useConversationModeStore
      .getState()
      .remember(dataSourceKey(), "current-chat", conversationMode)
    openConversation("current-chat")
    navigate.mockClear()

    startDraftChat()

    const selection = useSelectionStore.getState()
    expect(selection).toMatchObject({
      selectedConversationId: null,
      chatPaneKey: "draft-1",
      focusedChatPane: "left",
    })
    expect(useComposerStore.getState().agent_mode).toBe(mode)
    expect(navigate).toHaveBeenCalledExactlyOnceWith("/chat", undefined)
    expect(conversationAgentMode("current-chat")).toBe(conversationMode)
  }
)

it.each<AgentMode>(["chat", "work", "coding"])(
  "repeated new conversations keep the application's %s mode",
  (mode) => {
    useComposerStore.getState().setAgentMode(mode)

    startDraftChat()
    startDraftChat()

    expect(useSelectionStore.getState().chatPaneKey).toBe("draft-2")
    expect(useComposerStore.getState().agent_mode).toBe(mode)
  }
)

it("uses the application mode when starting a new draft from a locked draft", () => {
  useComposerStore.getState().setAgentMode("coding")
  useConversationModeStore
    .getState()
    .lockDraft(dataSourceKey(), "draft-0", "chat")

  startDraftChat()

  expect(useComposerStore.getState().agent_mode).toBe("coding")
  expect(useConversationModeStore.getState().drafts).not.toHaveProperty(
    `${dataSourceKey()}:draft-1`
  )
})

it.each([
  { open: true, panel: "chat", focused: "right" },
  { open: true, panel: "chat", focused: "left" },
  { open: false, panel: "chat", focused: "right" },
  { open: true, panel: "diff", focused: "right" },
] as const)(
  "new conversations keep the application mode with a $panel sidebar (open=$open, focus=$focused)",
  ({ open, panel, focused }) => {
    useComposerStore.getState().setAgentMode("work")
    const modes = useConversationModeStore.getState()
    modes.remember(dataSourceKey(), "main-chat", "chat")
    modes.remember(dataSourceKey(), "side-chat", "coding")
    openConversation("main-chat")
    const selection = useSelectionStore.getState()
    selection.setSidebarConversationId("side-chat")
    selection.setFocusedChatPane(focused)
    const sidebar = useRightSidebarStore.getState()
    sidebar.addPanel(selection.chatPaneKey, "chat")
    if (panel === "diff") sidebar.addPanel(selection.chatPaneKey, "diff")
    sidebar.setOpen(selection.chatPaneKey, open)

    startDraftChat()

    expect(useComposerStore.getState().agent_mode).toBe("work")
    expect(useSelectionStore.getState()).toMatchObject({
      selectedConversationId: null,
      sidebarConversationId: "side-chat",
      focusedChatPane: "left",
    })
  }
)
