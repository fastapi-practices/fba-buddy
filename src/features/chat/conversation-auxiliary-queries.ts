import { queryOptions } from "@tanstack/react-query"

import {
  getConversationPlan,
  pendingInputRequests,
} from "@/api/chat-interactions"
import { listConversationFollowUps } from "@/api/follow-ups"
import { queryKeys } from "@/api/query-keys"

export function conversationFollowUpsQueryOptions(
  conversationId: string | null,
  running: boolean,
  ready = true
) {
  return queryOptions({
    queryKey: queryKeys.conversationFollowUps(conversationId),
    queryFn: ({ signal }) => {
      if (!conversationId)
        throw new Error("Conversation id is required for follow-ups")
      return listConversationFollowUps(conversationId, signal)
    },
    enabled: Boolean(conversationId) && ready,
    retry: false,
    refetchInterval: (query) =>
      running ||
      query.state.data?.items.some((item) => item.status === "queued")
        ? 2000
        : false,
  })
}

export function conversationPlanQueryOptions(
  conversationId: string | null,
  enabled: boolean
) {
  return queryOptions({
    queryKey: queryKeys.conversationPlan(conversationId ?? ""),
    queryFn: ({ signal }) => {
      if (!conversationId)
        throw new Error("Conversation id is required for plan")
      return getConversationPlan(conversationId, { signal })
    },
    enabled: Boolean(conversationId) && enabled,
    retry: false,
  })
}

export function conversationInputRequestsQueryOptions(
  conversationId: string | null,
  ready: boolean
) {
  return queryOptions({
    queryKey: queryKeys.conversationInputRequests(conversationId ?? ""),
    queryFn: async ({ signal }) => {
      if (!conversationId)
        throw new Error("Conversation id is required for input requests")
      const result = await pendingInputRequests(conversationId, { signal })
      return { items: Array.isArray(result?.items) ? result.items : [] }
    },
    enabled: Boolean(conversationId) && ready,
    retry: false,
  })
}
