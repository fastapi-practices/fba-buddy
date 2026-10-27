import { readAgUiRunEvents } from "@/api/stream"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useLocation } from "react-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  parseConversationMessageTarget,
  type ConversationSearchNavigation,
} from "@/app/conversation-message-location"
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { ChatRuntimeProvider } from "@/features/chat/chat-runtime"
import type { ChatSubmission } from "@/features/chat/thread-types"

import { Thread, type ThreadComponents } from "@/components/ai-elements/thread"
import { DelayedChatLoading } from "@/components/ai-elements/loading-state"
import { ConnectionState } from "@/components/ai-elements/connection-state"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { ChatWelcome } from "@/features/chat/chat-welcome"
import { ComposerDraftBridge } from "@/features/chat/composer-draft-bridge"
import { ChatComposerLayoutSlot } from "@/features/chat/chat-composer-layout"
import { ChatPaneSlotsContext } from "@/features/chat/chat-pane-slots"
import { handleComposerShortcutKeyDown } from "@/features/chat/composer-shortcuts"
import { RightSidebar } from "@/features/shell/right-sidebar"
import {
  useRightSidebar,
  type ChatPaneSide,
} from "@/features/shell/right-sidebar-store"
import { selectChatPane } from "@/features/shell/sidebar-chat-navigation"
import { WorkspaceGitPanel } from "@/features/chat/workspace-git-panel"
import { WorkspaceGitProvider } from "@/features/chat/workspace-git-provider"
import { useWorkspaceGitPanel } from "@/features/chat/use-workspace-git-panel"
import { ChatPaneHostContext } from "@/features/chat/chat-pane-host-context"
import type { WorktreeDraft } from "@/features/chat/worktree-draft"
import { ensureConversationOnline } from "@/features/chat/require-online"
import { useHistoryCacheStatusStore } from "@/lib/history-cache-status"
import {
  cancelComposerPolish,
  usePolishStore,
} from "@/features/chat/composer-polish"
import { useComposerStore } from "@/features/chat/composer-store"
import { useConversationFollowUps } from "@/features/chat/use-conversation-follow-ups"
import { toThreadMessages } from "@/features/chat/thread-message"
import { HistoryControls } from "@/features/chat/history-controls"
import { QueueComposerProvider } from "@/features/chat/queue-composer"
import { PlanActionsContext } from "@/features/chat/plan-actions"
import {
  forkConversation,
  getConversation,
  regenerateMessage,
} from "@/api/conversations"
import { resolveChatForwardedProps } from "@/features/chat/forwarded-props"
import {
  ConversationModeContext,
  conversationAgentMode,
  useConversationAgentMode,
} from "@/features/chat/conversation-mode"
import { buildChatSendPayload } from "@/features/chat/send-payload"
import { streamCompletion } from "@/api/chat"
import {
  snapshotToChatMessages,
  latestAgentState,
} from "@/features/chat/message-events"
import type { BranchMessage } from "@/components/ai-elements/message-branch"
import type { InputRequest, MessageVersion } from "@/api/chat-interactions"
import { queryKeys } from "@/api/query-keys"
import {
  conversationInputRequestsQueryOptions,
  conversationPlanQueryOptions,
} from "@/features/chat/conversation-auxiliary-queries"
import { ConversationAuxiliaryProvider } from "@/features/chat/conversation-auxiliary-context"
import { MessageVersionsContext } from "@/features/chat/message-versions"
import { useLiveConversationSearch } from "@/features/chat/live-conversation-search"
import {
  navigateTranscript,
  type TranscriptQuoteAnchor,
} from "@/features/chat/transcript-state"
import { toast } from "@/components/ui/toast"
import {
  composerEditRoute,
  composerSubmitAction,
  isEditableChatMessage,
  regenerateRoute,
  shouldShowHistoryLoading,
  useChat,
} from "@/features/chat/use-chat"
import { isPersistedMessagePk } from "@/features/chat/message-pk"
import { planBranch } from "@/features/chat/branch-plan"
import { useT } from "@/hooks/use-t"
import { ensureAuthenticatedSession } from "@/features/auth/require-session"
import {
  dataSourceKey,
  currentAccountSource,
  useAccountSourceStore,
} from "@/lib/account-source"
import type { DefaultModel, ProviderOption } from "@/lib/types"
import { cn } from "@/lib/utils"
import { useSelectionStore } from "@/features/shell/selection-store"
import {
  adoptModelCheckpoints,
  modelCheckpointKey,
} from "@/features/chat/model-checkpoints"

