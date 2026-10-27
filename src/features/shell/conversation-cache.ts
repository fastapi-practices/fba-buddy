import type { QueryClient } from "@tanstack/react-query"

import { queryKeys } from "@/api/query-keys"

export function removeConversationFromCaches(
  queryClient: QueryClient,
  conversationId: string
) {
  queryClient.setQueriesData<unknown>(
    { queryKey: queryKeys.conversations() },
    (current: unknown) => removeFromSnapshot(current, conversationId)
  )
}

function removeFromSnapshot(
  current: unknown,
  conversationId: string
): unknown {
  if (Array.isArray(current)) {
    return current.filter((item) => idOf(item) !== conversationId)
  }
  if (!isRecord(current)) {
    return current
  }
  if (Array.isArray(current.pages)) {
    return {
      ...current,
      pages: current.pages.map((page) =>
        removeFromSnapshot(page, conversationId)
      ),
    }
  }
  if (!Array.isArray(current.items)) return current
  return {
    ...current,
    items: current.items.filter((item) => idOf(item) !== conversationId),
  }
}

function idOf(value: unknown) {
  if (!isRecord(value) || typeof value.conversation_id !== "string") {
    return null
  }
  return value.conversation_id
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
