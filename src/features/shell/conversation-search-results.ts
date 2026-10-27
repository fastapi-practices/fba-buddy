import type {
  ConversationSearchPage,
  SearchResult,
  searchConversations,
} from "@/api/conversation-search"
import { translateCurrent } from "@/lib/i18n"
import type { LiveConversationSearchEntry } from "@/features/chat/live-conversation-search"
import {
  conversationSearchText,
  normalizeSearchText,
  searchExcerpt,
} from "@/shared/conversation-search"

export type ConversationSearchLoader = typeof searchConversations

export function conversationSearchResultKey(item: SearchResult) {
  return item.kind === "conversation"
    ? `conversation:${item.conversation_id}`
    : `message:${item.conversation_id}:${item.snapshot_id ?? item.message_id}:${item.occurrence ?? 0}`
}

function searchAliases(item: SearchResult, occurrence = true) {
  if (item.kind === "conversation") return [conversationSearchResultKey(item)]
  const prefix = `message:${item.conversation_id}:`
  const suffix = occurrence ? `:${item.occurrence ?? 0}` : ""
  return [
    ...(item.snapshot_id
      ? [`${prefix}snapshot:${item.snapshot_id}${suffix}`]
      : []),
    ...(item.message_id != null
      ? [`${prefix}pk:${item.message_id}${suffix}`]
      : []),
  ]
}

export function mergeConversationSearchResults(
  previous: readonly SearchResult[],
  incoming: readonly SearchResult[]
) {
  const items = new Map<string, SearchResult>()
  const aliases = new Map<string, string>()
  for (const item of [...previous, ...incoming]) {
    const existingKeys = searchAliases(item).flatMap((alias) => {
      const key = aliases.get(alias)
      return key ? [key] : []
    })
    const existing = items.get(existingKeys[0])
    const merged = existing
      ? {
          ...existing,
          ...item,
          ...((item.message_id ?? existing.message_id) != null
            ? { message_id: item.message_id ?? existing.message_id }
            : {}),
          ...(item.snapshot_id || existing.snapshot_id
            ? { snapshot_id: item.snapshot_id || existing.snapshot_id }
            : {}),
        }
      : item
    for (const key of existingKeys) items.delete(key)
    const key = conversationSearchResultKey(merged)
    items.set(key, merged)
    for (const alias of searchAliases(merged)) aliases.set(alias, key)
  }
  return [...items.values()]
}

export function mergeLiveConversationSearchResults(
  stored: readonly SearchResult[],
  entries: Iterable<LiveConversationSearchEntry>,
  options: {
    source: string
    query: string
    conversationId?: string | null
    titles?: Readonly<Record<string, string>>
    fallbackTitle: string
  }
) {
  const titles = new Map(
    stored.map((item) => [item.conversation_id, item.title])
  )
  const savedByAlias = new Map(
    stored.flatMap((item) =>
      searchAliases(item, false).map((alias) => [alias, item] as const)
    )
  )
  const latest = new Map<string, SearchResult>()
  for (const entry of entries) {
    if (
      entry.source !== options.source ||
      (options.conversationId &&
        entry.conversationId !== options.conversationId)
    )
      continue
    for (const message of entry.messages) {
      const text = conversationSearchText(message)
      const row: SearchResult = {
        kind: "message",
        conversation_id: entry.conversationId,
        title:
          options.titles?.[entry.conversationId] ||
          titles.get(entry.conversationId) ||
          options.fallbackTitle,
        snapshot_id: message.id,
        message_id: message.pk,
        role: message.role,
        text,
        excerpt: searchExcerpt(text, options.query),
      }
      const saved = searchAliases(row, false)
        .map((alias) => savedByAlias.get(alias))
        .find((item) => item !== undefined)
      if (saved) {
        row.message_id ??= saved.message_id
        row.is_archived = saved.is_archived
      }
      latest.set(conversationSearchResultKey(row), row)
    }
  }
  const live = [...latest.values()]
  const loadedAliases = new Set(
    live.flatMap((item) => searchAliases(item, false))
  )
  const remaining = stored.filter(
    (item) =>
      !searchAliases(item, false).some((alias) => loadedAliases.has(alias))
  )
  const needle = normalizeSearchText(options.query)
  return mergeConversationSearchResults(
    live.filter(
      (item) => needle && normalizeSearchText(item.text ?? "").includes(needle)
    ),
    remaining
  )
}

// 云端扫描可能返回尚无命中的中间页，持续扫描到有结果或确实完成
export async function loadConversationSearchPage(
  load: ConversationSearchLoader,
  request: Parameters<ConversationSearchLoader>[0],
  onProgress?: (page: ConversationSearchPage) => void
): Promise<ConversationSearchPage> {
  const visited = new Set<string | null>([request.cursor ?? null])
  let cursor = request.cursor
  for (;;) {
    request.signal?.throwIfAborted()
    const page = await load({ ...request, cursor })
    request.signal?.throwIfAborted()
    onProgress?.(page)
    if (!page.has_more && !page.complete) {
      throw new Error(translateCurrent("common.conversationSearchIncomplete"))
    }
    if (page.items.length || page.complete || !page.has_more) return page
    if (!page.next_cursor || visited.has(page.next_cursor)) {
      throw new Error(translateCurrent("common.conversationSearchIncomplete"))
    }
    visited.add(page.next_cursor)
    cursor = page.next_cursor
  }
}

export function conversationSearchHighlight(text: string, query: string) {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return [{ text, match: false }]
  const lower = text.toLocaleLowerCase()
  const parts: { text: string; match: boolean }[] = []
  let offset = 0
  for (;;) {
    const start = lower.indexOf(needle, offset)
    if (start < 0) break
    if (start > offset)
      parts.push({ text: text.slice(offset, start), match: false })
    const end = start + needle.length
    parts.push({ text: text.slice(start, end), match: true })
    offset = end
  }
  if (offset < text.length)
    parts.push({ text: text.slice(offset), match: false })
  return parts
}
