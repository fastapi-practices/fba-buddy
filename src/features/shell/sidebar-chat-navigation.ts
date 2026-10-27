import { openConversation } from "@/app/navigation"
import type { ConversationMessageTarget } from "@/app/conversation-message-location"
import { useSelectionStore } from "./selection-store"
import { useComposerStore } from "@/features/chat/composer-store"
import { conversationAgentMode } from "@/features/chat/conversation-mode"
import {
  EMPTY_RIGHT_SIDEBAR,
  rightSidebarForMode,
  useRightSidebarStore,
  type ChatPaneSide,
} from "./right-sidebar-store"

export function selectChatPane(pane: ChatPaneSide) {
  useSelectionStore.getState().setFocusedChatPane(pane)
}

/** 只有正在显示的侧栏对话接收右栏导航 */
export function openConversationInChatTarget(
  id: string,
  target?: ConversationMessageTarget
) {
  const selection = useSelectionStore.getState()
  const layout =
    useRightSidebarStore.getState().layouts[selection.chatPaneKey] ??
    EMPTY_RIGHT_SIDEBAR
  const draftMode = useComposerStore.getState().agent_mode ?? "work"
  const mainMode =
    conversationAgentMode(selection.selectedConversationId) ?? draftMode
  const sideMode =
    conversationAgentMode(selection.sidebarConversationId) ?? draftMode
  const sidebar = rightSidebarForMode(
    layout,
    layout.panels.includes("chat") && sideMode === "coding"
      ? "coding"
      : mainMode
  )
  if (
    sidebar.open &&
    sidebar.activePanel === "chat" &&
    selection.focusedChatPane === "right"
  ) {
    selection.setSidebarConversationId(id, target)
    selection.markConversationRead(id)
    return
  }
  openConversation(id, target)
}
