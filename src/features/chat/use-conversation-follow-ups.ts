import type { ChatMessage } from "@/lib/types"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import {
  removeConversationFollowUp,
  submitConversationFollowUp,
  updateConversationFollowUp,
  type ConversationFollowUp,
} from "@/api/follow-ups"
import { queryKeys } from "@/api/query-keys"
import { conversationFollowUpsQueryOptions } from "@/features/chat/conversation-auxiliary-queries"
import { useConversationActivityStore } from "@/features/chat/conversation-activity"
import { useComposerStore } from "@/features/chat/composer-store"
import { resolveChatForwardedProps } from "@/features/chat/forwarded-props"
import { queueItemFromSubmission } from "@/features/chat/thread-message"
import { mapAttachmentToContent } from "@/features/chat/attachments"
import type {
  ChatQueueAdapter,
  ChatSubmission,
  QueueItemState,
} from "@/features/chat/thread-types"
import { usePrefsStore } from "@/features/shell/prefs-store"
import { notifyError } from "@/lib/notify"
import { translateCurrent } from "@/lib/i18n"
import { workspaceRefForSend } from "@/features/chat/send-payload"

function promptOf(item: ConversationFollowUp) {
  return item.content
}

/** 把排队中的跟进消息还原成可再次发送的内容 */
function submissionFromFollowUp(item: ConversationFollowUp): ChatSubmission {
  return {
    text: item.content,
    attachments: item.attachments.flatMap((part, index) => {
      if (part.type === "text") return []
      return [
        {
          id: `follow-up-${item.id}-${index}`,
          name: part.metadata?.filename ?? "attachment",
          mime: part.source.mimeType,
          kind: part.type,
          size: part.metadata?.size ?? 0,
          data: part.source.type === "url" ? "" : part.source.value,
          ...(part.source.type === "url" ? { url: part.source.value } : {}),
        },
      ]
    }),
  }
}
type PendingFollowUp = {
  id: string
  conversationId: string
  message: ChatSubmission
  mode: "queue" | "steer"
  status: "saving" | "failed"
  reason?: string
}

