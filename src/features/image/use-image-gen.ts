import { readAgUiRunEvents } from "@/api/stream"
import { translateCurrent } from "@/lib/i18n"
import { useQueryClient } from "@tanstack/react-query"
import { useCallback } from "react"

import { getConversation, stopConversation, streamImageGeneration } from "@/api"
import { queryKeys } from "@/api/query-keys"
import { applyAgUiEvent } from "@/features/chat/message-events"
import { useComposerStore } from "@/features/chat/composer-store"
import { buildImageForwardedProps } from "@/features/chat/forwarded-props"
import {
  sanitizeImageForwardedProps,
  type ImageAspectRatio,
  type ImageQuality,
  type ImageSize,
} from "@/features/image/image-options"
import { useImageStore } from "@/features/image/image-store"
import { imageResultFromMessages } from "@/features/image/image-result"
import {
  imageConversationKey,
  imageConversationMessages,
  mergeImageConversationMessages,
} from "@/features/image/image-conversations"
import { imageFollowUpMessage } from "@/features/image/image-follow-up"
import { dataSourceKey, dataSourceSignal } from "@/lib/account-source"
import { ApiError } from "@/api/http"
import { ensureAuthenticatedSession } from "@/features/auth/require-session"
import { ensureConversationOnline } from "@/features/chat/require-online"
import type { ChatMessage, ConversationDetail, ModelOptions } from "@/lib/types"

const activeRuns = new Map<string, AbortController>()

export function discardImageGeneration(conversationId: string) {
  const controller = activeRuns.get(conversationId)
  if (!controller) return
  activeRuns.delete(conversationId)
  controller.abort()
}

function isConversationBusy(conversationId: string) {
  return (
    activeRuns.has(conversationId) ||
    useImageStore
      .getState()
      .items.some(
        (item) =>
          item.conversationId === conversationId && item.status === "streaming"
      )
  )
}

