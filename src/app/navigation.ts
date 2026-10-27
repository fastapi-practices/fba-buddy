import { appPaths } from "@/app/location"
import type { SettingsSectionId } from "@/features/settings/settings-nav"
import { useSelectionStore } from "@/features/shell/selection-store"
import type { WorkspaceKind } from "@/lib/types"
import {
  conversationMessageSearch,
  type ConversationMessageTarget,
} from "@/app/conversation-message-location"

type NavigationOptions = { replace?: boolean }
type AppNavigate = (path: string, options?: NavigationOptions) => void

let navigateFn: AppNavigate | null = null

export function bindAppNavigate(navigate: AppNavigate | null) {
  navigateFn = navigate
}

export function appNavigate(path: string, options?: NavigationOptions) {
  if (navigateFn) {
    navigateFn(path, options)
    return
  }
  if (typeof window !== "undefined") {
    window.location.hash = `#${path}`
  }
}

export function startDraftChat() {
  const selection = useSelectionStore.getState()
  selection.setFocusedChatPane("left")
  selection.openDraftChat()
  appNavigate(appPaths().chat())
}

export function adoptCreatedConversation(id: string) {
  const selection = useSelectionStore.getState()
  selection.setSelectedConversationId(id)
  selection.markConversationRead(id)
  appNavigate(appPaths().chat(id))
}

export function openConversation(
  id: string,
  target?: ConversationMessageTarget
) {
  if (typeof id !== "string" || !id.trim()) return
  const selection = useSelectionStore.getState()
  const alreadySelected = selection.selectedConversationId === id
  selection.setSelectedConversationId(id)
  if (!alreadySelected) selection.setChatPaneKey(id)
  selection.markConversationRead(id)
  appNavigate(`${appPaths().chat(id)}${conversationMessageSearch(target)}`)
}

export function openSettings(section: SettingsSectionId = "general") {
  appNavigate(appPaths().settings(section))
}

export function openWorkspace(kind: WorkspaceKind) {
  appNavigate(appPaths().workspace(kind))
}
