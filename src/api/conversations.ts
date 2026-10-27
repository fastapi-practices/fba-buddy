import { translateCurrent } from "@/lib/i18n"
import { useConversationModeStore } from "@/features/chat/conversation-mode"
import {
  currentAccountSource,
  dataSourceKey,
  dataSourceSignal,
} from "@/lib/account-source"
import { invalidateHistoryCache } from "@/api/history-cache"
import { withExecutionStream } from "@/api/local-execution"
import { apiRequest, apiStream } from "@/api/http"
import { throwIfStreamFailed } from "@/api/stream"
import { toChatRegenerateBody } from "@/api/chat-body"
import {
  mergeConversationWorkspace,
  toConversationWorkspaceBody,
  workspaceFromConversation,
} from "@/lib/conversation-workspace"
import type {
  AgentMode,
  ChatSendPayload,
  ConversationDetail,
  ConversationDetailWire,
  ConversationListItem,
  ConversationListWireItem,
  ConversationSurface,
  ConversationWorkspace,
  CursorPage,
  MessagesSnapshot,
} from "@/lib/types"

function normalizeConversationListItem(
  item: ConversationListWireItem
): ConversationListItem {
  if (typeof item.conversationId !== "string" || !item.conversationId.trim()) {
    throw new Error(translateCurrent("common.couldNotLoadTheConversation"))
  }
  return {
    id: item.id,
    conversation_id: item.conversationId,
    title: item.title,
    agent_mode: item.agentMode,
    project_id: item.projectId,
    assistant_id: item.assistantId,
    origin: item.origin,
    surface: item.surface,
    is_pinned: item.isPinned,
    is_archived: item.isArchived,
    is_generating: item.isGenerating,
    source: item.source,
    last_message_preview: item.lastMessagePreview,
    last_message_time: item.lastMessageTime,
    revision: item.revision,
    created_time: item.createdTime,
    updated_time: item.updatedTime,
  }
}

function normalizeConversationDetail(
  item: ConversationDetailWire
): ConversationDetail {
  if (typeof item.conversationId !== "string" || !item.conversationId.trim()) {
    throw new Error(translateCurrent("common.couldNotLoadTheConversation"))
  }
  return {
    id: item.id,
    conversation_id: item.conversationId,
    title: item.title,
    agent_mode: item.agentMode,
    project_id: item.projectId,
    assistant_id: item.assistantId,
    goal: item.goal,
    origin: item.origin,
    surface: item.surface,
    is_pinned: item.isPinned,
    is_archived: item.isArchived,
    is_generating: item.isGenerating,
    source: item.source,
    provider_id: item.providerId,
    model_id: item.modelId,
    revision: item.revision,
    created_time: item.createdTime,
    updated_time: item.updatedTime,
    messages_snapshot: item.messagesSnapshot,
    history_has_more: item.historyHasMore,
    history_cursor: item.historyCursor,
  }
}

export function listConversations(
  params: {
    project_id?: number | null
    assistant_id?: number | null
    q?: string
    archived?: boolean
    surface?: ConversationSurface
    view?: AgentMode
    agent_mode?: AgentMode
    cursor?: string | null
    size?: number
  } = {},
  options: { signal?: AbortSignal; silent?: boolean } = {}
) {
  const sourceKey = dataSourceKey()
  const search = new URLSearchParams()
  if (params.project_id != null) {
    search.set("project_id", String(params.project_id))
  }
  if (params.assistant_id != null) {
    search.set("assistant_id", String(params.assistant_id))
  }
  if (params.q) {
    search.set("q", params.q)
  }
  if (params.archived) {
    search.set("archived", "true")
  }
  if (params.surface) {
    search.set("surface", params.surface)
  }
  if (params.view) {
    search.set("view", params.view)
  }
  if (params.agent_mode) {
    search.set("agent_mode", params.agent_mode)
  }
  if (params.cursor) {
    search.set("cursor", params.cursor)
  }
  if (params.size != null) {
    search.set("size", String(params.size))
  }
  const query = search.toString()
  return apiRequest<CursorPage<ConversationListWireItem>>(
    `/conversations${query ? `?${query}` : ""}`,
    options
  ).then((page): CursorPage<ConversationListItem> => {
    const items = page.items.map(normalizeConversationListItem)
    for (const item of items) {
      const mode = item.agent_mode
      if (mode)
        useConversationModeStore
          .getState()
          .remember(sourceKey, item.conversation_id, mode)
    }
    return { ...page, items }
  })
}

