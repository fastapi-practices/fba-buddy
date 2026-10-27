import { useEffect, useMemo, useRef } from "react"
import { Loader2Icon } from "lucide-react"

import { Thread } from "@/components/ai-elements/thread"
import { ErrorState } from "@/components/ai-elements/error-state"
import { Button } from "@/components/ui/button"
import { MessageScrollerItem } from "@/components/ui/message-scroller"
import { ChatRuntimeProvider } from "@/features/chat/chat-runtime"
import { toThreadMessages } from "@/features/chat/thread-message"
import type { ImageGenItem } from "@/features/image/image-store"
import { useT } from "@/hooks/use-t"
import type { ChatMessage } from "@/lib/types"

type ImageConversationProps = {
  conversationId: string
  messages: ChatMessage[]
  item?: ImageGenItem
  isLoading: boolean
  isError: boolean
  error: Error | null
  refetch: () => unknown
  isGenerating: boolean
  hasPreviousPage: boolean
  isFetchingPreviousPage: boolean
  fetchPreviousPage: () => unknown
  previousPageError: Error | null
}

const noop = () => {}

export function ImageConversation({
  conversationId,
  messages,
  item,
  isLoading,
  isError,
  error,
  refetch,
  isGenerating,
  hasPreviousPage,
  isFetchingPreviousPage,
  fetchPreviousPage,
  previousPageError,
}: ImageConversationProps) {
  const t = useT()
  const threadMessages = useMemo(() => toThreadMessages(messages), [messages])
  const runError =
    item?.error && !messages.some((message) => message.error === item.error)
      ? item.error
      : undefined
  const components = useMemo(
    () => ({
      /* 绘画页有自己的输入框，消息区只读，也不提供聊天侧的操作栏 */
      showComposer: false,
      showActions: false,
      conversationId,
      TranscriptLeading: hasPreviousPage ? (
        <ImageHistoryControl
          isFetchingPreviousPage={isFetchingPreviousPage}
          previousPageError={previousPageError}
          fetchPreviousPage={fetchPreviousPage}
        />
      ) : null,
      TranscriptTrailing:
        isError || runError ? (
          <ImageConversationError
            message={runError || error?.message || t("common.generationFailed")}
            {...(isError ? { retry: () => void refetch() } : {})}
          />
        ) : null,
    }),
    [
      conversationId,
      error?.message,
      fetchPreviousPage,
      hasPreviousPage,
      isError,
      isFetchingPreviousPage,
      previousPageError,
      refetch,
      runError,
      t,
    ]
  )

  if (messages.length === 0) {
    if (!isLoading && !isError) return null
    return (
      <div className="flex h-full min-h-0 items-center justify-center px-4">
        {isLoading ? (
          <div
            role="status"
            className="flex items-center gap-2 text-sm text-muted-foreground"
          >
            <Loader2Icon className="size-4 animate-spin" />
            {t("common.loading")}
          </div>
        ) : (
          <ErrorState
            title={error?.message || t("common.generationFailed")}
            onRetry={() => void refetch()}
            className="max-w-(--thread-max-width)"
          />
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <ChatRuntimeProvider
        messages={threadMessages}
        rawMessages={messages}
        running={isGenerating}
        loading={isLoading}
        disabled
        onSend={noop}
        onStop={noop}
        onReload={noop}
      >
        <Thread components={components} autoFocus={false} />
      </ChatRuntimeProvider>
    </div>
  )
}

function ImageHistoryControl({
  isFetchingPreviousPage,
  previousPageError,
  fetchPreviousPage,
}: {
  isFetchingPreviousPage: boolean
  previousPageError: Error | null
  fetchPreviousPage: () => unknown
}) {
  const t = useT()
  const sentinel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const target = sentinel.current
    if (!target || isFetchingPreviousPage || previousPageError) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) void fetchPreviousPage()
      },
      {
        root: target.closest(
          '[data-slot="thread-viewport"], [data-slot="message-scroller-viewport"]'
        ),
      }
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [isFetchingPreviousPage, previousPageError, fetchPreviousPage])

  return (
    <MessageScrollerItem
      messageId="image-older-messages"
      className="mx-auto w-full max-w-(--thread-max-width) px-4 pt-4"
    >
      <div ref={sentinel} className="flex justify-center">
        <Button
          variant="ghost"
          size="sm"
          disabled={isFetchingPreviousPage}
          onClick={() => void fetchPreviousPage()}
        >
          {t(
            isFetchingPreviousPage
              ? "common.loading"
              : previousPageError
                ? "common.retry"
                : "common.loadMore"
          )}
        </Button>
      </div>
    </MessageScrollerItem>
  )
}

function ImageConversationError({
  message,
  retry,
}: {
  message: string
  retry?: () => void
}) {
  return (
    <MessageScrollerItem
      messageId="image-error"
      className="mx-auto w-full max-w-(--thread-max-width) px-4 pb-4"
    >
      <ErrorState title={message} onRetry={retry} />
    </MessageScrollerItem>
  )
}