type ChatPaneProps = {
  paneKey?: string
  sidebarHostKey?: string
  sidebarPane?: ChatPaneSide
  sidebarChat?: ReactNode
  conversationId: string | null
  worktreeDraft?: WorktreeDraft | null
  projectId?: number | null
  onProjectChange?: (projectId: number | null) => void
  providers: ProviderOption[]
  defaultModel?: DefaultModel | null
  active?: boolean
  searchTarget?: ConversationSearchNavigation | null
  searchFromUrl?: boolean
  onConversationId: (conversationId: string) => void
  onSettled?: () => void
}

export function ChatPane(props: ChatPaneProps) {
  const mode = useConversationAgentMode(props.conversationId, props.paneKey)
  return (
    <ConversationModeContext value={mode}>
      <ChatPaneContent {...props} />
    </ConversationModeContext>
  )
}

function ChatPaneContent({
  paneKey: providedPaneKey,
  sidebarHostKey,
  sidebarPane = "left",
  sidebarChat,
  conversationId,
  worktreeDraft,
  projectId,
  onProjectChange,
  providers,
  defaultModel,
  active = true,
  searchTarget,
  searchFromUrl = true,
  onConversationId,
  onSettled,
}: ChatPaneProps) {
  const t = useT()
  const environmentPaneId = useId()
  const paneKey = providedPaneKey ?? worktreeDraft?.paneKey ?? environmentPaneId
  const offline = useHistoryCacheStatusStore((state) => state.offline)
  const searchSource = useAccountSourceStore(dataSourceKey)
  const hostKey = sidebarHostKey ?? paneKey
  const sidebar = useRightSidebar(hostKey)
  const focusedChatPane = useSelectionStore((state) => state.focusedChatPane)
  const gitPanelId = `right-sidebar-${encodeURIComponent(hostKey)}`
  const embeddedDiff =
    sidebarPane === "right" &&
    sidebar.activePanel === "diff" &&
    sidebar.diffPane === "right"
  const transcriptHidden =
    sidebarPane === "right" ? embeddedDiff : sidebar.open && sidebar.maximized
  const [paneDraftProject, setPaneDraftProject] = useState(() => ({
    source: searchSource,
    projectId: projectId ?? null,
  }))
  const draftProjectId = onProjectChange
    ? (projectId ?? null)
    : paneDraftProject.source === searchSource
      ? paneDraftProject.projectId
      : null
  const {
    workspaceConversationId,
    workspaceProjectId,
    workspaceBackend,
    open: gitPanelOpen,
  } = useWorkspaceGitPanel(
    hostKey,
    conversationId,
    worktreeDraft,
    sidebarPane,
    draftProjectId
  )
  const changeDraftProject = useCallback(
    (nextProjectId: number | null) => {
      if (onProjectChange) onProjectChange(nextProjectId)
      else
        setPaneDraftProject({
          source: searchSource,
          projectId: nextProjectId,
        })
    },
    [onProjectChange, searchSource]
  )
  const location = useLocation()
  const messageTarget = useMemo(
    () =>
      searchFromUrl
        ? parseConversationMessageTarget(location.search)
        : searchTarget?.conversationId === conversationId
          ? searchTarget.target
          : null,
    [searchFromUrl, location.search, searchTarget, conversationId]
  )
  const searchNavigationKey = searchFromUrl
    ? `${conversationId}:${location.key}`
    : `${searchTarget?.conversationId}:${searchTarget?.token}`
  const {
    messages,
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
    hasOlderMessages,
    loadingHistory,
  } = useChat({
    conversationId,
    draftKey: paneKey,
    draftConversationId: worktreeDraft?.conversationId,
    projectId: draftProjectId,
    workspaceBackend,
    onConversationId,
    onSettled,
  })
  const queryClient = useQueryClient()
  const conversationReady =
    Boolean(conversationId) && loadedConversationId === conversationId
  const planQuery = useQuery(
    conversationPlanQueryOptions(conversationId, conversationReady)
  )
  const inputRequestsQuery = useQuery(
    conversationInputRequestsQueryOptions(conversationId, conversationReady)
  )
  const pendingInputRequests = useMemo(
    () => inputRequestsQuery.data?.items ?? [],
    [inputRequestsQuery.data]
  )
  const removePendingInputRequest = useCallback(
    (requestId: string) => {
      queryClient.setQueryData<{ items: InputRequest[] }>(
        queryKeys.conversationInputRequests(conversationId ?? ""),
        (current) =>
          current
            ? {
                items: current.items.filter(
                  (item) => item.request_id !== requestId
                ),
              }
            : current
      )
    },
    [conversationId, queryClient]
  )
  const conversationAuxiliary = useMemo(
    () => ({
      plan: planQuery.data,
      pendingInputRequests,
      removePendingInputRequest,
    }),
    [planQuery.data, pendingInputRequests, removePendingInputRequest]
  )
  // 会话 id 落定后，把草稿期间记下的模型切换检查点并入这个会话
  useEffect(() => {
    if (!conversationId) return
    adoptModelCheckpoints(conversationId, modelCheckpointKey(null, paneKey))
  }, [conversationId, paneKey])
  const searchOwner = useRef(Symbol("chat-pane-search"))
  const previousSearchScope = useRef(`${searchSource}:${conversationId}`)
  useEffect(() => {
    const scope = `${searchSource}:${conversationId}`
    const changed = previousSearchScope.current !== scope
    previousSearchScope.current = scope
    const registry = useLiveConversationSearch.getState()
    if (changed || !conversationId || status === "loading")
      registry.remove(searchOwner.current)
    else
      registry.update(searchOwner.current, {
        source: searchSource,
        conversationId,
        messages,
      })
  }, [searchSource, conversationId, messages, status])
  useEffect(() => {
    const owner = searchOwner.current
    return () => useLiveConversationSearch.getState().remove(owner)
  }, [])
  const [pendingDeletePk, setPendingDeletePk] = useState<number | null>(null)
  const planActions = useMemo(
    () => ({
      execute: async (markdown: string, newConversation: boolean) => {
        if (status === "streaming") throw new Error(t("common.branchBusy"))
        await send(markdown, [], undefined, newConversation)
      },
    }),
    [send, status, t]
  )
  const transcriptRef = useRef<HTMLDivElement>(null)
  const branchLock = useRef(false)
  const visibleConversation = useRef(conversationId)
  useEffect(() => {
    visibleConversation.current = conversationId
  }, [conversationId])
  const [pendingQuote, setPendingQuote] =
    useState<TranscriptQuoteAnchor | null>(null)
  const [pendingBranch, setPendingBranch] = useState<{
    from: string | null
    target: MessageVersion
  } | null>(null)
  const loadedMessages = useRef(messages)
  useEffect(() => {
    loadedMessages.current = messages
  }, [messages])
  const completedSearchNavigation = useRef<string | null>(null)
  useEffect(() => {
    if (
      !messageTarget ||
      !conversationId ||
      status === "loading" ||
      completedSearchNavigation.current === searchNavigationKey
    )
      return
    let stale = false
    const rendered = () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      )
    const failed = () => {
      if (stale) return
      completedSearchNavigation.current = searchNavigationKey
      toast.add({ title: t("common.searchMessageUnavailable"), type: "error" })
    }
    void (async () => {
      await rendered()
      while (!stale) {
        const root =
          transcriptRef.current?.querySelector<HTMLElement>(".thread-root")
        const message = loadedMessages.current.find(
          (item) =>
            (messageTarget.messageId != null &&
              item.pk === messageTarget.messageId) ||
            (messageTarget.snapshotId != null &&
              item.id === messageTarget.snapshotId)
        )
        if (
          root &&
          message &&
          navigateTranscript(root, {
            messageId: message.id,
            text: messageTarget.query,
            occurrence: messageTarget.occurrence,
          })
        ) {
          completedSearchNavigation.current = searchNavigationKey
          transcriptRef.current?.focus({ preventScroll: true })
          return
        }
        if (!(await loadOlderMessages())) break
        await rendered()
      }
      failed()
    })().catch(failed)
    return () => {
      stale = true
    }
  }, [
    messageTarget,
    conversationId,
    searchNavigationKey,
    status,
    loadOlderMessages,
    t,
  ])
  const versionActions = useMemo(
    () => ({
      navigate: (target: MessageVersion) => {
        setPendingQuote(null)
        setPendingBranch(
          target.message_id == null ? null : { from: conversationId, target }
        )
        if (target.conversation_id !== conversationId)
          onConversationId(target.conversation_id)
      },
    }),
    [conversationId, onConversationId]
  )
  useEffect(() => {
    if (!pendingBranch || status === "loading") return
    const target = pendingBranch.target
    if (conversationId !== target.conversation_id) {
      if (conversationId !== pendingBranch.from)
        queueMicrotask(() =>
          setPendingBranch((current) =>
            current === pendingBranch ? null : current
          )
        )
      return
    }
    let stale = false
    void (async () => {
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      )
      while (!stale) {
        const root =
          transcriptRef.current?.querySelector<HTMLElement>(".thread-root")
        const message = loadedMessages.current.find(
          (item) => item.pk === target.message_id
        )
        if (
          root &&
          message &&
          navigateTranscript(root, { messageId: message.id })
        ) {
          setPendingBranch(null)
          return
        }
        if (!(await loadOlderMessages())) break
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        )
      }
      if (!stale) {
        setPendingBranch(null)
        toast.add({ title: t("common.branchNavigationFailed"), type: "error" })
      }
    })().catch(() => {
      if (!stale) {
        setPendingBranch(null)
        toast.add({ title: t("common.branchNavigationFailed"), type: "error" })
      }
    })
    return () => {
      stale = true
    }
  }, [pendingBranch, conversationId, status, loadOlderMessages, t])
  const navigateQuote = useCallback(
    (anchor: TranscriptQuoteAnchor) => {
      setPendingBranch(null)
      setPendingQuote(anchor)
      if (anchor.conversationId && anchor.conversationId !== conversationId)
        onConversationId(anchor.conversationId)
    },
    [conversationId, onConversationId]
  )
  useEffect(() => {
    if (
      !pendingQuote ||
      status === "loading" ||
      (pendingQuote.conversationId &&
        pendingQuote.conversationId !== conversationId)
    )
      return
    let stale = false
    void (async () => {
      while (!stale) {
        const root =
          transcriptRef.current?.querySelector<HTMLElement>(".thread-root")
        if (root && navigateTranscript(root, pendingQuote)) {
          setPendingQuote(null)
          return
        }
        if (!(await loadOlderMessages())) break
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        )
      }
      if (!stale) {
        setPendingQuote(null)
        toast.add({ title: t("common.quoteNavigationFailed"), type: "error" })
      }
    })().catch(() => {
      if (!stale) {
        setPendingQuote(null)
        toast.add({ title: t("common.quoteNavigationFailed"), type: "error" })
      }
    })
    return () => {
      stale = true
    }
  }, [pendingQuote, conversationId, status, loadOlderMessages, t])
  const branchMessage = useCallback<BranchMessage>(
    async (pk, options) => {
      if (!ensureConversationOnline()) return
      if (options?.regenerate && !ensureAuthenticatedSession()) return
      if (!conversationId || branchLock.current || status === "streaming")
        throw new Error(t("common.branchBusy"))
      branchLock.current = true
      try {
        const plan = planBranch(messages, pk, {
          regenerate: options?.regenerate,
        })
        if (!plan) {
          throw new Error(t("common.branchNavigationFailed"))
        }
        const { source, boundaryPk } = plan
        // 重生成时要在新分支里重跑的那条提问，历史回复会落到它前面那条提问上
        const user = plan.user ?? source
        const turn = user
        if (options?.content !== undefined && !isEditableChatMessage(source)) {
          throw new Error(t("common.historicalEditUnavailable"))
        }
        const resend =
          options?.regenerate &&
          (conversationAgentMode(conversationId) === "coding" ||
            turn.turnContext?.agent_mode === "coding" ||
            source.turnContext?.agent_mode === "coding")
        const newId = await forkConversation(
          conversationId,
          boundaryPk,
          !resend
        )
        if (workspaceBackend === "local" && window.buddyDesktop?.workspace)
          await window.buddyDesktop.workspace({
            source: currentAccountSource() ?? undefined,
            action: "fork-profile",
            conversationId,
            targetConversationId: newId,
          })
        if (options?.regenerate) {
          const detail = await getConversation(newId)
          const history = snapshotToChatMessages(
            detail.messages_snapshot?.messages ?? []
          )
          const lastUser = [...history]
            .reverse()
            .find((item) => item.role === "user")
          const regenerateUser = lastUser ?? user
          const resendUser = user ?? lastUser
          const regeneratePk = lastUser?.pk
          if (
            (!resend && !regenerateUser) ||
            (resend && !resendUser) ||
            (!resend && !isPersistedMessagePk(regeneratePk))
          )
            throw new Error(t("common.quoteNavigationFailed"))
          const response = resend
            ? await streamCompletion(
                buildChatSendPayload({
                  conversationId: newId,
                  state: latestAgentState(history),
                  messageId: crypto.randomUUID(),
                  text: options.content ?? resendUser!.content,
                  attachments: resendUser!.attachments ?? [],
                  composer: useComposerStore.getState(),
                  assistantId: detail.assistant_id,
                  quote: resendUser!.turnContext?.quote ?? undefined,
                })
              )
            : await regenerateMessage(newId, regeneratePk!, {
                state: latestAgentState(history),
                forwarded_props: resolveChatForwardedProps(
                  useComposerStore.getState(),
                  { conversationId: newId }
                ),
                ...(options.content !== undefined
                  ? { content: options.content }
                  : {}),
              })
          if (visibleConversation.current === conversationId)
            onConversationId(newId)
          if (response.body)
            void (async () => {
              for await (const _event of readAgUiRunEvents(response.body!)) {
                /* 后端保存结果，目标会话订阅实时事件 */ void _event
              }
              onSettled?.()
            })().catch(() => onSettled?.())
        } else if (visibleConversation.current === conversationId)
          onConversationId(newId)
        onSettled?.()
      } finally {
        branchLock.current = false
      }
    },
    [
      conversationId,
      messages,
      status,
      workspaceBackend,
      onConversationId,
      onSettled,
      t,
    ]
  )

  useEffect(() => () => cancelComposerPolish(), [active, conversationId])

  // 只有本栏换掉正在编辑的那条会话才取消编辑，分屏另一栏的编辑会话不受影响
  const previousConversationIdRef = useRef(conversationId)
  useEffect(() => {
    const previous = previousConversationIdRef.current
    previousConversationIdRef.current = conversationId
    if (previous === conversationId) {
      return
    }
    const state = useComposerStore.getState()
    if (state.editingMessageId && state.editingConversationId === previous) {
      state.clearInput()
    }
  }, [conversationId])

  const onNew = useCallback(
    async (message: ChatSubmission) => {
      if (usePolishStore.getState().pending) return
      const text = message.text
      const attachments = message.attachments
      const action = composerSubmitAction(
        useComposerStore.getState().editingMessageId,
        messages,
        text
      )
      if (action.type === "edit") {
        const editingId = useComposerStore.getState().editingMessageId
        const editingConversationId =
          useComposerStore.getState().editingConversationId
        const source = messages.find((item) => item.pk === action.pk)
        const coding =
          conversationAgentMode(conversationId) === "coding" ||
          source?.turnContext?.agent_mode === "coding"
        if (
          composerEditRoute(messages, action.pk, action.text, { coding }) ===
          "in-place"
        ) {
          await regenerate(action.pk, action.text)
        } else {
          await branchMessage(action.pk, {
            regenerate: true,
            content: action.text,
          })
        }
        const current = useComposerStore.getState()
        if (
          current.editingMessageId === editingId &&
          current.editingConversationId === editingConversationId
        )
          current.clearInput()
        return
      }
      await send(text, attachments, message.quote)
    },
    [messages, branchMessage, conversationId, regenerate, send]
  )

  const { queue, failures, saveQueuedMessage } = useConversationFollowUps({
    conversationId,
    running: status === "streaming",
    ready: conversationReady,
    messages,
    onNew,
  })

  const onCancel = useCallback(async () => {
    await stop()
  }, [stop])

  const onReload = useCallback(
    async (parentId: string | null) => {
      if (!parentId) {
        return
      }
      // 重新生成始终针对被点击的那条回复，而不是对话里的最后一条
      const target = messages.find((item) => item.id === parentId)
      if (target?.role !== "assistant" || !isPersistedMessagePk(target.pk)) {
        return
      }
      // 后端重生成只接受最后一条用户消息：
      // 当前回合的最新回复原地重生成，历史回复先分叉出新分支再重生成
      const coding =
        conversationAgentMode(conversationId) === "coding" ||
        target.turnContext?.agent_mode === "coding"
      if (!coding && regenerateRoute(messages, parentId) === "in-place") {
        await regenerate(target.pk)
        return
      }
      await branchMessage(target.pk, { regenerate: true })
    },
    [messages, branchMessage, conversationId, regenerate]
  )

  const onResumeToolCall = useCallback(
    ({ toolCallId, payload }: { toolCallId: string; payload: unknown }) => {
      const body =
        payload && typeof payload === "object"
          ? (payload as {
              approved?: unknown
              always?: unknown
            })
          : null
      void approveTool(
        toolCallId,
        Boolean(body?.approved),
        Boolean(body?.always)
      )
    },
    [approveTool]
  )

  const historyLoading = shouldShowHistoryLoading(conversationId, status)
  const threadMessages = useMemo(() => toThreadMessages(messages), [messages])

  const paneSlots = useMemo(
    () => ({
      paneKey,
      providers,
      defaultModel,
      conversationId,
      projectId: draftProjectId,
      worktreeDraft,
      onProjectChange: changeDraftProject,
      projectDisabled:
        offline ||
        status === "streaming" ||
        status === "loading" ||
        Boolean(conversationId),
    }),
    [
      paneKey,
      defaultModel,
      providers,
      conversationId,
      draftProjectId,
      changeDraftProject,
      worktreeDraft,
      status,
      offline,
    ]
  )
  const threadComponents = useMemo<ThreadComponents>(
    () => ({
      Welcome: ChatWelcome,
      ComposerLayout: ChatComposerLayoutSlot,
      conversationId,
      workspaceBackend,
      onComposerKeyDown: handleComposerShortcutKeyDown,
      onDeleteMessage: setPendingDeletePk,
      onQueueEdit: saveQueuedMessage,
      onBranchMessage: branchMessage,
      onNavigateQuote: navigateQuote,
      onApproveTool: approveTool,
      visible: !transcriptHidden,
    }),
    [
      transcriptHidden,
      conversationId,
      workspaceBackend,
      saveQueuedMessage,
      branchMessage,
      navigateQuote,
      approveTool,
    ]
  )

  return (
    <WorkspaceGitProvider
      conversationId={workspaceConversationId}
      projectId={conversationId ? undefined : workspaceProjectId}
      backend={workspaceBackend}
      chatRunning={status === "streaming"}
      panelOpen={gitPanelOpen}
    >
      <ChatPaneSlotsContext.Provider value={paneSlots}>
        <ConversationAuxiliaryProvider value={conversationAuxiliary}>
          <ChatRuntimeProvider
            messages={threadMessages}
            rawMessages={messages}
            running={status === "streaming"}
            loading={historyLoading}
            disabled={offline}
            queue={queue}
            onSend={onNew}
            onStop={onCancel}
            onReload={onReload}
            onResumeToolCall={onResumeToolCall}
          >
            <QueueComposerProvider
              key={conversationId ?? "draft"}
              onEdit={saveQueuedMessage}
            >
              <PlanActionsContext value={planActions}>
                {active ? <ComposerDraftBridge /> : null}
                <div
                  data-slot="chat-workspace-layout"
                  className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden"
                >
                  <div
                    ref={transcriptRef}
                    data-slot="chat-transcript"
                    tabIndex={-1}
                    className={cn(
                      "chat-transcript relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
                      transcriptHidden &&
                        (sidebarPane === "right"
                          ? "hidden"
                          : "pointer-events-none invisible")
                    )}
                    data-chat-pane-active={
                      sidebar.open &&
                      sidebar.activePanel === "chat" &&
                      focusedChatPane === sidebarPane
                        ? "true"
                        : undefined
                    }
                    aria-hidden={transcriptHidden}
                    inert={transcriptHidden ? true : undefined}
                    onPointerDown={() => selectChatPane(sidebarPane)}
                    onFocusCapture={() => selectChatPane(sidebarPane)}
                  >
                    {historyLoading ? (
                      <div className="absolute inset-0 z-10 flex items-center justify-center bg-background">
                        <DelayedChatLoading label={t("common.loading")} />
                      </div>
                    ) : null}
                    {connectionPhase !== "online" ? (
                      <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center px-4">
                        <ConnectionState
                          key={`${searchSource}:${conversationId ?? "draft"}`}
                          phase={connectionPhase}
                          title={error ?? undefined}
                          attempt={reconnectAttempt || undefined}
                          onRetry={retryConnection}
                          aria-label={t("common.connectionLost")}
                          className="pointer-events-auto"
                        />
                      </div>
                    ) : null}
                    {failures.length > 0 ? (
                      <div className="mx-auto w-full max-w-176 shrink-0 px-4 pt-2">
                        <Alert
                          variant="destructive"
                          data-slot="follow-up-failures"
                        >
                          <AlertDescription>
                            {failures.map((item) => (
                              <p key={item.id}>
                                {item.content} —{" "}
                                {item.reason || t("common.generationFailed")}
                              </p>
                            ))}
                          </AlertDescription>
                        </Alert>
                      </div>
                    ) : null}
                    <MessageVersionsContext value={versionActions}>
                      <>
                        {conversationId && !historyLoading && (
                          <HistoryControls
                            key={`history-${conversationId}`}
                            hasOlder={hasOlderMessages}
                            loading={loadingHistory}
                            loadOlder={loadOlderMessages}
                          />
                        )}
                        <ChatPaneHostContext
                          value={{ hostKey, pane: sidebarPane }}
                        >
                          <Thread
                            key={`thread-${conversationId ?? "draft"}`}
                            components={threadComponents}
                            autoFocus={active}
                          />
                        </ChatPaneHostContext>
                      </>
                    </MessageVersionsContext>
                  </div>
                  {sidebarPane === "left" ? (
                    <RightSidebar
                      active={active}
                      hostKey={hostKey}
                      id={gitPanelId}
                      chat={sidebarChat}
                    />
                  ) : embeddedDiff ? (
                    <WorkspaceGitPanel />
                  ) : null}
                </div>
                <MessageDeleteDialog
                  open={pendingDeletePk != null}
                  onOpenChange={(open) => {
                    if (!open) {
                      setPendingDeletePk(null)
                    }
                  }}
                  onConfirm={() => {
                    if (pendingDeletePk != null) {
                      void removeMessage(pendingDeletePk)
                    }
                    setPendingDeletePk(null)
                  }}
                />
              </PlanActionsContext>
            </QueueComposerProvider>
          </ChatRuntimeProvider>
        </ConversationAuxiliaryProvider>
      </ChatPaneSlotsContext.Provider>
    </WorkspaceGitProvider>
  )
}

function MessageDeleteDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  const t = useT()
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("common.deleteMessage")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("common.thisMessageCannotBeRestoredAfterDeletion")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            {t("common.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
