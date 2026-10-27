import { conversationProjectId } from "@/lib/conversation-workspace"
import type { ConversationListItem } from "@/lib/types"

export function partitionSidebarConversations(
  items: readonly ConversationListItem[]
) {
  const pinned: ConversationListItem[] = []
  const byProject = new Map<number | null, ConversationListItem[]>()
  for (const item of items) {
    if (item.is_archived) {
      continue
    }
    if (item.is_pinned) {
      pinned.push(item)
      continue
    }
    const key = conversationProjectId(item)
    const list = byProject.get(key) ?? []
    list.push(item)
    byProject.set(key, list)
  }
  return { pinned, byProject }
}
