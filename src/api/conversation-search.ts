import {
  getConversation,
  listConversations,
  searchConversationMessages,
} from "./conversations"
import { dataSourceKey, dataSourceSignal } from "@/lib/account-source"
import {
  normalizeSearchText,
  searchExcerpt,
} from "@/shared/conversation-search"
import type { ConversationListItem } from "@/lib/types"
import type {
  ConversationSearchPage,
  SearchResult,
} from "@/shared/conversation-search"

export type {
  ConversationSearchPage,
  SearchResult,
} from "@/shared/conversation-search"
export type ConversationSearchOptions = {
  query: string
  conversationId?: string
  cursor?: string | null
  limit?: number
  signal?: AbortSignal
}

type SearchJob = Pick<
  ConversationListItem,
  "conversation_id" | "title" | "is_archived"
> & {
  cursor: string | null
  visited: string[]
  titleEmitted: boolean
  found?: string[]
}
type SearchCursor = {
  version: 1
  source: string
  query: string
  conversationId?: string
  phase: number
  listCursor: string | null
  visited: string[]
  seen: string[]
  jobs: SearchJob[]
  pending: SearchResult[]
  scanned: number
}

function nextCursor(
  page: { has_more?: boolean; next_cursor?: string | null },
  visited: string[]
) {
  if (page.has_more === undefined && page.next_cursor === undefined)
    throw new Error("服务未提供分页完成状态，搜索尚未完成")
  if (!(page.has_more ?? Boolean(page.next_cursor))) return null
  if (!page.next_cursor || visited.includes(page.next_cursor))
    throw new Error("搜索分页未能继续，搜索尚未完成")
  visited.push(page.next_cursor)
  return page.next_cursor
}

function initialCursor(
  options: ConversationSearchOptions,
  query: string
): SearchCursor {
  if (options.cursor) {
    const parsed = JSON.parse(options.cursor) as SearchCursor
    if (
      parsed.version !== 1 ||
      parsed.source !== dataSourceKey() ||
      parsed.query !== query ||
      parsed.conversationId !== options.conversationId ||
      !Array.isArray(parsed.jobs) ||
      !Array.isArray(parsed.pending) ||
      !Array.isArray(parsed.visited) ||
      !Array.isArray(parsed.seen) ||
      !Number.isInteger(parsed.phase) ||
      parsed.phase < 0 ||
      parsed.phase > 2
    )
      throw new Error("搜索游标已失效，请重新搜索")
    return parsed
  }
  return {
    version: 1,
    source: dataSourceKey(),
    query,
    conversationId: options.conversationId,
    phase: 0,
    listCursor: null,
    visited: [],
    seen: [],
    jobs: [],
    pending: [],
    scanned: 0,
  }
}

function searchJob(
  conversation: Pick<
    ConversationListItem,
    "conversation_id" | "title" | "is_archived"
  >
): SearchJob {
  return {
    conversation_id: conversation.conversation_id,
    title: conversation.title,
    is_archived: conversation.is_archived,
    cursor: null,
    visited: [],
    titleEmitted: false,
  }
}

function searchJobPage(job: SearchJob, query: string, signal: AbortSignal) {
  return searchConversationMessages(job.conversation_id, query, job.cursor, {
    signal,
    silent: true,
  })
}

// 每页限制网络工作量，未扫描完时允许空页，由 has_more 明确表示仍需继续
export async function searchConversations(
  options: ConversationSearchOptions
): Promise<ConversationSearchPage> {
  const query = normalizeSearchText(options.query)
  const signal = dataSourceSignal(options.signal)
  signal.throwIfAborted()
  if (!query)
    return { items: [], has_more: false, next_cursor: null, complete: true }
  if (query.length > 2000) throw new Error("搜索内容过长")
  const requestedLimit = options.limit ?? 50
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(100, Math.max(1, Math.floor(requestedLimit)))
    : 50
  const state = initialCursor(options, query)
  if (options.conversationId && !options.cursor) {
    const conversation = await getConversation(options.conversationId, {
      signal,
      silent: true,
    })
    state.jobs.push(searchJob(conversation))
    state.seen.push(options.conversationId)
    state.phase = 2
  }
  const items: SearchResult[] = []
  let work = 0
  while (items.length < limit && work < 12) {
    signal.throwIfAborted()
    items.push(...state.pending.splice(0, limit - items.length))
    if (items.length >= limit) break
    if (!state.jobs.length) {
      if (state.phase === 2) break
      const page = await listConversations(
        { archived: state.phase === 1, cursor: state.listCursor, size: 100 },
        { signal, silent: true }
      )
      signal.throwIfAborted()
      for (const conversation of page.items) {
        if (state.seen.includes(conversation.conversation_id)) continue
        state.seen.push(conversation.conversation_id)
        state.jobs.push(searchJob(conversation))
      }
      state.listCursor = nextCursor(page, state.visited)
      if (!state.listCursor) {
        state.phase++
        state.listCursor = null
        state.visited = []
      }
      work++
      continue
    }
    const jobs = state.jobs.splice(0, Math.min(4, 12 - work))
    const pages = await Promise.all(
      jobs.map((job) => searchJobPage(job, query, signal))
    )
    signal.throwIfAborted()
    for (const [index, page] of pages.entries()) {
      const job = jobs[index]!
      const common = {
        conversation_id: job.conversation_id,
        title: job.title,
        is_archived: job.is_archived,
      }
      if (!job.titleEmitted && normalizeSearchText(job.title).includes(query))
        state.pending.push({ kind: "conversation", ...common })
      job.titleEmitted = true
      for (const hit of page.items) {
        if (
          (hit.message_id != null &&
            (!Number.isSafeInteger(hit.message_id) || hit.message_id <= 0)) ||
          typeof hit.snapshot_id !== "string" ||
          !hit.snapshot_id
        )
          throw new Error("搜索返回了无效的消息位置")
        job.found ??= []
        if (job.found.includes(hit.snapshot_id)) continue
        job.found.push(hit.snapshot_id)
        state.pending.push({
          kind: "message",
          ...common,
          message_id: hit.message_id,
          snapshot_id: hit.snapshot_id,
          role: hit.role,
          excerpt: searchExcerpt(hit.text || hit.excerpt || "", query),
        })
      }
      job.cursor = nextCursor(page, job.visited)
      if (page.has_more) state.jobs.push(job)
      else state.scanned++
    }
    work += jobs.length
  }
  items.push(...state.pending.splice(0, limit - items.length))
  const hasMore =
    state.phase !== 2 || state.jobs.length > 0 || state.pending.length > 0
  return {
    items,
    has_more: hasMore,
    next_cursor: hasMore ? JSON.stringify(state) : null,
    complete: !hasMore,
    scanned_conversations: state.scanned,
  }
}