export function useConversationFollowUps(input: {
  conversationId: string | null
  running: boolean
  ready: boolean
  messages: readonly ChatMessage[]
  onNew: (message: ChatSubmission) => Promise<void>
}) {
  const { conversationId, running, onNew } = input
  const [pending, setPending] = useState<PendingFollowUp[]>([])
  const pendingRef = useRef(pending)
  useLayoutEffect(() => {
    pendingRef.current = pending
  }, [pending])
  const client = useQueryClient()
  const queryKey = useMemo(
    () => queryKeys.conversationFollowUps(conversationId),
    [conversationId]
  )
  const query = useQuery(
    conversationFollowUpsQueryOptions(conversationId, running, input.ready)
  )
  const items = useMemo(() => query.data?.items ?? [], [query.data])
  const previous = useRef<{
    id: string | null
    statuses: Map<number, string>
    announced: Set<number>
  }>({ id: null, statuses: new Map(), announced: new Set() })
  useEffect(() => {
    if (!conversationId || !query.data || !input.ready) return
    const sameConversation = previous.current.id === conversationId
    const announced = sameConversation
      ? previous.current.announced
      : new Set<number>()
    const needsHistory = items.filter(
      (item) =>
        ["dispatched", "steered"].includes(item.status) &&
        !announced.has(item.id) &&
        ((sameConversation &&
          previous.current.statuses.get(item.id) === "queued") ||
          (item.messageId != null &&
            !input.messages.some((message) => message.pk === item.messageId)))
    )
    needsHistory.forEach((item) => announced.add(item.id))
    previous.current = {
      id: conversationId,
      statuses: new Map(items.map((item) => [item.id, item.status])),
      announced,
    }
    if (needsHistory.length > 0)
      useConversationActivityStore.getState().bumpMessages(conversationId)
  }, [conversationId, items, query.data, input.ready, input.messages])

  const refresh = useCallback(
    () => client.invalidateQueries({ queryKey }),
    [client, queryKey]
  )

  const submit = useCallback(
    async (
      message: ChatSubmission,
      mode: "queue" | "steer",
      requestId: string = crypto.randomUUID()
    ) => {
      if (!conversationId) return onNew(message)
      const optimistic: PendingFollowUp = {
        id: requestId,
        conversationId,
        message,
        mode,
        status: "saving",
      }
      setPending((current) => [
        ...current.filter((item) => item.id !== requestId),
        optimistic,
      ])
      const text = message.text
      const composer = useComposerStore.getState()
      try {
        const result = await submitConversationFollowUp(conversationId, {
          requestId,
          mode,
          text,
          attachments: message.attachments,
          forwardedProps: resolveChatForwardedProps(
            { ...composer, workspace_ref: workspaceRefForSend(composer, text) },
            { conversationId }
          ),
        })
        client.setQueryData<{ items: ConversationFollowUp[] }>(
          queryKey,
          (current) => ({
            items: [
              ...(current?.items ?? []).filter((item) => item.id !== result.id),
              result,
            ],
          })
        )
        setPending((current) => current.filter((item) => item.id !== requestId))
        if (mode === "steer" && result.disposition === "queued")
          notifyError(
            translateCurrent("common.steeringFailedTheMessageWasQueuedInstead")
          )
        void refresh()
        if (result.disposition === "steered")
          useConversationActivityStore.getState().bumpMessages(conversationId)
        return result
      } catch (cause) {
        const reason = cause instanceof Error ? cause.message : String(cause)
        setPending((current) =>
          current.map((item) =>
            item.id === requestId ? { ...item, status: "failed", reason } : item
          )
        )
        throw cause
      }
    },
    [conversationId, onNew, refresh, client, queryKey]
  )

  const perform = useCallback(
    (operation: () => Promise<unknown>, message?: ChatSubmission) => {
      void operation().catch((cause: unknown) => {
        notifyError(
          cause instanceof Error
            ? cause.message
            : translateCurrent("common.generationFailed")
        )
        if (message) {
          const composer = useComposerStore.getState()
          if (!composer.draft.trim()) {
            composer.setDraft(message.text)
            for (const attachment of message.attachments) {
              if (
                !composer.attachments.some((item) => item.id === attachment.id)
              )
                composer.addAttachment(attachment)
            }
          }
        }
      })
    },
    []
  )

  const saveQueuedMessage = useCallback(
    async (id: string, message: ChatSubmission) => {
      if (!conversationId)
        throw new Error(
          translateCurrent("common.queuedMessageNoLongerAvailable")
        )
      if (id.startsWith("failed:")) {
        const requestId = id.slice("failed:".length)
        const item = pendingRef.current.find(
          (entry) =>
            entry.id === requestId && entry.conversationId === conversationId
        )
        if (!item)
          throw new Error(
            translateCurrent("common.queuedMessageNoLongerAvailable")
          )
        await submit(message, item.mode, requestId)
        return
      }
      await updateConversationFollowUp(conversationId, Number(id), {
        content: message.text,
        attachments: message.attachments.map(mapAttachmentToContent),
      })
      await refresh()
    },
    [conversationId, refresh, submit]
  )

  const queue = useMemo<ChatQueueAdapter>(() => {
    const waiting = items.filter((item) => item.status === "queued")
    return {
      items: [
        ...waiting.map((item) => {
          const attachments = item.attachments.flatMap((attachment) =>
            attachment.type === "text"
              ? []
              : [
                  {
                    type: "file" as const,
                    filename: attachment.metadata?.filename,
                    mimeType: attachment.source.mimeType,
                    data: attachment.source.value,
                  },
                ]
          )
          return {
            id: String(item.id),
            prompt: promptOf(item),
            parts: [
              ...attachments,
              {
                type: "text" as const,
                text:
                  item.status === "failed"
                    ? `${promptOf(item)} — ${item.reason || translateCurrent("common.generationFailed")}`
                    : promptOf(item),
              },
            ],
          } satisfies QueueItemState
        }),
        ...pending
          .filter((item) => item.conversationId === conversationId)
          .map((item) => ({
            ...queueItemFromSubmission(item.id, item.message),
            id: `${item.status === "saving" ? "pending" : "failed"}:${item.id}`,
          })),
      ],
      steerItems: [],
      enqueue: (message) =>
        perform(
          () =>
            running
              ? submit(message, usePrefsStore.getState().followUpMode)
              : waiting.length > 0
                ? submit(message, "queue")
                : onNew(message),
          running || waiting.length > 0 ? undefined : message
        ),
      steer: (message) =>
        perform(
          () => submit(message, usePrefsStore.getState().followUpMode),
          undefined
        ),
      remove: (id) => {
        if (id.startsWith("pending:")) return
        if (id.startsWith("failed:")) {
          setPending((current) =>
            current.filter((item) => item.id !== id.slice(7))
          )
          return
        }
        if (conversationId)
          perform(async () => {
            await removeConversationFollowUp(conversationId, Number(id))
            await refresh()
          })
      },
      edit: (id, message) => {
        if (id.startsWith("pending:")) return
        if (id.startsWith("failed:")) {
          perform(() => saveQueuedMessage(id, message))
          return
        }
        if (conversationId)
          perform(async () => {
            await updateConversationFollowUp(conversationId, Number(id), {
              content: message.text,
              attachments: message.attachments.map(mapAttachmentToContent),
            })
            await refresh()
          }, message)
      },
      move: (id, placement) => {
        if (placement.lane === "steer") {
          const item = waiting.find((entry) => String(entry.id) === id)
          if (!item || !conversationId) return
          perform(async () => {
            // 引导：立刻把这条消息发给正在运行的模型，不中断当前回复
            await submit(submissionFromFollowUp(item), "steer")
            await removeConversationFollowUp(conversationId, item.id)
            await refresh()
          })
          return
        }
        if (id.startsWith("pending:") || id.startsWith("failed:")) return
        if (!conversationId) return
        const filtered = waiting.filter((item) => String(item.id) !== id)
        const before = placement.insertBefore
          ? filtered.findIndex(
              (item) => String(item.id) === placement.insertBefore
            )
          : -1
        const after = placement.insertAfter
          ? filtered.findIndex(
              (item) => String(item.id) === placement.insertAfter
            )
          : -1
        const position =
          before >= 0 ? before : after >= 0 ? after + 1 : filtered.length
        perform(async () => {
          await updateConversationFollowUp(conversationId, Number(id), {
            position,
          })
          await refresh()
        })
      },
    }
  }, [
    items,
    pending,
    running,
    perform,
    submit,
    onNew,
    conversationId,
    refresh,
    saveQueuedMessage,
  ])
  return {
    queue,
    saveQueuedMessage,
    failures: items.filter((item) => item.status === "failed"),
  }
}