const conversationLoads = new Map<string, Promise<ConversationDetail>>()

export function clearConversationLoads() {
  conversationLoads.clear()
}

export function getConversation(
  conversationId: string,
  options?: {
    messageLimit?: number
    refresh?: boolean
    silent?: boolean
    signal?: AbortSignal
  }
) {
  const sourceKey = dataSourceKey()
  const key = `${sourceKey}:${conversationId}:${options?.messageLimit ?? "all"}`
  const existing = conversationLoads.get(key)
  if (existing && !options?.refresh) {
    return existing
  }
  const path = `/conversations/${conversationId}${options?.messageLimit ? `?message_limit=${options.messageLimit}` : ""}`
  const source = currentAccountSource()
  const signal = dataSourceSignal(options?.signal)
  const load = () => {
    signal.throwIfAborted()
    return apiRequest<ConversationDetailWire>(path, {
      signal,
      silent: options?.silent,
    }).then(normalizeConversationDetail)
  }
  const request = (
    options?.refresh && source
      ? invalidateHistoryCache(source, path).then(load)
      : load()
  )
    .then((detail) => {
      const mode = detail.agent_mode
      if (mode)
        useConversationModeStore
          .getState()
          .remember(sourceKey, conversationId, mode)
      return detail
    })
    .finally(() => {
      if (conversationLoads.get(key) === request) {
        conversationLoads.delete(key)
      }
    })
  conversationLoads.set(key, request)
  return request
}

export function renameConversation(
  conversationId: string,
  title: string,
  expectedRevision?: number
) {
  return apiRequest<null>(`/conversations/${conversationId}`, {
    method: "PUT",
    body: JSON.stringify({ title, expected_revision: expectedRevision }),
  })
}

export function pinConversation(
  conversationId: string,
  is_pinned: boolean,
  expectedRevision?: number
) {
  return apiRequest<null>(`/conversations/${conversationId}/pin`, {
    method: "PUT",
    body: JSON.stringify({
      is_pinned,
      expected_revision: expectedRevision,
    }),
  })
}

export function archiveConversation(
  conversationId: string,
  is_archived: boolean,
  expectedRevision?: number
) {
  return apiRequest<null>(`/conversations/${conversationId}/archive`, {
    method: "PUT",
    body: JSON.stringify({
      is_archived,
      expected_revision: expectedRevision,
    }),
  })
}

export function updateConversationWorkspace(
  conversationId: string,
  body: ConversationWorkspace,
  expectedRevision?: number
) {
  return apiRequest<null>(`/conversations/${conversationId}/workspace`, {
    method: "PUT",
    body: JSON.stringify({
      ...toConversationWorkspaceBody(body),
      expected_revision: expectedRevision,
    }),
  })
}

export async function patchConversationWorkspace(
  conversationId: string,
  patch: Partial<ConversationWorkspace>
) {
  const sourceSignal = dataSourceSignal()
  const detail = await getConversation(conversationId)
  sourceSignal.throwIfAborted()
  if (detail.is_generating) {
    throw new Error(translateCurrent("common.conversationGenerating"))
  }
  return updateConversationWorkspace(
    conversationId,
    mergeConversationWorkspace(workspaceFromConversation(detail), patch),
    detail.revision
  )
}

export function deleteConversation(conversationId: string) {
  return apiRequest<null>(`/conversations/${conversationId}`, {
    method: "DELETE",
  })
}

