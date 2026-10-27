import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import {
  getConversation,
  getConversationMessages,
  listConversations,
} from "@/api"
import { queryKeys } from "@/api/query-keys"
import { useImageStore } from "@/features/image/image-store"
import {
  imageConversationKey,
  mergeImageConversationMessages,
  mergeImageConversationRecords,
} from "@/features/image/image-conversations"
import { dataSourceKey, useAccountSourceStore } from "@/lib/account-source"
import { snapshotToChatMessages } from "@/features/chat/message-events"

export function useImageConversations() {
  useAccountSourceStore((state) => state.epoch)
  const local = useImageStore((state) => state.items)
  const query = useInfiniteQuery({
    queryKey: [...queryKeys.conversations(), "image", dataSourceKey()],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      listConversations(
        { surface: "image", cursor: pageParam, size: 30 },
        { signal }
      ),
    getNextPageParam: (page) =>
      page.has_more ? (page.next_cursor ?? undefined) : undefined,
  })
  return {
    ...query,
    items: mergeImageConversationRecords(
      query.data?.pages.flatMap((page) => page.items) ?? [],
      local
    ),
  }
}

export function useImageConversation(conversationId: string | null) {
  useAccountSourceStore((state) => state.epoch)
  const item = useImageStore((state) =>
    state.items.find((entry) => entry.conversationId === conversationId)
  )
  const streaming = item?.status === "streaming"
  const query = useQuery({
    queryKey: imageConversationKey(conversationId),
    queryFn: () => getConversation(conversationId!, { messageLimit: 50 }),
    enabled: Boolean(conversationId) && !streaming,
    refetchInterval: (state) =>
      state.state.data?.is_generating
        ? 1500
        : false,
  })
  const localMessages = item?.messages ?? []
  const useLocal =
    localMessages.length > 0 &&
    (streaming ||
      item?.status === "error" ||
      !query.data ||
      (item?.updatedAt ?? 0) > query.dataUpdatedAt)
  const currentMessages = useLocal
    ? localMessages
    : query.data
      ? mergeImageConversationMessages(query.data, localMessages)
      : localMessages
  const cursor = query.data?.history_cursor ?? null
  const older = useInfiniteQuery({
    queryKey: [
      "image-conversation-history",
      dataSourceKey(),
      conversationId,
      cursor,
    ],
    initialPageParam: cursor,
    queryFn: ({ pageParam }) =>
      getConversationMessages(conversationId!, pageParam),
    getNextPageParam: (page) =>
      page.has_more ? (page.next_cursor ?? undefined) : undefined,
    enabled: false,
  })
  const currentIds = new Set(currentMessages.map((message) => message.id))
  const earlierMessages = [...(older.data?.pages ?? [])]
    .reverse()
    .flatMap((page) =>
      snapshotToChatMessages(page.messages_snapshot.messages ?? [])
    )
  const messages = [
    ...earlierMessages.filter((message) => !currentIds.has(message.id)),
    ...currentMessages,
  ]
  return {
    ...query,
    item,
    messages,
    title: query.data?.title || item?.title || item?.prompt || "",
    isLoading: Boolean(conversationId) && !messages.length && query.isLoading,
    isGenerating:
      streaming ||
      Boolean(query.data?.is_generating),
    hasPreviousPage: older.data
      ? older.hasNextPage
      : Boolean(query.data?.history_has_more),
    isFetchingPreviousPage: older.isFetching,
    fetchPreviousPage: () => older.fetchNextPage({ cancelRefetch: false }),
    previousPageError: older.error,
  }
}
