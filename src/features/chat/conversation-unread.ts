import { currentAppLocation } from "@/app/location"
import { useSelectionStore } from "@/features/shell/selection-store"

export function shouldMarkConversationUnread(input: {
  conversationId: string
  viewedConversationId: string | null
}): boolean {
  return input.viewedConversationId !== input.conversationId
}

export function markUnreadAfterAssistantReply(conversationId: string) {
  const location = currentAppLocation()
  if (
    shouldMarkConversationUnread({
      conversationId,
      viewedConversationId:
        location.route === "chat" ? location.conversationId : null,
    })
  ) {
    useSelectionStore.getState().markConversationUnread(conversationId)
  }
}
