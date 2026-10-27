import { useQueryClient } from "@tanstack/react-query"
import { startWorkTiming, settleWorkTiming } from "@/features/chat/work-timing"
import {
  createWorkTimingCache,
  type WorkTimingCache,
} from "@/features/chat/work-timing-cache"
import { API_V1 } from "@/lib/config"
import {
  currentAccountSource,
  dataSourceKey,
  useAccountSourceStore,
} from "@/lib/account-source"
import { useSessionStore } from "@/lib/session"
import { ensureAuthenticatedSession } from "@/features/auth/require-session"
import { ensureConversationOnline } from "@/features/chat/require-online"
import { translateCurrent } from "@/lib/i18n"
import { codingRuntimeFromMessage } from "@/lib/execution-runtime"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import {
  deleteConversationMessage,
  getConversation,
  getConversationMessages,
  promoteAttachment,
  regenerateMessage,
  resolveCodingApproval,
  stopConversation,
  streamCompletion,
  subscribeConversationEvents,
  updateConversationWorkspace,
} from "@/api"
import {
  applyAgUiEvent,
  latestAgentState,
  snapshotToChatMessages,
  mergeSnapshotWithLive,
  settleStreamingMessages,
} from "@/features/chat/message-events"
import { completionAssistantId } from "@/features/assistants/assistant"
import {
  setConversationGenerating,
  useConversationActivityStore,
} from "@/features/chat/conversation-activity"
import { markUnreadAfterAssistantReply } from "@/features/chat/conversation-unread"
import { useComposerStore } from "@/features/chat/composer-store"
import { isPersistedMessagePk } from "@/features/chat/message-pk"
import { useConversationTuningStore } from "@/features/chat/conversation-tuning"
import {
  mergeConversationWorkspace,
  workspaceFromConversation,
} from "@/lib/conversation-workspace"
import { resolveChatForwardedProps } from "@/features/chat/forwarded-props"
import {
  conversationAgentMode,
  useConversationModeStore,
} from "./conversation-mode"
import { clearModelCheckpoints, modelCheckpointKey } from "./model-checkpoints"
import { buildChatSendPayload } from "@/features/chat/send-payload"
import {
  checkSelectedMcpConnections,
  createMcpFailureRecovery,
  notifyMcpConnectionCheck,
  readMcpRunEvents,
} from "@/features/chat/mcp-connections"
import {
  applyApprovalChoice,
  approvalsForResume,
  autoApprovalsFromAllowlist,
  markToolsResolved,
  pendingApprovalTools,
} from "@/features/chat/tool-approvals"
import { useSelectionStore } from "@/features/shell/selection-store"
import { notifyDesktop } from "@/lib/desktop-notify"
import { ApiError, isAbortError } from "@/api/http"
import type { ChatAttachment, ChatMessage } from "@/lib/types"
import type { TranscriptQuoteAnchor } from "@/features/chat/transcript-state"
import type { WorkspaceBackend } from "@/shared/workspace"

function echoConversationAssistant(detail: { assistant_id: number | null }) {
  useSelectionStore.getState().setSelectedAssistantId(detail.assistant_id)
}

function lastUserMessage(messages: ChatMessage[]) {
  return [...messages].reverse().find((item) => item.role === "user")
}

export function isEditableChatMessage(
  message: ChatMessage | null | undefined
): message is ChatMessage {
  return Boolean(
    message &&
    message.role === "user" &&
    isPersistedMessagePk(message.pk) &&
    !(message.attachments?.length ?? 0) &&
    message.content.trim()
  )
}

export function editableUserMessage(
  messages: ChatMessage[],
  sourceId: string | null | undefined
): ChatMessage | null {
  if (!sourceId) {
    return null
  }
  const lastUser = lastUserMessage(messages)
  if (
    !lastUser ||
    lastUser.id !== sourceId ||
    !isEditableChatMessage(lastUser)
  ) {
    return null
  }
  return lastUser
}

/**
 * 当前回合：最后一条用户提问，以及它之后尚未出现的最新回复。
 * 提问之后还没有回复时没有最新回复，历史回复只能在新分支中重生成。
 */
export function currentTurn(messages: ChatMessage[]) {
  const promptIndex = messages.findLastIndex((item) => item.role === "user")
  const prompt = promptIndex >= 0 ? (messages[promptIndex] ?? null) : null
  const reply =
    messages.findLast(
      (item, index) => index > promptIndex && item.role === "assistant"
    ) ?? null
  return { prompt, reply }
}

/** 只有当前回合的最新回复支持直接重新生成 */
export function canRegenerateReply(
  messages: ChatMessage[],
  id: string | undefined
) {
  if (!id) return false
  const { prompt, reply } = currentTurn(messages)
  if (!reply || reply.id !== id) return false
  if (!isPersistedMessagePk(reply.pk)) return false
  return canRegenerateMessage(messages, prompt?.pk ?? null)
}

export type RegenerateRoute = "in-place" | "branch"

/**
 * 后端重生成只接受最后一条用户消息：
 * 当前回合的最新回复可以原地重生成，历史回复必须先分叉出新分支再重生成
 */
export function regenerateRoute(
  messages: ChatMessage[],
  id: string,
  options: { coding?: boolean } = {}
): RegenerateRoute | null {
  const target = messages.find((item) => item.id === id)
  if (!target || target.role !== "assistant") return null
  if (!isPersistedMessagePk(target.pk)) return null
  if (options.coding) return "branch"
  return canRegenerateReply(messages, id) ? "in-place" : "branch"
}

export function composerSubmitAction(
  editingMessageId: string | null,
  messages: ChatMessage[],
  text: string
): { type: "edit"; pk: number; text: string } | { type: "send"; text: string } {
  const trimmed = text.trim()
  if (editingMessageId) {
    const source = editableUserMessage(messages, editingMessageId)
    if (source?.pk != null && trimmed) {
      return { type: "edit", pk: source.pk, text: trimmed }
    }
  }
  return { type: "send", text }
}

export type ComposerEditRoute = "in-place" | "branch"

/**
 * 编辑最后一条用户消息时直接在原会话重新生成
 * coding 模式或已不是最后一条用户消息时，只能在新分支里编辑
 */
