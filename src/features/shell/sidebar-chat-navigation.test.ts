import { afterAll, beforeEach, expect, it, vi } from "vitest"

const saved = vi.hoisted(() => {
  const values = new Map<string, string>()
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  })
  return values
})

vi.mock("@/app/navigation", () => ({
  openConversation: vi.fn(),
  startDraftChat: vi.fn(),
}))

import { openConversation } from "@/app/navigation"
import { sourceStorageKey } from "@/lib/account-source"
import { useRightSidebarStore } from "./right-sidebar-store"
import { useSelectionStore } from "./selection-store"
import { useComposerStore } from "@/features/chat/composer-store"
import {
  openConversationInChatTarget,
  selectChatPane,
} from "./sidebar-chat-navigation"

function openSidebarChat() {
  useRightSidebarStore
    .getState()
    .addPanel(useSelectionStore.getState().chatPaneKey, "chat")
}

const target = {
  messageId: 12,
  snapshotId: "answer",
  query: "needle",
  occurrence: 1,
}

beforeEach(() => {
  saved.clear()
  vi.clearAllMocks()
  useComposerStore.setState(useComposerStore.getInitialState(), true)
  useRightSidebarStore.setState(useRightSidebarStore.getInitialState(), true)
  useSelectionStore.setState(useSelectionStore.getInitialState(), true)
  useSelectionStore.getState().setSelectedConversationId("left-chat")
})

afterAll(() => vi.unstubAllGlobals())

it("opens a message result in the selected right pane without changing the main conversation", () => {
  openSidebarChat()
  selectChatPane("right")
  useSelectionStore.getState().markConversationUnread("right-chat")
  openConversationInChatTarget("right-chat", target)
  const state = useSelectionStore.getState()
  expect(state.selectedConversationId).toBe("left-chat")
  expect(state.sidebarConversationId).toBe("right-chat")
  expect(state.sidebarSearchTarget).toMatchObject({
    conversationId: "right-chat",
    target,
  })
  expect(state.unreadConversationIds).not.toContain("right-chat")
  expect(openConversation).not.toHaveBeenCalled()
  const persisted = JSON.parse(
    saved.get(sourceStorageKey("fba-buddy.selection"))!
  )
  expect(persisted.state).toEqual({ unreadConversationIds: [] })
})

it("reissues a new navigation token for repeated selections of the same right-pane result", () => {
  openSidebarChat()
  selectChatPane("right")
  openConversationInChatTarget("right-chat", target)
  const first = useSelectionStore.getState().sidebarSearchTarget!
  openConversationInChatTarget("right-chat", target)
  const second = useSelectionStore.getState().sidebarSearchTarget!
  expect(second.target).toEqual(first.target)
  expect(second.token).toBeGreaterThan(first.token)
})

it("clears a search target on ordinary navigation and sidebar reset", () => {
  openSidebarChat()
  selectChatPane("right")
  openConversationInChatTarget("right-chat", target)
  openConversationInChatTarget("right-chat")
  expect(useSelectionStore.getState().sidebarSearchTarget).toBeNull()
  openConversationInChatTarget("right-chat", target)
  useSelectionStore.getState().setSidebarConversationId(null)
  expect(useSelectionStore.getState().sidebarSearchTarget).toBeNull()
  openConversationInChatTarget("right-chat", target)
  useSelectionStore.getState().resetSidebarChat()
  expect(useSelectionStore.getState().sidebarSearchTarget).toBeNull()
  expect(useSelectionStore.getState().sidebarConversationId).toBeNull()
})

it.each([false, true])(
  "passes result coordinates to main navigation when right sidebar is %s and the left pane is selected",
  (split) => {
    if (split) openSidebarChat()
    selectChatPane("left")
    openConversationInChatTarget("main-result", target)
    expect(openConversation).toHaveBeenCalledWith("main-result", target)
    expect(useSelectionStore.getState().sidebarSearchTarget).toBeNull()
  }
)

it("ignores a stale right selection while right sidebar is disabled", () => {
  selectChatPane("right")
  openConversationInChatTarget("main-result", target)
  expect(openConversation).toHaveBeenCalledWith("main-result", target)
  expect(useSelectionStore.getState().sidebarConversationId).toBeNull()
})

it("collapsing the sidebar keeps the main conversation and the side chat available for reopening", () => {
  openSidebarChat()
  selectChatPane("right")
  openConversationInChatTarget("right-chat", target)
  useRightSidebarStore
    .getState()
    .setOpen(useSelectionStore.getState().chatPaneKey, false)
  openConversationInChatTarget("main-result", target)
  expect(openConversation).toHaveBeenCalledWith("main-result", target)
  expect(useSelectionStore.getState().sidebarConversationId).toBe("right-chat")
})

it("a Diff tab never receives conversation search navigation intended for a hidden side chat", () => {
  useComposerStore.getState().setAgentMode("coding")
  openSidebarChat()
  selectChatPane("right")
  useRightSidebarStore
    .getState()
    .addPanel(useSelectionStore.getState().chatPaneKey, "diff")
  openConversationInChatTarget("main-result", target)
  expect(openConversation).toHaveBeenCalledWith("main-result", target)
})

it("does not retain a right-pane query when transient selection is reset for another data source", () => {
  openSidebarChat()
  selectChatPane("right")
  openConversationInChatTarget("right-chat", target)
  useSelectionStore.setState(useSelectionStore.getInitialState(), true)
  expect(useSelectionStore.getState().sidebarSearchTarget).toBeNull()
  expect(useSelectionStore.getState().sidebarConversationId).toBeNull()
})
