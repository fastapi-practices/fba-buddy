export type ConversationMessageTarget = {
  messageId?: number
  snapshotId?: string
  query?: string
  occurrence?: number
}

export type ConversationSearchNavigation = {
  conversationId: string
  token: number
  target: ConversationMessageTarget
}

export function conversationMessageSearch(target?: ConversationMessageTarget) {
  const search = new URLSearchParams()
  if (target?.messageId != null)
    search.set("searchMessage", String(target.messageId))
  if (target?.snapshotId) search.set("searchSnapshot", target.snapshotId)
  if (target?.query) search.set("searchQuery", target.query)
  if (target?.occurrence != null)
    search.set("searchOccurrence", String(target.occurrence))
  return search.toString() ? `?${search}` : ""
}

export function parseConversationMessageTarget(
  search: string
): ConversationMessageTarget | null {
  const params = new URLSearchParams(search)
  const pk = Number(params.get("searchMessage"))
  const messageId = Number.isSafeInteger(pk) && pk > 0 ? pk : undefined
  const snapshotId = params.get("searchSnapshot")?.slice(0, 512) || undefined
  if (!messageId && !snapshotId) return null
  const occurrence = Number(params.get("searchOccurrence"))
  return {
    messageId,
    snapshotId,
    query: params.get("searchQuery")?.slice(0, 10000) || undefined,
    occurrence:
      Number.isSafeInteger(occurrence) && occurrence >= 0 ? occurrence : 0,
  }
}