export function composerEditRoute(
  messages: ChatMessage[],
  pk: number,
  content: string,
  options: { coding?: boolean } = {}
): ComposerEditRoute {
  return options.coding || !canRegenerateMessage(messages, pk, content)
    ? "branch"
    : "in-place"
}

// 后端重生成只接受最后一条用户消息，编辑同样只允许这条用户消息
export function canRegenerateMessage(
  messages: ChatMessage[],
  pk: number | null,
  content?: string
): boolean {
  if (pk == null) {
    return false
  }
  if (!isPersistedMessagePk(pk)) {
    return false
  }
  if (content != null) {
    if (!content.trim()) return false
    const source = lastUserMessage(messages)
    return editableUserMessage(messages, source?.id)?.pk === pk
  }
  return lastUserMessage(messages)?.pk === pk
}

export function regenerateTargetPk(
  messages: ChatMessage[],
  pk: number
): number | null {
  const index = messages.findIndex((item) => item.pk === pk)
  if (index < 0) return null
  const target = messages[index]
  if (target?.role === "user")
    return isPersistedMessagePk(target.pk) ? target.pk : null
  const user = [...messages.slice(0, index)]
    .reverse()
    .find((item) => item.role === "user")
  return isPersistedMessagePk(user?.pk) ? user.pk : null
}

export function messagesAfterRegenerate(
  messages: ChatMessage[],
  pk: number,
  pendingAssistant: ChatMessage,
  content?: string
): ChatMessage[] {
  const index = messages.findIndex((item) => item.pk === pk)
  // A stale action must never rebuild the transcript from only user messages
  if (index < 0 || !canRegenerateMessage(messages, pk, content)) {
    return messages
  }
  const kept = messages.slice(
    0,
    messages[index]?.role === "assistant" ? index : index + 1
  )
  const withContent =
    content != null
      ? kept.map((item, itemIndex) =>
          itemIndex === kept.length - 1 && item.role === "user"
            ? { ...item, content }
            : item
        )
      : kept
  return [...withContent, pendingAssistant]
}

function hasAwaitingApproval(messages: ChatMessage[]) {
  return messages.some((item) => item.status === "awaiting-approval")
}

export function shouldSyncConversationAfterRun(messages: ChatMessage[]) {
  return !hasAwaitingApproval(messages)
}

export function shouldAnnounceConversationAfterRun(messages: ChatMessage[]) {
  return (
    shouldSyncConversationAfterRun(messages) &&
    !messages.some((item) => item.status === "error")
  )
}

export function mergeRecentConversationMessages(
  refreshed: ChatMessage[],
  current: ChatMessage[]
): ChatMessage[] {
  if (!refreshed.length) return current
  const snapshotIndex = new Map(
    refreshed.map((message, index) => [message.id, index])
  )
  const snapshotPkIndex = new Map(
    refreshed.flatMap((message, index) =>
      message.pk != null ? [[message.pk, index] as const] : []
    )
  )
  let matchedSnapshotIndex: number | undefined
  let boundary = current.findIndex((message) => {
    matchedSnapshotIndex =
      snapshotIndex.get(message.id) ??
      (message.pk != null ? snapshotPkIndex.get(message.pk) : undefined)
    return matchedSnapshotIndex != null
  })
  // 临时用户 ID 被持久化 ID 替换时，整轮一起更新，避免重复保留旧提问
  if (
    boundary > 0 &&
    matchedSnapshotIndex != null &&
    refreshed[0]?.role === "user"
  ) {
    const precedingUsers = refreshed
      .slice(0, matchedSnapshotIndex)
      .filter((message) => message.role === "user").length
    for (let remaining = precedingUsers; remaining > 0; remaining--) {
      let previousUser = boundary - 1
      while (previousUser >= 0 && current[previousUser]?.role !== "user")
        previousUser--
      boundary = Math.max(0, previousUser)
    }
  }
  return [
    ...current.slice(0, Math.max(0, boundary)),
    ...mergeSnapshotWithLive(refreshed, current.slice(Math.max(0, boundary))),
  ]
}

function applyConversationSnapshot(
  conversationId: string,
  setMessages: (updater: (current: ChatMessage[]) => ChatMessage[]) => void,
  workCache: WorkTimingCache,
  isCurrent: () => boolean,
  expectedRunId?: string
) {
  void getConversation(conversationId, { messageLimit: 50, refresh: true })
    .then((detail) => {
      if (!isCurrent()) return
      const snapshot = detail.messages_snapshot
      setMessages((current) => {
        if (!isCurrent()) return current
        if (
          expectedRunId &&
          current.findLast((message) => message.role === "assistant")
            ?.workTiming?.runId !== expectedRunId
        )
          return current
        const refreshed = snapshotToChatMessages(snapshot?.messages ?? [])
        const merged = mergeRecentConversationMessages(refreshed, current)
        const restored = workCache.restore(
          conversationId,
          merged,
          conversationDetailIsGenerating(detail)
        )
        workCache.remember(conversationId, restored, true)
        return restored
      })
      echoConversationAssistant(detail)
    })
    .catch(() => undefined)
}

async function promoteStagedAttachments(
  conversationId: string,
  attachments: readonly ChatAttachment[]
) {
  const staged = attachments.filter((item) => item.stagedObjectId != null)
  if (!staged.length) return
  try {
    const detail = await getConversation(conversationId, {
      messageLimit: 1,
      silent: true,
    })
    if (detail.source !== "cloud") return
  } catch {
    return
  }
  await Promise.allSettled(
    staged.map((item) =>
      promoteAttachment(item.stagedObjectId!, conversationId)
    )
  )
}

export function conversationLoadAction(
  conversationId: string | null,
  skipNextLoad: boolean
): "reset-new" | "skip" | { action: "load"; conversationId: string } {
  if (!conversationId) {
    return "reset-new"
  }
  if (skipNextLoad) {
    return "skip"
  }
  return { action: "load", conversationId }
}

export function resolveChatPaneConversationId(
  chatPaneKey: string,
  selectedConversationId: string | null,
  urlConversationId: string | null
): string | null {
  if (chatPaneKey.startsWith("draft-")) {
    return selectedConversationId
  }
  return selectedConversationId ?? urlConversationId
}

export function shouldShowHistoryLoading(
  conversationId: string | null,
  status: "idle" | "loading" | "streaming"
): boolean {
  return status === "loading" && Boolean(conversationId)
}