export function forkConversation(
  conversationId: string,
  messageId?: number,
  includeMessage = true
) {
  const sourceKey = dataSourceKey()
  const mode =
    useConversationModeStore.getState().modes[`${sourceKey}:${conversationId}`]
  return apiRequest<string>(`/conversations/${conversationId}/fork`, {
    method: "POST",
    ...(messageId != null
      ? {
          body: JSON.stringify({
            message_id: messageId,
            include_message: includeMessage,
          }),
        }
      : {}),
  }).then((id) => {
    if (mode) useConversationModeStore.getState().remember(sourceKey, id, mode)
    return id
  })
}

export type ConversationMessagePage = {
  messages_snapshot: MessagesSnapshot
  has_more: boolean
  next_cursor: string | null
}
export function getConversationMessages(
  conversationId: string,
  before?: string | null
) {
  const params = new URLSearchParams({ limit: "50" })
  if (before) params.set("before", before)
  return apiRequest<ConversationMessagePage>(
    `/conversations/${conversationId}/messages?${params}`
  )
}
export type ConversationSearchHit = {
  message_id: number
  snapshot_id: string
  message_index: number
  role: string
  text: string
  excerpt: string
}
export function searchConversationMessages(
  conversationId: string,
  q: string,
  cursor?: string | null,
  options: { signal?: AbortSignal; silent?: boolean } = {}
) {
  const params = new URLSearchParams({ q, limit: "50" })
  if (cursor) params.set("cursor", cursor)
  return apiRequest<{
    items: ConversationSearchHit[]
    has_more: boolean
    next_cursor: string | null
  }>(
    `/conversations/${encodeURIComponent(conversationId)}/messages/search?${params}`,
    options
  )
}

export function stopConversation(conversationId: string) {
  return apiRequest<null>(`/conversations/${conversationId}/stop`, {
    method: "POST",
    silent: true,
  })
}

export async function subscribeConversationEvents(
  conversationId: string,
  signal?: AbortSignal,
  lastEventId?: string | null
) {
  const response = await apiStream(`/conversations/${conversationId}/events`, {
    signal,
    headers: {
      Accept: "text/event-stream",
      ...(lastEventId ? { "Last-Event-ID": lastEventId } : {}),
    },
  })
  await throwIfStreamFailed(response, "订阅生成流失败")
  return response
}

export function clearConversationMessages(conversationId: string) {
  return apiRequest<null>(`/conversations/${conversationId}/messages`, {
    method: "DELETE",
  })
}

export function deleteConversationMessage(conversationId: string, pk: number) {
  return apiRequest<null>(`/conversations/${conversationId}/messages/${pk}`, {
    method: "DELETE",
  })
}

export async function regenerateMessage(
  conversationId: string,
  pk: number,
  body: {
    forwarded_props: ChatSendPayload["forwarded_props"]
    content?: string | null
    state?: import("@ag-ui/core").RunAgentInput["state"]
  },
  signal?: AbortSignal
) {
  return withExecutionStream(
    conversationId,
    body.forwarded_props,
    async (props) => {
      const response = await apiStream(
        `/conversations/${conversationId}/messages/${pk}/regenerate`,
        {
          method: "POST",
          body: JSON.stringify(
            toChatRegenerateBody({
              ...body,
              threadId: conversationId,
              forwarded_props: props,
            })
          ),
          signal,
          headers: {
            Accept: "text/event-stream",
          },
        }
      )
      await throwIfStreamFailed(
        response,
        translateCurrent("common.regenerateFailed")
      )
      return response
    },
    signal
  )
}

export function resolveCodingApproval(
  conversationId: string,
  requestId: string,
  approved: boolean
) {
  return apiRequest<null>(
    `/conversations/${conversationId}/approvals/${requestId}`,
    {
      method: "POST",
      body: JSON.stringify({ approved }),
    }
  )
}
