import { dataSourceKey } from "@/lib/account-source"
import { snapshotToChatMessages } from "@/features/chat/message-events"
import type { ImageGenItem } from "@/features/image/image-store"
import type {
  ChatMessage,
  ConversationDetail,
  ConversationListItem,
} from "@/lib/types"

export type ImageConversationRecord = {
  conversationId: string
  title: string
  preview: string
  updatedAt: number
  isGenerating: boolean
}

export const imageConversationKey = (conversationId: string | null) =>
  ["image-conversation", dataSourceKey(), conversationId] as const

export function imageConversationMessages(
  detail: ConversationDetail
): ChatMessage[] {
  return snapshotToChatMessages(
    detail.messages_snapshot?.messages ?? []
  )
}

export function mergeImageConversationMessages(
  detail: ConversationDetail,
  current: ChatMessage[]
) {
  const snapshot = imageConversationMessages(detail)
  if (!snapshot.length) return current
  if (!detail.history_has_more) return snapshot
  const first = snapshot[0]!
  const boundary = current.findIndex(
    (message) =>
      message.id === first.id || (first.pk != null && message.pk === first.pk)
  )
  return [...current.slice(0, Math.max(0, boundary)), ...snapshot]
}

export function mergeImageConversationRecords(
  remote: ConversationListItem[],
  local: ImageGenItem[]
): ImageConversationRecord[] {
  const records = new Map<string, ImageConversationRecord>()
  for (const item of local) {
    if (records.has(item.conversationId)) continue
    records.set(item.conversationId, {
      conversationId: item.conversationId,
      title: item.title || item.prompt,
      preview: item.content,
      updatedAt: item.updatedAt ?? item.createdAt,
      isGenerating: item.status === "streaming",
    })
  }
  for (const item of remote) {
    const cached = records.get(item.conversation_id)
    const remoteTime = Date.parse(
      item.last_message_time || item.updated_time || item.created_time
    )
    records.set(item.conversation_id, {
      conversationId: item.conversation_id,
      title: item.title || cached?.title || "",
      preview: item.last_message_preview || cached?.preview || "",
      updatedAt: Math.max(
        Number.isFinite(remoteTime) ? remoteTime : 0,
        cached?.updatedAt ?? 0
      ),
      isGenerating: cached?.isGenerating || item.is_generating,
    })
  }
  return [...records.values()].sort((a, b) => b.updatedAt - a.updatedAt)
}
