import {
  conversationAssistantId,
  conversationProjectId,
} from "@/lib/conversation-workspace"
import type { ConversationListItem } from "@/lib/types"

export function conversationPreviewTime(
  item: ConversationListItem
): string | null {
  return firstNonEmpty(
    item.last_message_time,
    item.updated_time,
    item.created_time
  )
}

export function conversationPreviewText(
  item: ConversationListItem
): string | null {
  return firstNonEmpty(item.last_message_preview)
}

export function conversationPreviewProjectName(
  item: ConversationListItem,
  projects: readonly { id: number; name: string }[]
): string | null {
  const id = conversationProjectId(item)
  if (id == null) {
    return null
  }
  return projects.find((project) => project.id === id)?.name ?? null
}

export function conversationPreviewAssistantName(
  item: ConversationListItem,
  assistants: readonly { id: number; name: string }[]
): string | null {
  const id = conversationAssistantId(item)
  if (id == null) {
    return null
  }
  return assistants.find((assistant) => assistant.id === id)?.name ?? null
}

function firstNonEmpty(
  ...values: Array<string | null | undefined>
): string | null {
  for (const value of values) {
    const trimmed = value?.trim()
    if (trimmed) {
      return trimmed
    }
  }
  return null
}