export function conversationDetailIsGenerating(detail: {
  is_generating: boolean
}) {
  return Boolean(detail.is_generating)
}

export function useChat({
  conversationId,
  draftKey,
  draftConversationId,
  projectId,
  workspaceBackend,
  onConversationId,
  onSettled,
  onRunActiveChange,
}: {
  conversationId: string | null
  draftKey?: string
  draftConversationId?: string
  projectId?: number | null
  workspaceBackend?: WorkspaceBackend | null
  onConversationId: (conversationId: string) => void
  onSettled?: () => void
  onRunActiveChange?: (active: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [mountedSource] = useState(dataSourceKey)
  const isCurrentSource = useCallback(
    () =>
      useAccountSourceStore.getState().ready &&
      dataSourceKey() === mountedSource,
    [mountedSource]
  )
  const setGenerating = useCallback(
    (id: string | null, generating: boolean) => {
      if (isCurrentSource()) setConversationGenerating(id, generating)
    },
    [isCurrentSource]
  )
  const composer = useComposerStore()
  const user = useSessionStore.getState().user
  const timingScope = `${API_V1}:${user?.uuid ?? user?.id ?? "anonymous"}`
  const workCache = useMemo(() => {
    const storage = (() => {
      try {
        return typeof localStorage === "undefined" ? null : localStorage
      } catch {
        return null
      }
    })()
    return createWorkTimingCache(storage, timingScope)
  }, [timingScope])
  const messageEpoch = useConversationActivityStore((state) =>
    conversationId ? (state.messageEpochById[conversationId] ?? 0) : 0
  )
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loadedConversationId, setLoadedConversationId] = useState<
    string | null
  >(null)
  const [historyCursor, setHistoryCursor] = useState<string | null>(null)
  const historyCursorRef = useRef<string | null>(null)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const historyLock = useRef(false)
  const [status, setStatus] = useState<"idle" | "loading" | "streaming">(
    conversationId ? "loading" : "idle"
  )
  const [error, setError] = useState<string | null>(null)
  const [connectionPhase, setConnectionPhase] = useState<
    "online" | "dropped" | "reconnecting" | "resumed"
  >("online")
  const [reconnectAttempt, setReconnectAttempt] = useState(0)
  const reconnectRequested = useRef(false)
  const localIdRef = useRef(conversationId)
  const pendingNewIdRef = useRef<string | null>(null)
  const skipNextLoadRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const generationRef = useRef<AbortController | null>(null)
  const loadAttemptRef = useRef(0)
  const mountedRef = useRef(true)
  const messagesRef = useRef(messages)
  const approvalDraftRef = useRef<Record<string, boolean>>({})
  const autoApproveLockRef = useRef(false)
  const lastEventIdRef = useRef<string | null>(null)

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  const cancelInFlight = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
  }, [])

  const detachGeneration = useCallback(() => {
    if (abortRef.current && abortRef.current === generationRef.current) {
      abortRef.current = null
      generationRef.current = null
    } else {
      cancelInFlight()
    }
  }, [cancelInFlight])

  // 运行占用的同步标记：队列派发发生在 status 异步落地之前，守卫只认它
  const runActiveRef = useRef(false)
  const onRunActiveChangeRef = useRef(onRunActiveChange)
  useEffect(() => {
    onRunActiveChangeRef.current = onRunActiveChange
  }, [onRunActiveChange])
  const setRunActive = useCallback(
    (active: boolean) => {
      if (runActiveRef.current === active) {
        return
      }
      runActiveRef.current = active
      if (isCurrentSource()) onRunActiveChangeRef.current?.(active)
    },
    [isCurrentSource]
  )

  const prepareMcpRun = useCallback(
    (ids: readonly number[] | null | undefined) => {
      const controller = new AbortController()
      abortRef.current = controller
      setRunActive(true)
      if (!ids?.length) return controller
      return (async () => {
        const check = await checkSelectedMcpConnections(
          queryClient,
          ids,
          useAccountSourceStore.getState().epoch,
          controller.signal
        )
        if (
          isCurrentSource() &&
          mountedRef.current &&
          !controller.signal.aborted &&
          check.allowed
        )
          return controller
        if (
          isCurrentSource() &&
          mountedRef.current &&
          !controller.signal.aborted &&
          !isAbortError(check.error)
        )
          setError(notifyMcpConnectionCheck(check))
        if (abortRef.current === controller) abortRef.current = null
        setRunActive(false)
        return null
      })()
    },
    [isCurrentSource, queryClient, setRunActive]
  )

  const mcpFailureRecovery = useCallback(
    (ids: readonly number[] | null | undefined) =>
      createMcpFailureRecovery(
        queryClient,
        ids,
        useAccountSourceStore.getState().epoch,
        isCurrentSource
      ),
    [isCurrentSource, queryClient]
  )

  const retryConnection = useCallback(() => {
    if (!isCurrentSource() || !localIdRef.current || reconnectRequested.current)
      return
    reconnectRequested.current = true
    cancelInFlight()
    setRunActive(false)
    setConnectionPhase("reconnecting")
    setReconnectAttempt((attempt) => attempt + 1)
  }, [cancelInFlight, isCurrentSource, setRunActive])
  useEffect(() => {
    if (typeof window === "undefined") return
    if (connectionPhase === "resumed") {
      const timer = setTimeout(() => setConnectionPhase("online"), 3000)
      return () => clearTimeout(timer)
    }
    const online = () => {
      if (connectionPhase === "dropped") retryConnection()
    }
    window.addEventListener("online", online)
    return () => window.removeEventListener("online", online)
  }, [connectionPhase, retryConnection])

  useEffect(() => {
    if (!isCurrentSource()) return
    const loadAttempt = ++loadAttemptRef.current
    const isCurrentAttempt = () => loadAttemptRef.current === loadAttempt
    const action = conversationLoadAction(
      conversationId,
      skipNextLoadRef.current
    )
    if (action === "reset-new") {
      if (draftKey) {
        useConversationModeStore.getState().clearDraft(mountedSource, draftKey)
        // 换到新对话时，草稿里的模型切换检查点一起清掉
        clearModelCheckpoints(modelCheckpointKey(null, draftKey))
      }
      const previousId = localIdRef.current
      const wasGenerating =
        abortRef.current != null && abortRef.current === generationRef.current
      skipNextLoadRef.current = false
      localIdRef.current = null
      pendingNewIdRef.current = null
      detachGeneration()
      if (!wasGenerating) setGenerating(previousId, false)
      setMessages([])
      setLoadedConversationId(null)
      setError(null)
      setConnectionPhase("online")
      setStatus("idle")
      return
    }
    if (action === "skip") {
      skipNextLoadRef.current = false
      return
    }

    skipNextLoadRef.current = false
    const loadId = action.conversationId
    pendingNewIdRef.current = null
    const reconnecting =
      reconnectRequested.current && localIdRef.current === loadId
    reconnectRequested.current = false
    detachGeneration()
    localIdRef.current = loadId
    if (!reconnecting) {
      lastEventIdRef.current = null
      setMessages([])
      setLoadedConversationId(null)
    }
    if (!reconnecting) {
      historyCursorRef.current = null
      setHistoryCursor(null)
    }
    setError(null)
    if (!reconnecting) {
      setStatus("loading")
      setConnectionPhase("online")
    }

    let cancelled = false
    let loaded = false
    const controller = new AbortController()
    abortRef.current = controller
    let recoverMcpConnection = () => {}
    void (async () => {
      try {
        const detail = await getConversation(loadId, { messageLimit: 50 })
        if (
          !isCurrentAttempt() ||
          !isCurrentSource() ||
          cancelled ||
          localIdRef.current !== loadId ||
          abortRef.current !== controller
        ) {
          return
        }
        const snapshot = detail.messages_snapshot
        if (!reconnecting || !messagesRef.current.length)
          historyCursorRef.current = detail.history_has_more
            ? detail.history_cursor
            : null
        setHistoryCursor(historyCursorRef.current)
        let next = snapshotToChatMessages(snapshot?.messages ?? [])
        recoverMcpConnection = mcpFailureRecovery(
          lastUserMessage(next)?.turnContext?.mcp_ids
        )
        loaded = true
        const generating = conversationDetailIsGenerating(detail)
        if (generating) {
          const last = next.at(-1)
          if (last?.role === "assistant") {
            if (last.status !== "awaiting-approval") last.status = "streaming"
          } else {
            next.push({
              id: crypto.randomUUID(),
              role: "assistant",
              content: "",
              isPlaceholder: true,
              status: "streaming",
            })
          }
        }
        next = workCache.restore(loadId, next, generating)
        workCache.remember(loadId, next, true)
        setMessages((current) =>
          reconnecting ? mergeRecentConversationMessages(next, current) : next
        )
        setLoadedConversationId(loadId)
        // 编辑中的消息在本栏会话里消失才取消编辑，别把分屏另一栏的编辑会话误杀
        const editing = useComposerStore.getState()
        if (
          editing.editingMessageId &&
          editing.editingConversationId === loadId &&
          !next.some((item) => item.id === editing.editingMessageId)
        ) {
          useComposerStore.getState().clearInput()
        }
        echoConversationAssistant(detail)
        const providerId = detail.provider_id
        const modelId = detail.model_id
        if (providerId && modelId) {
          useComposerStore.getState().setModel(providerId, modelId)
        }
        if (!generating) {
          if (reconnecting && isCurrentAttempt() && !cancelled)
            setConnectionPhase("resumed")
          setStatus("idle")
          return
        }
        if (abortRef.current !== controller) {
          return
        }
        setStatus("streaming")
        setGenerating(loadId, true)
        generationRef.current = controller
        setRunActive(true)
        try {
          const response = await subscribeConversationEvents(
            loadId,
            controller.signal,
            lastEventIdRef.current
          )
          if (!isCurrentSource()) return
          if (!response.body) {
            throw new Error(
              translateCurrent("common.streamingResponseWasEmpty")
            )
          }
          if (
            reconnecting &&
            isCurrentAttempt() &&
            !cancelled &&
            localIdRef.current === loadId
          )
            setConnectionPhase("resumed")
          let streamedMessages = next
          for await (const event of readMcpRunEvents(
            response.body,
            recoverMcpConnection,
            (id) => {
              lastEventIdRef.current = id
            }
          )) {
            if (!isCurrentAttempt() || !isCurrentSource()) return
            streamedMessages = applyAgUiEvent(streamedMessages, event)
            workCache.remember(loadId, streamedMessages)
            if (!cancelled && localIdRef.current === loadId) {
              setMessages((current) => applyAgUiEvent(current, event))
            }
          }
          if (!isCurrentAttempt() || !isCurrentSource()) return
          const settled = settleStreamingMessages(streamedMessages, "complete")
          workCache.remember(loadId, settled, true)
          setGenerating(loadId, false)
          if (shouldAnnounceConversationAfterRun(settled)) {
            void markUnreadAfterAssistantReply(loadId)
          }
          if (shouldSyncConversationAfterRun(settled)) {
            applyConversationSnapshot(
              loadId,
              setMessages,
              workCache,
              () =>
                isCurrentSource() &&
                mountedRef.current &&
                localIdRef.current === loadId,
              settled.findLast((message) => message.role === "assistant")
                ?.workTiming?.runId
            )
          }
          if (cancelled || localIdRef.current !== loadId) {
            return
          }
          setMessages((current) => settleStreamingMessages(current, "complete"))
          setStatus("idle")
        } finally {
          if (isCurrentAttempt()) {
            setRunActive(false)
            setGenerating(loadId, false)
            if (generationRef.current === controller) {
              generationRef.current = null
            }
            if (abortRef.current === controller) {
              abortRef.current = null
            }
            if (
              isCurrentSource() &&
              !cancelled &&
              localIdRef.current === loadId
            ) {
              setStatus("idle")
            }
          }
        }
      } catch (err: unknown) {
        if (!isCurrentAttempt()) return
        setGenerating(loadId, false)
        if (
          !isCurrentSource() ||
          cancelled ||
          isAbortError(err) ||
          localIdRef.current !== loadId
        ) {
          return
        }
        if (loaded) recoverMcpConnection()
        setStatus("idle")
        const message =
          err instanceof Error
            ? err.message
            : translateCurrent(
                loaded
                  ? "common.generationFailed"
                  : "common.couldNotLoadTheConversation"
              )
        setError(message)
        if (!codingRuntimeFromMessage(message))
          setConnectionPhase("dropped")
        if (loaded) {
          setMessages((current) => {
            const settled = settleStreamingMessages(
              current,
              "error",
              Date.now(),
              message
            )
            workCache.remember(loadId, settled, true)
            return settled
          })
        } else {
          setMessages([])
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    cancelInFlight,
    conversationId,
    draftKey,
    mountedSource,
    detachGeneration,
    isCurrentSource,
    mcpFailureRecovery,
    messageEpoch,
    reconnectAttempt,
    setRunActive,
    setGenerating,
    workCache,
  ])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      detachGeneration()
    }
  }, [detachGeneration])

  const stop = useCallback(async () => {
    if (!isCurrentSource()) return
    const activeId = localIdRef.current
    cancelInFlight()
    setGenerating(activeId, false)
    setMessages((current) => {
      const settled = settleStreamingMessages(current, "stopped")
      if (activeId) workCache.remember(activeId, settled, true)
      return settled
    })
    setStatus("idle")
    if (activeId) {
      try {
        await stopConversation(activeId)
      } catch {
        // 本地已经停流，后端停止失败不阻断界面
      }
    }
  }, [cancelInFlight, isCurrentSource, setGenerating, workCache])

  const send = useCallback(
    async (
      text: string,
      incomingAttachments?: ChatAttachment[],
      quote?: TranscriptQuoteAnchor | null,
      newConversation = false
    ) => {
      const attachments =
        incomingAttachments ?? useComposerStore.getState().attachments
      const prompt = text.trim() || useComposerStore.getState().draft.trim()
      if (!ensureAuthenticatedSession() || !ensureConversationOnline()) return
      if (
        !isCurrentSource() ||
        status === "loading" ||
        (!prompt && attachments.length === 0) ||
        !composer.provider_id ||
        !composer.model_id ||
        runActiveRef.current
      ) {
        return
      }

      const composerState = useComposerStore.getState()
      const preparation = prepareMcpRun(composerState.mcp_ids)
      const controller =
        preparation instanceof Promise ? await preparation : preparation
      if (!controller) return
      const recoverMcpConnection = mcpFailureRecovery(composerState.mcp_ids)
      const nextId = newConversation
        ? crypto.randomUUID()
        : (pendingNewIdRef.current ??
          conversationId ??
          draftConversationId ??
          localIdRef.current ??
          crypto.randomUUID())
      const mode =
        conversationAgentMode(nextId) ??
        (newConversation ? conversationAgentMode(conversationId) : undefined) ??
        composerState.agent_mode ??
        "work"
      useConversationModeStore.getState().remember(mountedSource, nextId, mode)
      if (draftKey)
        useConversationModeStore
          .getState()
          .lockDraft(mountedSource, draftKey, mode)
      const isNewConversation =
        newConversation || pendingNewIdRef.current !== null || !conversationId
      if (isNewConversation) pendingNewIdRef.current = nextId
      const assistantId = completionAssistantId({
        isNewConversation,
        assistantId: useSelectionStore.getState().selectedAssistantId,
      })
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        role: "user",
        content: prompt,
        turnContext: {
          agent_mode: mode,
          ...(quote ? { quote } : {}),
        },
        attachments: attachments.length > 0 ? attachments : undefined,
        status: "complete",
      }
      const pendingAssistant: ChatMessage = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        role: "assistant",
        content: "",
        isPlaceholder: true,
        workTiming: startWorkTiming(crypto.randomUUID()),
        status: "streaming",
      }

      localIdRef.current = nextId
      lastEventIdRef.current = null
      if (nextId !== conversationId) {
        useConversationTuningStore.getState().adoptDraftTuning(nextId)
      }

      const streamStartMessages = [
        ...(newConversation ? [] : messagesRef.current),
        userMessage,
        pendingAssistant,
      ]
      workCache.remember(nextId, streamStartMessages, true)
      setError(null)
      setConnectionPhase("online")
      setMessages((current) => [
        ...(newConversation ? [] : current),
        userMessage,
        pendingAssistant,
      ])
      setStatus("streaming")
      setRunActive(true)
      setGenerating(nextId, true)
      useComposerStore.getState().clearInput()

      const payload = buildChatSendPayload({
        conversationId: nextId,
        state: latestAgentState(newConversation ? [] : messagesRef.current),
        projectId,
        assistantId,
        messageId: userMessage.id,
        ...(quote ? { quote } : {}),
        text: prompt,
        attachments,
        composer: composerState,
      })

      generationRef.current = controller
      const showingRun = () =>
        isCurrentSource() &&
        mountedRef.current &&
        localIdRef.current === nextId &&
        abortRef.current === controller

      let streamedMessages = streamStartMessages
      let conversationReady = !isNewConversation
      let requestSent = false
      const markWorktreeActive = () => {
        if (
          workspaceBackend !== "local" ||
          draftConversationId !== nextId ||
          typeof window === "undefined"
        )
          return
        void window.buddyDesktop
          ?.workspace({
            action: "mark-worktree-active",
            conversationId: nextId,
            source: currentAccountSource() ?? undefined,
          })
          .catch(() => {})
      }
      try {
        const response = await streamCompletion(payload, controller.signal, {
          onRequest: () => {
            requestSent = true
          },
        })
        if (!isCurrentSource()) return
        conversationReady = true
        pendingNewIdRef.current = null
        if (typeof window !== "undefined")
          await window.buddyDesktop?.workspace({
            action: "lock-environment",
            conversationId: nextId,
            projectId: projectId ?? undefined,
            source: currentAccountSource() ?? undefined,
          })
        if (nextId !== conversationId && showingRun()) {
          // 服务端提交对话事务后才返回成功响应，此时再导航并启用详情查询
          skipNextLoadRef.current = true
          setLoadedConversationId(nextId)
          markWorktreeActive()
          onConversationId(nextId)
        }
        if (!response.body) {
          throw new Error(translateCurrent("common.streamingResponseWasEmpty"))
        }
        if (isNewConversation && projectId != null) {
          void updateConversationWorkspace(
            nextId,
            mergeConversationWorkspace(workspaceFromConversation(null), {
              project_id: projectId,
              assistant_id: assistantId ?? null,
            })
          )
        }
        for await (const event of readMcpRunEvents(
          response.body,
          recoverMcpConnection,
          (id) => {
            lastEventIdRef.current = id
          }
        )) {
          if (!isCurrentSource()) return
          streamedMessages = applyAgUiEvent(streamedMessages, event)
          workCache.remember(nextId, streamedMessages)
          if (showingRun()) {
            setMessages((current) => applyAgUiEvent(current, event))
          }
        }
        if (!isCurrentSource()) return
        const settled = settleStreamingMessages(streamedMessages, "complete")
        workCache.remember(nextId, settled, true)
        void promoteStagedAttachments(nextId, attachments)
        if (showingRun()) {
          setMessages((current) => settleStreamingMessages(current, "complete"))
        }
        const shouldSync = shouldSyncConversationAfterRun(settled)
        const shouldAnnounce = shouldAnnounceConversationAfterRun(settled)
        const lastAssistant = [...settled]
          .reverse()
          .find((item) => item.role === "assistant")
        const preview = lastAssistant?.content ?? ""
        if (shouldAnnounce) {
          void notifyDesktop({ title: "FbaBuddy", body: preview })
          void markUnreadAfterAssistantReply(nextId)
        }
        if (shouldSync) {
          applyConversationSnapshot(
            nextId,
            setMessages,
            workCache,
            () =>
              isCurrentSource() &&
              mountedRef.current &&
              localIdRef.current === nextId,
            streamedMessages.findLast((message) => message.role === "assistant")
              ?.workTiming?.runId
          )
        }
      } catch (err) {
        if (
          !isCurrentSource() ||
          controller.signal.aborted ||
          isAbortError(err)
        ) {
          return
        }
        recoverMcpConnection()
        let recovered = false
        if (
          !conversationReady &&
          requestSent &&
          !(
            err instanceof ApiError &&
            err.code >= 400 &&
            err.code < 500 &&
            err.code !== 409
          ) &&
          showingRun()
        ) {
          try {
            await getConversation(nextId, {
              messageLimit: 50,
              refresh: true,
              silent: true,
              signal: controller.signal,
            })
            if (!showingRun() || controller.signal.aborted) return
            void promoteStagedAttachments(nextId, attachments)
            conversationReady = true
            recovered = true
            pendingNewIdRef.current = null
            skipNextLoadRef.current = false
            markWorktreeActive()
            onConversationId(nextId)
          } catch {
            if (!isCurrentSource() || controller.signal.aborted) return
          }
        }
        const message =
          err instanceof ApiError || err instanceof Error
            ? err.message
            : translateCurrent("common.generationFailed")
        if (showingRun()) {
          setError(message)
          if (
            conversationReady &&
            !codingRuntimeFromMessage(message) &&
            (!(err instanceof ApiError) || err.code >= 500)
          )
            setConnectionPhase("dropped")
          setMessages((current) => {
            const settled = settleStreamingMessages(
              current,
              "error",
              Date.now(),
              message
            )
            workCache.remember(nextId, settled, true)
            return settled
          })
          if (conversationReady && !recovered)
            applyConversationSnapshot(
              nextId,
              setMessages,
              workCache,
              () =>
                isCurrentSource() &&
                mountedRef.current &&
                localIdRef.current === nextId,
              streamedMessages.findLast(
                (message) => message.role === "assistant"
              )?.workTiming?.runId
            )
        }
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null
        }
        setGenerating(nextId, false)
        if (isCurrentSource()) onSettled?.()
        if (isCurrentSource() && localIdRef.current === nextId) {
          setStatus("idle")
        }
        setRunActive(false)
      }
    },
    [
      composer,
      status,
      conversationId,
      draftConversationId,
      draftKey,
      mountedSource,
      isCurrentSource,
      mcpFailureRecovery,
      onConversationId,
      onSettled,
      projectId,
      prepareMcpRun,
      setRunActive,
      setGenerating,
      workCache,
      workspaceBackend,
    ]
  )

  const removeMessage = useCallback(
    async (pk: number) => {
      if (!ensureConversationOnline()) return
      if (!isCurrentSource() || !conversationId) {
        return
      }
      await deleteConversationMessage(conversationId, pk)
      if (!isCurrentSource()) return
      setMessages((current) => {
        if (!isCurrentSource()) return current
        const next = current.filter((item) => item.pk !== pk)
        // 同上：只有本栏的编辑会话才跟着被删的消息一起取消
        const editing = useComposerStore.getState()
        if (
          editing.editingMessageId &&
          editing.editingConversationId === conversationId &&
          !next.some((item) => item.id === editing.editingMessageId)
        ) {
          useComposerStore.getState().clearInput()
        }
        return next
      })
      onSettled?.()
    },
    [conversationId, isCurrentSource, onSettled]
  )

  const regenerate = useCallback(
    async (pk: number, content?: string) => {
      if (!ensureAuthenticatedSession() || !ensureConversationOnline()) return
      if (
        !isCurrentSource() ||
        !conversationId ||
        !composer.provider_id ||
        !composer.model_id ||
        runActiveRef.current
      ) {
        return
      }
      if (conversationAgentMode(conversationId) === "coding") return
      const nextContent = content?.trim()
      const targetPk = regenerateTargetPk(messagesRef.current, pk)
      if (targetPk == null) return
      const target = messagesRef.current.find((item) => item.pk === targetPk)
      if (target?.turnContext?.agent_mode === "coding") return
      if (
        !canRegenerateMessage(
          messagesRef.current,
          nextContent ? pk : targetPk,
          nextContent
        )
      )
        return
      const composerState = useComposerStore.getState()
      const preparation = prepareMcpRun(composerState.mcp_ids)
      const controller =
        preparation instanceof Promise ? await preparation : preparation
      if (!controller) return
      const recoverMcpConnection = mcpFailureRecovery(composerState.mcp_ids)
      const pendingAssistant: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        isPlaceholder: true,
        workTiming: startWorkTiming(crypto.randomUUID()),
        status: "streaming",
      }
      const streamStartMessages = messagesAfterRegenerate(
        messagesRef.current,
        targetPk,
        pendingAssistant,
        nextContent || undefined
      )
      lastEventIdRef.current = null
      workCache.remember(conversationId, streamStartMessages, true)
      setError(null)
      setMessages((current) =>
        messagesAfterRegenerate(
          current,
          targetPk,
          pendingAssistant,
          nextContent || undefined
        )
      )
      setStatus("streaming")
      setRunActive(true)
      setGenerating(conversationId, true)

      generationRef.current = controller
      const showingRun = () =>
        isCurrentSource() &&
        mountedRef.current &&
        localIdRef.current === conversationId &&
        abortRef.current === controller
      let streamedMessages = streamStartMessages
      try {
        const response = await regenerateMessage(
          conversationId,
          targetPk,
          {
            state: latestAgentState(streamStartMessages),
            forwarded_props: resolveChatForwardedProps(composerState, {
              conversationId,
            }),
            ...(nextContent ? { content: nextContent } : {}),
          },
          controller.signal
        )
        if (!isCurrentSource()) return
        if (!response.body) {
          throw new Error(translateCurrent("common.streamingResponseWasEmpty"))
        }
        for await (const event of readMcpRunEvents(
          response.body,
          recoverMcpConnection,
          (id) => {
            lastEventIdRef.current = id
          }
        )) {
          if (!isCurrentSource()) return
          streamedMessages = applyAgUiEvent(streamedMessages, event)
          workCache.remember(conversationId, streamedMessages)
          if (showingRun()) {
            setMessages((current) => applyAgUiEvent(current, event))
          }
        }
        if (!isCurrentSource()) return
        const settled = settleStreamingMessages(streamedMessages, "complete")
        workCache.remember(conversationId, settled, true)
        if (showingRun()) {
          setMessages((current) => settleStreamingMessages(current, "complete"))
        }
        const shouldSync = shouldSyncConversationAfterRun(settled)
        const shouldAnnounce = shouldAnnounceConversationAfterRun(settled)
        if (shouldAnnounce) {
          void markUnreadAfterAssistantReply(conversationId)
        }
        if (shouldSync) {
          applyConversationSnapshot(
            conversationId,
            setMessages,
            workCache,
            () =>
              isCurrentSource() &&
              mountedRef.current &&
              localIdRef.current === conversationId,
            streamedMessages.findLast((message) => message.role === "assistant")
              ?.workTiming?.runId
          )
        }
      } catch (err) {
        if (!isCurrentSource() || controller.signal.aborted) {
          return
        }
        recoverMcpConnection()
        const message =
          err instanceof ApiError || err instanceof Error
            ? err.message
            : translateCurrent("common.regenerateFailed")
        if (showingRun()) {
          setError(message)
          setMessages((current) => {
            const settled = settleStreamingMessages(
              current,
              "error",
              Date.now(),
              message
            )
            workCache.remember(conversationId, settled, true)
            return settled
          })
          applyConversationSnapshot(
            conversationId,
            setMessages,
            workCache,
            () =>
              isCurrentSource() &&
              mountedRef.current &&
              localIdRef.current === conversationId,
            streamedMessages.findLast((message) => message.role === "assistant")
              ?.workTiming?.runId
          )
        }
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null
        }
        setGenerating(conversationId, false)
        if (isCurrentSource()) onSettled?.()
        if (isCurrentSource() && localIdRef.current === conversationId) {
          setStatus("idle")
        }
        setRunActive(false)
      }
    },
    [
      composer,
      conversationId,
      isCurrentSource,
      mcpFailureRecovery,
      onSettled,
      prepareMcpRun,
      setGenerating,
      setRunActive,
      workCache,
    ]
  )

  const continueWithApprovals = useCallback(
    async (approvals: Record<string, boolean>) => {
      if (!ensureAuthenticatedSession() || !ensureConversationOnline()) return
      const activeId = localIdRef.current
      const composerState = useComposerStore.getState()
      if (
        !isCurrentSource() ||
        !activeId ||
        !composerState.provider_id ||
        !composerState.model_id ||
        runActiveRef.current
      ) {
        return
      }

      const preparation = prepareMcpRun(composerState.mcp_ids)
      const controller =
        preparation instanceof Promise ? await preparation : preparation
      if (!controller) return
      const recoverMcpConnection = mcpFailureRecovery(composerState.mcp_ids)
      const pendingAssistant: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        isPlaceholder: true,
        workTiming: startWorkTiming(crypto.randomUUID()),
        status: "streaming",
      }
      const interruptedWork = messagesRef.current.findLast(
        (message) => message.workTiming?.status === "awaiting-approval"
      )?.workTiming
      if (interruptedWork)
        pendingAssistant.workTiming = settleWorkTiming(
          interruptedWork,
          "running"
        )
      const resumeMessages = (current: ChatMessage[]) => [
        ...current.map((item) =>
          item.status === "awaiting-approval"
            ? {
                ...item,
                status: "complete" as const,
                ...(item.workTiming
                  ? { workTiming: settleWorkTiming(item.workTiming, "running") }
                  : {}),
                tools: item.tools?.map((tool) =>
                  tool.id in approvals
                    ? { ...tool, pendingApproval: false, hadApproval: true }
                    : tool
                ),
              }
            : item
        ),
        pendingAssistant,
      ]
      const streamStartMessages = resumeMessages(messagesRef.current)
      lastEventIdRef.current = null
      workCache.remember(activeId, streamStartMessages, true)
      setError(null)
      setMessages(resumeMessages)
      setStatus("streaming")
      setRunActive(true)
      setGenerating(activeId, true)

      const payload = {
        conversation_id: activeId,
        state: latestAgentState(messagesRef.current),
        messages: [],
        forwarded_props: resolveChatForwardedProps(composerState, {
          conversationId: activeId,
          deferred_approvals: approvalsForResume(
            messagesRef.current,
            approvals
          ),
        }),
      }

      generationRef.current = controller
      const showingRun = () =>
        isCurrentSource() &&
        mountedRef.current &&
        localIdRef.current === activeId &&
        abortRef.current === controller
      let streamedMessages = streamStartMessages
      try {
        const response = await streamCompletion(payload, controller.signal)
        if (!isCurrentSource()) return
        if (!response.body) {
          throw new Error(translateCurrent("common.streamingResponseWasEmpty"))
        }
        for await (const event of readMcpRunEvents(
          response.body,
          recoverMcpConnection,
          (id) => {
            lastEventIdRef.current = id
          }
        )) {
          if (!isCurrentSource()) return
          streamedMessages = applyAgUiEvent(streamedMessages, event)
          workCache.remember(activeId, streamedMessages)
          if (showingRun()) {
            setMessages((current) => applyAgUiEvent(current, event))
          }
        }
        if (!isCurrentSource()) return
        const settled = settleStreamingMessages(streamedMessages, "complete")
        workCache.remember(activeId, settled, true)
        if (showingRun()) {
          setMessages((current) => settleStreamingMessages(current, "complete"))
        }
        const shouldSync = shouldSyncConversationAfterRun(settled)
        const shouldAnnounce = shouldAnnounceConversationAfterRun(settled)
        const lastAssistant = [...settled]
          .reverse()
          .find((item) => item.role === "assistant")
        const preview = lastAssistant?.content ?? ""
        if (shouldAnnounce) {
          void notifyDesktop({ title: "FbaBuddy", body: preview })
          void markUnreadAfterAssistantReply(activeId)
        }
        if (shouldSync) {
          applyConversationSnapshot(
            activeId,
            setMessages,
            workCache,
            () =>
              isCurrentSource() &&
              mountedRef.current &&
              localIdRef.current === activeId,
            streamedMessages.findLast((message) => message.role === "assistant")
              ?.workTiming?.runId
          )
        }
      } catch (err) {
        if (!isCurrentSource() || controller.signal.aborted) {
          return
        }
        recoverMcpConnection()
        const message =
          err instanceof ApiError || err instanceof Error
            ? err.message
            : translateCurrent("common.generationFailed")
        if (showingRun()) {
          setError(message)
          setMessages((current) => {
            const settled = settleStreamingMessages(
              current,
              "error",
              Date.now(),
              message
            )
            workCache.remember(activeId, settled, true)
            return settled
          })
          applyConversationSnapshot(
            activeId,
            setMessages,
            workCache,
            () =>
              isCurrentSource() &&
              mountedRef.current &&
              localIdRef.current === activeId,
            streamedMessages.findLast((message) => message.role === "assistant")
              ?.workTiming?.runId
          )
        }
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null
        }
        setGenerating(activeId, false)
        if (isCurrentSource()) onSettled?.()
        if (isCurrentSource() && localIdRef.current === activeId) {
          setStatus("idle")
        }
        setRunActive(false)
      }
    },
    [
      isCurrentSource,
      mcpFailureRecovery,
      onSettled,
      prepareMcpRun,
      setGenerating,
      setRunActive,
      workCache,
    ]
  )

  const approveTool = useCallback(
    async (
      toolCallId: string,
      approved: boolean,
      always = false
    ): Promise<boolean> => {
      if (!isCurrentSource()) return false
      if (!ensureAuthenticatedSession() || !ensureConversationOnline())
        return false
      const pending = pendingApprovalTools(messagesRef.current)
      const chosen = pending.find((tool) => tool.id === toolCallId)
      if (!chosen) return false
      if (chosen?.approvalRequestId) {
        const id = localIdRef.current
        if (!id) return false
        try {
          await resolveCodingApproval(id, chosen.approvalRequestId, approved)
          if (isCurrentSource() && localIdRef.current === id) {
            setMessages((current) =>
              markToolsResolved(current, { [toolCallId]: approved })
            )
          }
          return true
        } catch (cause) {
          if (isCurrentSource())
            setError(cause instanceof Error ? cause.message : String(cause))
          return false
        }
      }
      const applied = applyApprovalChoice({
        draft: approvalDraftRef.current,
        pending,
        toolCallId,
        approved,
        always,
        allowedTools: useComposerStore.getState().alwaysAllowedTools ?? [],
      })
      if (always && approved) {
        const chosen = pending.find((tool) => tool.id === toolCallId)
        if (chosen?.name) {
          useComposerStore.getState().grantAlwaysAllowedTool(chosen.name)
        }
      }
      approvalDraftRef.current = applied.draft
      setMessages((current) => markToolsResolved(current, applied.draft))
      const remaining = pending.filter((tool) => !(tool.id in applied.draft))
      if (remaining.length > 0) {
        return true
      }
      approvalDraftRef.current = {}
      await continueWithApprovals(applied.draft)
      return true
    },
    [continueWithApprovals, isCurrentSource]
  )

  const autoApprovals = useMemo(
    () =>
      status === "idle"
        ? autoApprovalsFromAllowlist(
            pendingApprovalTools(messages),
            composer.alwaysAllowedTools
          )
        : {},
    [composer.alwaysAllowedTools, messages, status]
  )
  const visibleMessages = useMemo(
    () =>
      Object.keys(autoApprovals).length > 0
        ? markToolsResolved(messages, autoApprovals)
        : messages,
    [autoApprovals, messages]
  )

  useEffect(() => {
    if (!isCurrentSource() || Object.keys(autoApprovals).length === 0) {
      return
    }
    approvalDraftRef.current = {
      ...approvalDraftRef.current,
      ...autoApprovals,
    }
    const remaining = pendingApprovalTools(visibleMessages)
    if (remaining.length > 0 || autoApproveLockRef.current) {
      return
    }
    const next = approvalDraftRef.current
    approvalDraftRef.current = {}
    autoApproveLockRef.current = true
    void continueWithApprovals(next).finally(() => {
      autoApproveLockRef.current = false
    })
  }, [autoApprovals, continueWithApprovals, isCurrentSource, visibleMessages])

  const loadOlderMessages = useCallback(async () => {
    const id = localIdRef.current
    const cursor = historyCursorRef.current
    if (!isCurrentSource() || !id || !cursor || historyLock.current)
      return false
    historyLock.current = true
    setLoadingHistory(true)
    try {
      const page = await getConversationMessages(id, cursor)
      if (!isCurrentSource() || localIdRef.current !== id) return false
      const older = snapshotToChatMessages(
        page.messages_snapshot.messages ?? []
      )
      setMessages((current) => {
        const ids = new Set(current.map((item) => item.id))
        return [...older.filter((item) => !ids.has(item.id)), ...current]
      })
      historyCursorRef.current = page.has_more ? page.next_cursor : null
      setHistoryCursor(historyCursorRef.current)
      return true
    } finally {
      historyLock.current = false
      setLoadingHistory(false)
    }
  }, [isCurrentSource])

  return {
    messages: visibleMessages,
    loadedConversationId,
    status,
    error,
    connectionPhase,
    reconnectAttempt,
    retryConnection,
    send,
    stop,
    regenerate,
    approveTool,
    removeMessage,
    loadOlderMessages,
    hasOlderMessages: Boolean(historyCursor),
    loadingHistory,
  }
}