export function useImageGen() {
  const queryClient = useQueryClient()

  const generate = useCallback(async () => {
    if (!ensureAuthenticatedSession() || !ensureConversationOnline()) return
    const composer = useComposerStore.getState()
    const prompt = useImageStore.getState().prompt.trim()
    if (!prompt || !composer.image_provider_id || !composer.image_model_id) {
      return
    }

    const selectedId = useImageStore.getState().selectedConversationId
    const selectedDetail = selectedId
      ? queryClient.getQueryData<ConversationDetail>(
          imageConversationKey(selectedId)
        )
      : undefined
    if (selectedDetail?.is_generating) return
    const conversationId = selectedId ?? crypto.randomUUID()
    if (isConversationBusy(conversationId)) return
    const existing = useImageStore
      .getState()
      .items.find((item) => item.conversationId === conversationId)
    const itemId = existing?.id ?? conversationId
    const clientRunId = crypto.randomUUID()
    const source = dataSourceKey()
    const size = (composer.image_size ?? "auto") as ImageSize
    const quality = (composer.image_quality ?? "auto") as ImageQuality
    const aspect = (composer.image_aspect_ratio ?? "1:1") as ImageAspectRatio

    useImageStore.getState().prependItem({
      id: itemId,
      clientRunId,
      conversationId,
      prompt: existing?.prompt || prompt,
      title: existing?.title,
      content: "",
      urls: [],
      status: "streaming",
      createdAt: existing?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
      messages: existing?.messages ?? [],
      size,
      quality,
      aspect,
    })
    useImageStore.setState({
      selectedConversationId: conversationId,
      prompt: "",
    })

    const controller = new AbortController()
    const signal = dataSourceSignal(controller.signal)
    activeRuns.set(conversationId, controller)
    const releaseRun = () => {
      if (activeRuns.get(conversationId) === controller)
        activeRuns.delete(conversationId)
    }
    signal.addEventListener("abort", releaseRun, { once: true })
    let history = existing?.messages ?? []
    let followUp = imageFollowUpMessage(prompt, history)
    const placeholder: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      isPlaceholder: true,
      status: "streaming",
    }
    let messages: ChatMessage[] = [...history, followUp.message, placeholder]
    const patchItem = (
      patch: Parameters<
        ReturnType<typeof useImageStore.getState>["patchItem"]
      >[1]
    ) => {
      if (
        dataSourceKey() === source &&
        useImageStore.getState().items.find((item) => item.id === itemId)
          ?.clientRunId === clientRunId
      )
        useImageStore.getState().patchItem(itemId, patch)
    }
    patchItem({ messages })

    try {
      if (selectedId && !existing?.messages) {
        const cached = queryClient.getQueryData<ConversationDetail>(
          imageConversationKey(conversationId)
        )
        const detail =
          cached ??
          (await getConversation(conversationId, { messageLimit: 50 }))
        signal.throwIfAborted()
        history = imageConversationMessages(detail)
        followUp = imageFollowUpMessage(prompt, history)
        patchItem({ title: detail.title })
      }
      messages = [...history, followUp.message, placeholder]
      patchItem({ messages })
      const response = await streamImageGeneration(
        {
          conversation_id: conversationId,
          messages: [followUp.outgoing],
          forwarded_props: sanitizeImageForwardedProps(
            buildImageForwardedProps({
              ...composer,
              provider_id: composer.image_provider_id,
              model_id: composer.image_model_id,
            }),
            queryClient
              .getQueryData<ModelOptions>(queryKeys.modelOptions())
              ?.providers.find(
                (provider) => provider.id === composer.image_provider_id
              )?.type
          ),
        },
        signal
      )
      if (!response.body) {
        throw new Error(translateCurrent("common.streamingResponseWasEmpty"))
      }
      for await (const event of readAgUiRunEvents(response.body)) {
        signal.throwIfAborted()
        messages = applyAgUiEvent(messages, event)
        const result = imageResultFromMessages(messages)
        patchItem({
          messages,
          content: result.content,
          urls: result.urls,
          status: result.failed ? "error" : "streaming",
          error: result.error,
        })
      }
      signal.throwIfAborted()
      try {
        const detail = await getConversation(conversationId, {
          messageLimit: 50,
          refresh: true,
        })
        signal.throwIfAborted()
        if (!imageResultFromMessages(messages).failed) {
          messages = mergeImageConversationMessages(detail, messages)
          patchItem({ title: detail.title })
          queryClient.setQueryData(imageConversationKey(conversationId), detail)
        }
      } catch {
        // 生成已完成，详情暂时不可用时保留流中的完整内容
        signal.throwIfAborted()
      }
      const result = imageResultFromMessages(messages)
      patchItem({
        messages,
        updatedAt: Date.now(),
        content: result.content,
        urls: result.urls,
        status: result.failed ? "error" : "complete",
        error: result.error,
      })
      void queryClient.invalidateQueries({
        queryKey: queryKeys.conversations(),
      })
    } catch (err) {
      if (signal.aborted) {
        patchItem({
          messages: applyAgUiEvent(messages, {
            type: "RUN_FINISHED",
            outcome: { type: "cancelled" },
          }),
          status: "error",
          error: translateCurrent("common.stopped"),
        })
        return
      }
      const message =
        err instanceof ApiError || err instanceof Error
          ? err.message
          : translateCurrent("common.generationFailed")
      patchItem({
        messages: applyAgUiEvent(messages, { type: "RUN_ERROR", message }),
        status: "error",
        error: message,
      })
    } finally {
      signal.removeEventListener("abort", releaseRun)
      releaseRun()
    }
  }, [queryClient])

  const stop = useCallback(async () => {
    const conversationId = useImageStore.getState().selectedConversationId
    if (!conversationId) return
    const controller = activeRuns.get(conversationId)
    if (controller) {
      activeRuns.delete(conversationId)
      controller.abort()
    }
    for (const item of useImageStore.getState().items) {
      if (item.conversationId === conversationId && item.status === "streaming")
        useImageStore.getState().patchItem(item.id, {
          status: "error",
          error: translateCurrent("common.stopped"),
        })
    }
    try {
      await stopConversation(conversationId)
      void queryClient.invalidateQueries({
        queryKey: imageConversationKey(conversationId),
      })
      void queryClient.invalidateQueries({
        queryKey: queryKeys.conversations(),
      })
    } catch {
      // 本地已经停流，后端停止失败不阻断界面
    }
  }, [queryClient])

  return { generate, stop }
}
