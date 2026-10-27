import { apiRequest } from "@/api/http"
import type { ConversationTransferDocument } from "@/lib/types"

export function exportConversation(
  conversationId: string,
  options: { encrypt?: boolean } = {}
) {
  const query = new URLSearchParams({
    encrypt: String(options.encrypt ?? false),
  })
  return apiRequest<ConversationTransferDocument>(
    `/conversations/${encodeURIComponent(conversationId)}/export?${query}`
  )
}
