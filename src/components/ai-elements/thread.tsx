"use client"

import { useAgentMode } from "@/features/chat/conversation-mode"
import { MessageSources } from "@/features/chat/message-sources"
import { artifactCardsFromMessages } from "@/features/chat/artifact-cards"

import { ComposerAttachments, UserMessageAttachments } from "./attachment"
import { ConversationMapAui } from "./conversation-map-runtime"
import { AssistantFileChanges, ComposerFileChanges } from "./file-changes"
import { WorkspaceActionsContext } from "@/features/chat/workspace-actions"
import type { WorkspaceBackend } from "@/shared/workspace"
import {
  MessageVersionsButton,
  MessageBranchButton,
  MessageActionsProvider,
  MessageRollbackButton,
  type BranchMessage,
  type RollbackMessage,
} from "./message-branch"
import type { TranscriptQuoteAnchor } from "@/features/chat/transcript-state"
import { ComposerSlash } from "@/features/chat/composer-slash"
import { ComposerPolishButton } from "@/features/chat/composer-polish-button"
import { QueueComposerBanner } from "@/features/chat/queue-composer"
import { useQueueComposer } from "@/features/chat/queue-composer-context"
import { useComposerHistory } from "@/features/chat/use-composer-history"
import { MessageMetadata } from "./message-metadata"
import { QuotaRecovery } from "./quota-recovery"
import { isPersistentToolResult } from "@/features/chat/rich-events"
import { replyActionsVisible } from "@/features/chat/transcript-render"
import { usePolishStore } from "@/features/chat/composer-polish"
import { ensureAuthenticatedSession } from "@/features/auth/require-session"
import { ensureConversationOnline } from "@/features/chat/require-online"
import {
  eventMatchesCombo,
  resolveShortcut,
} from "@/features/shell/keyboard-shortcuts"
import { useShortcutStore } from "@/features/shell/shortcut-store"
import { File } from "@/components/ai-elements/file"
import { Image } from "@/components/ai-elements/image"
import { MarkdownText } from "@/components/ai-elements/markdown-text"
import { ComposerQueue, type SaveQueuedMessage } from "./composer-queue"
import {
  TranscriptScopeProvider,
  TranscriptMessages,
  TurnContentContext,
  useTranscriptFind,
} from "./transcript"
import { useTranscriptScope } from "./transcript-scope"
import { MessageTiming } from "@/components/ai-elements/message-timing"
import { SkillDirectiveText } from "@/features/chat/skill-directive"
import { DirectiveTextChip } from "./directive-text"
import { parseDirectiveText } from "@/features/chat/directive-formatter"
import {
  DIRECTIVE_FALLBACK_ICON,
  DIRECTIVE_ICONS,
} from "@/features/chat/directive-icons"
import {
  ComposerQuotePreview,
  QuoteBlock,
  SelectionToolbar,
} from "@/components/ai-elements/quote"
import {
  Reasoning,
  AssistantReasoningGroup,
} from "@/components/ai-elements/reasoning"
import {
  AssistantToolCall,
  AssistantToolGroup,
} from "@/components/ai-elements/tool-render"
import { MessageError } from "@/components/ai-elements/message-error"
import { TurnArtifacts } from "@/components/ai-elements/turn-artifacts"
import { TooltipIconButton } from "@/components/ai-elements/tooltip-icon-button"
import { ComposerEditBanner } from "@/features/chat/composer-edit-banner"
import { useComposerStore } from "@/features/chat/composer-store"
import {
  ChatPartProvider,
  useChatMessage,
  useChatMessageState,
  useChatRuntime,
  useChatRuntimeState,
} from "@/features/chat/chat-runtime"
import {
  canRegenerateReply,
  editableUserMessage,
} from "@/features/chat/use-chat"
import type {
  FileMessagePart,
  ImageMessagePart,
  TextMessagePart,
  ThreadMessage,
  ThreadMessagePart,
  ToolCallMessagePart,
} from "@/features/chat/thread-types"
import { Button } from "@/components/ui/button"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Marker, MarkerContent } from "@/components/ui/marker"
import { Message, MessageContent, MessageFooter } from "@/components/ui/message"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerProvider,
  MessageScrollerViewport,
  MessageScrollerItem,
  useMessageScroller,
} from "@/components/ui/message-scroller"
import { Textarea } from "@/components/ui/textarea"
import { useT } from "@/hooks/use-t"
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard"
import { cn } from "@/lib/utils"
import { TooltipHint } from "@/components/ui/tooltip"
import { MessageInputRequests, PendingInputRequests } from "./input-requests"
import {
  ToolApprovalResponderContext,
  toolNeedsApproval,
  type ApproveTool,
} from "./tool-approval-state"
import { collectPendingToolApprovals } from "@/features/chat/pending-tool-approvals"
import { isDeclinedToolApproval } from "@/features/chat/tool-approvals"
import { LifecycleEvents } from "./lifecycle-events"
import {
  ArrowUpIcon,
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  PencilIcon,
  RefreshCwIcon,
  SquareIcon,
  Trash2Icon,
} from "lucide-react"
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useMemo,
  useState,
  type ComponentType,
  type FC,
  type KeyboardEvent,
  type ReactNode,
} from "react"

export type ThreadComponents = {
  onRollbackMessage?: RollbackMessage
  onBranchMessage?: BranchMessage
  onNavigateQuote?: (anchor: TranscriptQuoteAnchor) => void | Promise<void>
  AssistantMessage?: ComponentType | undefined
  Welcome?: ComponentType | undefined
  ComposerLayout?: ComponentType<ComposerLayoutProps> | undefined
  showComposer?: boolean | undefined
  conversationId?: string | null | undefined
  workspaceBackend?: WorkspaceBackend | null | undefined
  composerPlaceholder?: string | undefined
  onComposerKeyDown?:
    ((event: KeyboardEvent<HTMLTextAreaElement>) => void) | undefined
  onDeleteMessage?: ((pk: number) => void) | undefined
  onQueueEdit?: SaveQueuedMessage | undefined
  onApproveTool?: ApproveTool | undefined
  ToolFallback?: ComponentType<ToolCallMessagePart> | undefined
  TranscriptLeading?: ReactNode
  TranscriptTrailing?: ReactNode
  showActions?: boolean | undefined
  visible?: boolean | undefined
}

export type ComposerLayoutProps = {
  input: ReactNode
  actions: ReactNode
}

export type ThreadProps = {
  components?: ThreadComponents | undefined
  autoFocus?: boolean | undefined
}

const EMPTY_COMPONENTS: ThreadComponents = {}

const ThreadComponentsContext =
  createContext<ThreadComponents>(EMPTY_COMPONENTS)

export const Thread: FC<ThreadProps> = ({
  components = EMPTY_COMPONENTS,
  autoFocus = true,
}) => {
  const workspaceActions = useMemo(
    () => ({
      conversationId: components.conversationId ?? null,
      backend: components.workspaceBackend ?? null,
    }),
    [components.conversationId, components.workspaceBackend]
  )
  return (
    <ThreadComponentsContext.Provider value={components}>
      <WorkspaceActionsContext value={workspaceActions}>
        <MessageActionsProvider
          key={components.conversationId ?? "new"}
          branch={components.onBranchMessage}
          rollback={components.onRollbackMessage}
        >
          <TranscriptScopeProvider
            conversationId={components.conversationId}
            onNavigateQuote={components.onNavigateQuote}
          >
            <ToolApprovalResponderContext value={components.onApproveTool}>
              <ThreadRoot autoFocus={autoFocus} />
            </ToolApprovalResponderContext>
          </TranscriptScopeProvider>
        </MessageActionsProvider>
      </WorkspaceActionsContext>
    </ThreadComponentsContext.Provider>
  )
}

const ThreadRoot: FC<{ autoFocus: boolean }> = ({ autoFocus }) => {
  const t = useT()
  const runtime = useChatRuntime()
  const {
    Welcome = ThreadWelcome,
    showComposer = true,
    visible = true,
  } = useContext(ThreadComponentsContext)
  const rootRef = useRef<HTMLDivElement>(null)
  const [domHidden, setDomHidden] = useState(false)
  useEffect(() => {
    const containers: HTMLElement[] = []
    let container = rootRef.current?.parentElement ?? null
    while (container) {
      if (container.hasAttribute("aria-hidden")) containers.push(container)
      container = container.parentElement
    }
    if (!containers.length) return
    const update = () =>
      setDomHidden(
        containers.some(
          (element) => element.getAttribute("aria-hidden") === "true"
        )
      )
    update()
    const observer = new MutationObserver(update)
    for (const element of containers)
      observer.observe(element, {
        attributes: true,
        attributeFilter: ["aria-hidden"],
      })
    return () => observer.disconnect()
  }, [])
  const shown = visible && !domHidden
  const isEmpty = runtime.thread.messages.length === 0
  const signature = messageSignature(runtime.thread.messages)
  const { seeking } = useTranscriptScope()

  return (
    <div
      ref={rootRef}
      className="app-content-surface thread-root @container relative flex min-h-0 flex-1 flex-col overflow-hidden"
      style={{
        ["--thread-max-width" as string]: "44rem",
        ["--composer-bg" as string]: "var(--composer-surface)",
        ["--composer-radius" as string]: "1.5rem",
        ["--composer-padding" as string]: "8px",
      }}
    >
      <MessageScrollerProvider
        autoScroll={!seeking}
        defaultScrollPosition="end"
      >
        <ThreadScroller
          autoFocus={autoFocus}
          isEmpty={isEmpty}
          showComposer={showComposer}
          signature={signature}
          shown={shown}
          Welcome={Welcome}
        />
        {!isEmpty && showComposer ? (
          <div className="app-content-surface thread-viewport-footer relative z-20 mx-auto w-full max-w-(--thread-max-width) shrink-0 px-4 pb-2">
            <Composer autoFocus={autoFocus} />
            <p className="mt-1.5 text-center text-xs text-muted-foreground">
              {t("common.aiGeneratedContentPleaseVerifyImportantInformation")}
            </p>
          </div>
        ) : null}
        <SelectionToolbar />
      </MessageScrollerProvider>
    </div>
  )
}

const ThreadScroller: FC<{
  autoFocus: boolean
  isEmpty: boolean
  showComposer: boolean
  signature: string
  shown: boolean
  Welcome: ComponentType
}> = ({ autoFocus, isEmpty, showComposer, signature, shown, Welcome }) => {
  const t = useT()
  const runtime = useChatRuntime()
  const { TranscriptLeading, TranscriptTrailing } = useContext(
    ThreadComponentsContext
  )
  const { scrollToEnd } = useMessageScroller()
  const lastShownSignature = useRef(signature)
  const wasShown = useRef(shown)
  const initialPositionApplied = useRef(false)
  useLayoutEffect(() => {
    if (isEmpty) {
      /* 切换会话时旧消息会先挂载一轮，清空后必须重新允许定位到底部 */
      initialPositionApplied.current = false
      return
    }
    if (initialPositionApplied.current) return
    let frame = 0
    let attempts = 0
    const settle = () => {
      frame = requestAnimationFrame(() => {
        if (scrollToEnd({ behavior: "auto" }) || attempts++ >= 8) {
          initialPositionApplied.current = true
          return
        }
        settle()
      })
    }
    settle()
    return () => cancelAnimationFrame(frame)
  }, [isEmpty, scrollToEnd])
  useEffect(() => {
    const entered = !wasShown.current && shown
    const left = wasShown.current && !shown
    wasShown.current = shown
    if (left) lastShownSignature.current = signature
    if (!entered || lastShownSignature.current === signature) return

    const frame = requestAnimationFrame(() => {
      scrollToEnd({ behavior: "auto" })
    })
    return () => cancelAnimationFrame(frame)
  }, [scrollToEnd, signature, shown])

  return (
    <MessageScroller className="min-h-0 min-w-0 flex-1">
      <MessageScrollerViewport
        ref={runtime.viewport.bind}
        data-slot="thread-viewport"
        style={{ overflowX: "hidden" }}
      >
        {isEmpty ? (
          <MessageScrollerContent className="h-full min-h-full gap-0">
            <MessageScrollerItem
              messageId="thread-empty"
              className="flex min-h-full w-full flex-col justify-center [content-visibility:visible]"
            >
              <div className="mx-auto flex w-full max-w-(--thread-max-width) flex-col justify-center px-4 py-4">
                <Welcome />
                {showComposer ? (
                  <div className="mt-6">
                    <Composer autoFocus={autoFocus} />
                  </div>
                ) : null}
              </div>
            </MessageScrollerItem>
          </MessageScrollerContent>
        ) : (
          <TranscriptMessages
            Message={ThreadMessageView}
            WorkMessage={WorkMessage}
            PersistentMessage={PersistentMessage}
            NoticeMessage={TurnNoticeMessage}
            busy={runtime.thread.isRunning}
            leading={TranscriptLeading}
            trailing={TranscriptTrailing}
          />
        )}
      </MessageScrollerViewport>
      {!isEmpty ? <ConversationMapAui /> : null}
      {!isEmpty ? (
        <TooltipHint label={t("common.scrollToBottom")} side="top">
          <MessageScrollerButton
            direction="end"
            busy={runtime.thread.isRunning}
            aria-label={t("common.scrollToBottom")}
          />
        </TooltipHint>
      ) : null}
    </MessageScroller>
  )
}

const ThreadMessageView: FC = () => {
  const { AssistantMessage: AssistantMessageComponent = AssistantMessage } =
    useContext(ThreadComponentsContext)
  const message = useChatMessage()
  if (message.role === "user") return <UserMessage />
  return <AssistantMessageComponent />
}

function messageSignature(messages: readonly ThreadMessage[]) {
  const last = messages.at(-1)
  if (!last) return "0"
  const length = last.content.reduce(
    (total, part) =>
      total + (part.type === "text" ? (part.text?.length ?? 0) : 0),
    0
  )
  return `${messages.length}:${last.id}:${length}`
}

const ThreadWelcome: FC = () => (
  <div className="thread-welcome-root mb-6 flex flex-col items-center px-4 text-center">
    <h1 className="thread-welcome-message-inner animate-in text-2xl font-medium tracking-tight duration-200 fill-mode-both fade-in slide-in-from-bottom-1">
      How can I help you today?
    </h1>
  </div>
)

const Composer: FC<{ autoFocus: boolean }> = ({ autoFocus }) => {
  const t = useT()
  const runtime = useChatRuntime()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (!autoFocus) return
    const focused = document.activeElement
    if (
      focused?.closest(
        '[data-slot="composer-context-header"], [role="menu"], [role="dialog"], [data-slot="popover-content"]'
      ) ||
      (focused instanceof HTMLTextAreaElement && focused !== inputRef.current)
    )
      return
    inputRef.current?.focus({ preventScroll: true })
  }, [autoFocus])
  const queueEdit = useQueueComposer()
  const mode = useAgentMode()
  const {
    ComposerLayout = DefaultComposerLayout,
    composerPlaceholder,
    conversationId,
    onComposerKeyDown,
  } = useContext(ThreadComponentsContext)
  const messages = runtime.thread.messages
  const pendingApproval = useMemo(
    () => collectPendingToolApprovals(messages)[0],
    [messages]
  )
  const historyKeyDown = useComposerHistory(conversationId)

  const send = () => {
    if (usePolishStore.getState().pending) return
    if (!ensureAuthenticatedSession() || !ensureConversationOnline()) return
    void runtime.actions.send()
  }

  return (
    <div
      className="composer-root relative flex w-full flex-col"
      onKeyDownCapture={(event) => {
        if (!(event.target instanceof HTMLTextAreaElement)) return
        queueEdit?.onKeyDown(event)
        if (!queueEdit?.editing) historyKeyDown(event)
        onComposerKeyDown?.(
          event as unknown as KeyboardEvent<HTMLTextAreaElement>
        )
        if (event.defaultPrevented) {
          event.stopPropagation()
          return
        }
        const sendCombo = resolveShortcut(
          "send-message",
          useShortcutStore.getState().overrides
        )
        const isPlainEnter =
          event.key === "Enter" &&
          !event.shiftKey &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey
        const isSendKey = sendCombo
          ? eventMatchesCombo(event, sendCombo)
          : isPlainEnter
        if (!isSendKey || event.nativeEvent.isComposing) return
        if (queueEdit?.editing) {
          event.preventDefault()
          event.stopPropagation()
          if (!ensureConversationOnline()) return
          void queueEdit.save()
          return
        }
        if (usePolishStore.getState().pending) {
          event.preventDefault()
          event.stopPropagation()
          return
        }
        event.preventDefault()
        event.stopPropagation()
        send()
      }}
    >
      {pendingApproval ? null : <PendingInputRequests />}
      <QuotaRecovery />
      <ComposerFileChanges />
      <ComposerQuotePreview />
      <ComposerQueueList />
      <ComposerLayout
        input={
          <>
            <ComposerEditBanner conversationId={conversationId ?? null} />
            <QueueComposerBanner />
            <ComposerAttachments />
            <ComposerSlash />
            <div className="composer-lexical-input composer-directive-input min-h-10 w-full">
              <ComposerDirectiveOverlay text={runtime.composer.text} />
              <Textarea
                ref={inputRef}
                value={runtime.composer.text}
                onChange={(event) =>
                  runtime.composer.setText(event.target.value)
                }
                placeholder={
                  composerPlaceholder ??
                  t(
                    mode === "chat"
                      ? "common.chatPlaceholder"
                      : mode === "work"
                        ? "common.workPlaceholder"
                        : "common.whatCanIHelpYouWithToday"
                  )
                }
                rows={1}
                className={cn(
                  "composer-input composer-lexical-editor relative min-h-10 w-full resize-none overflow-x-hidden overflow-y-auto border-0 bg-transparent px-0 py-1 text-base leading-6 caret-primary shadow-none outline-none focus-visible:ring-0 dark:bg-transparent",
                  parseDirectiveText(runtime.composer.text).some(
                    (segment) => segment.kind === "mention"
                  ) && "text-transparent"
                )}
                aria-label={t("common.messageInput")}
              />
            </div>
          </>
        }
        actions={<ComposerAction />}
      />
    </div>
  )
}

const DefaultComposerLayout: FC<ComposerLayoutProps> = ({ input, actions }) => (
  <div className="chat-composer-surface relative flex w-full flex-col gap-2 p-2">
    {input}
    <div className="flex justify-end">{actions}</div>
  </div>
)

function ComposerDirectiveOverlay({ text }: { text: string }) {
  const segments = parseDirectiveText(text)
  if (!segments.some((segment) => segment.kind === "mention")) return null
  return (
    <div
      aria-hidden
      className="composer-directive-overlay pointer-events-none absolute overflow-hidden whitespace-pre-wrap text-base leading-6 wrap-break-word"
    >
      {segments.map((segment, index) =>
        segment.kind === "text" ? (
          <span key={index}>{segment.text}</span>
        ) : (
          <DirectiveTextChip
            key={`${segment.type}:${segment.id}:${segment.label}`}
            type={segment.type}
            id={segment.id}
            label={segment.label}
            iconMap={DIRECTIVE_ICONS}
            fallbackIcon={DIRECTIVE_FALLBACK_ICON}
          />
        )
      )}
    </div>
  )
}

const ComposerQueueList: FC = () => {
  const { onQueueEdit } = useContext(ThreadComponentsContext)
  return <ComposerQueue onEdit={onQueueEdit} />
}

const ComposerAction: FC = () => {
  const t = useT()
  const runtime = useChatRuntime()
  const queueEdit = useQueueComposer()
  const polishing = usePolishStore((state) => state.pending)
  return (
    <div className="composer-action-wrapper relative flex shrink-0 items-center gap-1.5">
      <ComposerPolishButton />
      <TooltipIconButton
        tooltip={t("common.sendMessage")}
        side="top"
        type="button"
        variant="default"
        size="icon"
        disabled={
          Boolean(queueEdit?.editing) || polishing || runtime.thread.isDisabled
        }
        className="composer-send size-7 rounded-full"
        aria-label={t("common.sendMessage")}
        onClick={() => {
          if (!ensureAuthenticatedSession() || !ensureConversationOnline())
            return
          void runtime.actions.send()
        }}
      >
        <ArrowUpIcon className="composer-send-icon size-4" />
      </TooltipIconButton>
      {runtime.thread.isRunning ? (
        <Button
          type="button"
          variant="default"
          size="icon"
          className="composer-cancel size-7 rounded-full"
          aria-label={t("common.stopGenerating")}
          onClick={() => void runtime.actions.stop()}
        >
          <SquareIcon className="composer-cancel-icon size-3.5 fill-current" />
        </Button>
      ) : null}
    </div>
  )
}

const StoppedNotice: FC = () => {
  const t = useT()
  const cancelled = useChatMessageState((s) => {
    const status = s.message.status
    return status?.type === "incomplete" && status.reason === "cancelled"
  })
  if (!cancelled) return null
  return (
    <Marker className="mt-2">
      <MarkerContent>{t("common.cancelledByUser")}</MarkerContent>
    </Marker>
  )
}

const ACTION_BAR_PT = "pt-3"
const ACTION_BAR_HEIGHT = `min-h-7.5 ${ACTION_BAR_PT}`

const AssistantTextPart = ({ text, status }: TextMessagePart) => {
  const { isTurnRunning } = useContext(TurnContentContext)
  const messageRunning = useChatMessageState(
    (state) => state.message.status?.type === "running"
  )
  const effectiveStatus =
    status ?? (messageRunning ? ({ type: "running" } as const) : undefined)
  if (effectiveStatus?.type === "running" && text === "") {
    if (isTurnRunning) return null
    return (
      <AssistantReasoningGroup>
        <Reasoning type="reasoning" text="" status={effectiveStatus} />
      </AssistantReasoningGroup>
    )
  }
  return (
    <ChatPartProvider part={{ type: "text", text, status: effectiveStatus }}>
      <MarkdownText text={text} />
    </ChatPartProvider>
  )
}

const AssistantMessage: FC = () => {
  const { ToolFallback, showActions } = useContext(ThreadComponentsContext)
  const ToolFallbackComponent = ToolFallback ?? AssistantToolCall
  const {
    mode,
    isTurnRunning,
    backgroundRunning,
    turnMessages,
    approvalDenied,
  } = useContext(TurnContentContext)
  const message = useChatMessage()
  const sources = message.metadata?.custom?.sources
  // 回复正文还在输出时不展示引用来源，等正文结束后再补上
  const replying = message.status?.type === "running"

  return (
    <Message
      data-slot="assistant-message-root"
      data-message-id={message.id}
      data-role="assistant"
      className="animate-in duration-150 [contain-intrinsic-size:auto_200px] [content-visibility:auto] fade-in slide-in-from-bottom-1"
    >
      <MessageContent className="gap-0 px-2 leading-relaxed wrap-break-word text-foreground">
        <div
          data-slot="assistant-message-content"
          data-transcript-text
          className="[&>:last-child]:mb-0"
        >
          <AssistantParts ToolFallbackComponent={ToolFallbackComponent} />
          <MessageInputRequests />
          {mode !== "approval" && mode !== "approval-denied" ? (
            <>
              {replying ? null : <MessageSources raw={sources} />}
              <AssistantFileChanges />
              {turnMessages ? (
                <>
                  {!isTurnRunning ? (
                    <TurnArtifacts
                      className="mt-3"
                      messages={
                        turnMessages as Parameters<
                          typeof artifactCardsFromMessages
                        >[0]
                      }
                    />
                  ) : null}
                </>
              ) : null}
              <LifecycleEvents planOnly />
              <MessageError />
              {approvalDenied ? null : <StoppedNotice />}
            </>
          ) : null}
        </div>
        {showActions !== false &&
        replyActionsVisible({
          running: isTurnRunning,
          background: backgroundRunning,
        }) &&
        mode !== "approval" &&
        mode !== "approval-denied" ? (
          <MessageFooter
            data-slot="assistant-message-footer"
            className={cn("items-center px-0", ACTION_BAR_HEIGHT)}
          >
            <AssistantActionBar />
          </MessageFooter>
        ) : null}
      </MessageContent>
    </Message>
  )
}

const WorkMessage: FC = () => {
  const ToolFallbackComponent =
    useContext(ThreadComponentsContext).ToolFallback ?? AssistantToolCall
  const { finalId, outsideNotices, approvalPending, approvalDenied } =
    useContext(TurnContentContext)
  const message = useChatMessage()
  const finalAnswer = message.id === finalId
  const sources = message.metadata?.custom?.sources
  return (
    <div
      data-work-message-id={message.id}
      data-transcript-text
      className="flex min-w-0 flex-col gap-2 empty:hidden"
    >
      <LifecycleEvents scope="compaction" />
      <AssistantParts ToolFallbackComponent={ToolFallbackComponent} />
      <MessageInputRequests />
      {finalAnswer || approvalPending ? null : <MessageSources raw={sources} />}
      {approvalPending ? null : <LifecycleEvents scope="other" />}
      {!finalAnswer && !outsideNotices && !approvalPending ? (
        <>
          <MessageError />
          {approvalDenied ? null : <StoppedNotice />}
        </>
      ) : null}
    </div>
  )
}

const TurnNoticeMessage: FC = () => {
  const { finalId } = useContext(TurnContentContext)
  const message = useChatMessage()
  if (message.id === finalId || message.status?.type !== "incomplete")
    return null
  return (
    <div data-slot="turn-notice" className="min-w-0 px-2">
      <MessageError />
      <StoppedNotice />
    </div>
  )
}

const PersistentMessage: FC = () => {
  const ToolFallbackComponent =
    useContext(ThreadComponentsContext).ToolFallback ?? AssistantToolCall
  const { persistentTools } = useContext(TurnContentContext)
  const message = useChatMessage()
  const parts = message.content.filter(
    (part) =>
      part.type === "tool-call" &&
      (persistentTools
        ? persistentTools[message.id]?.includes(part.toolCallId)
        : isPersistentToolResult(part.result))
  )
  // 生命周期事件只渲染在执行过程里，这里没有持久工具结果就不要占位
  if (!parts.length) return null
  return (
    <div className="min-w-0 px-2">
      {parts.map((part) =>
        part.type === "tool-call" ? (
          <ChatPartProvider key={part.toolCallId} part={part}>
            <ToolFallbackComponent {...part} />
          </ChatPartProvider>
        ) : null
      )}
    </div>
  )
}

function hiddenByMode(
  part: ThreadMessagePart,
  index: number,
  parts: readonly ThreadMessagePart[],
  mode: "all" | "work" | "final" | "approval" | "approval-denied",
  finalId: string | undefined,
  messageId: string,
  persistentTools: Record<string, string[]> | undefined,
  finalParts: Record<string, number[]> | undefined
) {
  if (mode === "all") return false
  if (mode === "approval")
    return !(part.type === "tool-call" && toolNeedsApproval(part))
  if (mode === "approval-denied")
    return !(part.type === "tool-call" && isDeclinedToolApproval(part))
  if (part.type === "tool-call" && isDeclinedToolApproval(part)) return true
  // 待审批的工具在执行过程里显示等待轨迹，审批卡片仍然只渲染在正文
  if (part.type === "tool-call" && toolNeedsApproval(part)) return mode !== "work"
  if (
    mode === "work" &&
    part.type === "tool-call" &&
    (persistentTools
      ? persistentTools[messageId]?.includes(part.toolCallId)
      : isPersistentToolResult(part.result))
  )
    return true
  // 最终答复按整轮时间顺序判定，执行步骤之前的文本留在过程面板
  const final = finalParts
    ? (finalParts[messageId]?.includes(index) ?? false)
    : (() => {
        const lastText = parts.findLastIndex(
          (item) => item.type === "text" && item.text.trim()
        )
        return (
          messageId === finalId &&
          (part.type === "text"
            ? index >= lastText
            : ["image", "file"].includes(part.type))
        )
      })()
  return mode === "final" ? !final : final
}

const AssistantFilePart = (part: FileMessagePart) => (
  <div data-slot="assistant-message-file" className="py-1">
    <File {...part} />
  </div>
)

const AssistantImagePart = (part: ImageMessagePart) => (
  <div data-slot="assistant-message-image" className="py-1">
    <Image {...part} />
  </div>
)

function AssistantParts({
  ToolFallbackComponent,
}: {
  ToolFallbackComponent: ComponentType<ToolCallMessagePart>
}) {
  const { mode, finalId, persistentTools, finalParts, approvalPending } =
    useContext(TurnContentContext)
  const message = useChatMessage()
  const approvalCutoff =
    mode === "work" && approvalPending
      ? message.content.findIndex(
          (part) => part.type === "tool-call" && toolNeedsApproval(part)
        )
      : -1
  // 审批之后的内容还没发生，等待审批的调用本身要留在执行过程里
  const parts =
    approvalCutoff >= 0
      ? message.content.slice(0, approvalCutoff + 1)
      : message.content
  const rows: ReactNode[] = []
  let index = 0
  while (index < parts.length) {
    const part = parts[index]!
    if (
      hiddenByMode(
        part,
        index,
        parts,
        mode,
        finalId,
        message.id,
        persistentTools,
        finalParts
      )
    ) {
      index += 1
      continue
    }
    if (part.type === "reasoning") {
      const group: ThreadMessagePart[] = []
      const start = index
      while (index < parts.length && parts[index]?.type === "reasoning") {
        const next = parts[index]!
        if (
          !hiddenByMode(
            next,
            index,
            parts,
            mode,
            finalId,
            message.id,
            persistentTools,
            finalParts
          )
        )
          group.push(next)
        index += 1
      }
      rows.push(
        <AssistantReasoningGroup key={`reasoning-${start}`}>
          {group.map((item, offset) =>
            item.type === "reasoning" ? (
              <Reasoning key={offset} {...item} />
            ) : null
          )}
        </AssistantReasoningGroup>
      )
      continue
    }
    if (part.type === "tool-call") {
      if (
        toolNeedsApproval(part) &&
        !hiddenByMode(
          part,
          index,
          parts,
          mode,
          finalId,
          message.id,
          persistentTools,
          finalParts
        )
      ) {
        rows.push(
          <ChatPartProvider key={part.toolCallId} part={part}>
            <ToolFallbackComponent {...part} />
          </ChatPartProvider>
        )
        index += 1
        continue
      }
      const indices: number[] = []
      const tools: ToolCallMessagePart[] = []
      const start = index
      while (index < parts.length && parts[index]?.type === "tool-call") {
        const next = parts[index]!
        const hidden = hiddenByMode(
          next,
          index,
          parts,
          mode,
          finalId,
          message.id,
          persistentTools,
          finalParts
        )
        if (!hidden && toolNeedsApproval(next as ToolCallMessagePart)) break
        if (!hidden) {
          indices.push(index)
          tools.push(next as ToolCallMessagePart)
        }
        index += 1
      }
      if (tools.length) {
        rows.push(
          <AssistantToolGroup
            key={`tools-${start}`}
            group={{
              indices,
              status: {
                type: tools.some((tool) => tool.status?.type === "running")
                  ? "running"
                  : "complete",
              },
            }}
          >
            {tools.map((tool) => (
              <ChatPartProvider key={tool.toolCallId} part={tool}>
                <ToolFallbackComponent {...tool} />
              </ChatPartProvider>
            ))}
          </AssistantToolGroup>
        )
      }
      continue
    }
    if (part.type === "text") {
      rows.push(<AssistantTextPart key={index} {...part} />)
    } else if (part.type === "image") {
      rows.push(<AssistantImagePart key={index} {...part} />)
    } else if (part.type === "file") {
      rows.push(<AssistantFilePart key={index} {...part} />)
    }
    index += 1
  }
  return <>{rows}</>
}

function MessageCopyButton() {
  const t = useT()
  const { isCopied, copyToClipboard } = useCopyToClipboard()
  const text = useChatMessageState((state) =>
    state.message.content
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n\n")
  )
  return (
    <TooltipIconButton
      tooltip={t("common.copy")}
      side="top"
      onClick={() => void copyToClipboard(text)}
    >
      {isCopied ? <CheckIcon /> : <CopyIcon />}
    </TooltipIconButton>
  )
}

const AssistantActionBar: FC = () => {
  const t = useT()
  const runtime = useChatRuntime()
  const message = useChatMessage()
  const markdown = message.content
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n\n")
  return (
    <div className="assistant-action-bar-root col-start-3 row-start-2 -ms-1 flex animate-in items-center gap-1 text-muted-foreground duration-200 fade-in">
      <MessageCopyButton />
      <MessageReloadButton />
      <MessageVersionsButton />
      <MessageBranchButton />
      <MessageDeleteButton />
      <TooltipIconButton
        tooltip={t("common.exportAsMarkdown")}
        side="top"
        onClick={() => {
          if (!markdown) return
          const href = `data:text/markdown;charset=utf-8,${encodeURIComponent(markdown)}`
          const anchor = document.createElement("a")
          anchor.href = href
          anchor.download = "message.md"
          anchor.click()
        }}
      >
        <DownloadIcon />
      </TooltipIconButton>
      <MessageTiming />
      <MessageMetadata className="pl-1" />
      {runtime.thread.isDisabled ? null : null}
    </div>
  )
}

function MessageReloadButton() {
  const t = useT()
  const runtime = useChatRuntime()
  const message = useChatMessage()
  // 当前回合的最新回复直接重生成，历史回复只能在新分支中重生成
  const current = useChatRuntimeState((s) =>
    canRegenerateReply(s.thread.rawMessages, message.id)
  )
  if (!current) return <MessageBranchButton regenerate />
  return (
    <TooltipIconButton
      tooltip={t("common.regenerate")}
      side="top"
      onClick={() => void runtime.actions.reload(message.id)}
    >
      <RefreshCwIcon />
    </TooltipIconButton>
  )
}

const UserMessage: FC = () => {
  const t = useT()
  const showActions = useContext(ThreadComponentsContext).showActions
  const message = useChatMessage()
  const quote = message.metadata?.custom?.quote as
    TranscriptQuoteAnchor | undefined
  const locatedNonce = useComposerStore((state) =>
    state.locatedMessageId === message.id ? state.locatedNonce : 0
  )
  const query = useTranscriptFind()
  const text = message.content
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n")
  const hasBody = message.content.some((part) =>
    part.type === "text"
      ? part.text.trim().length > 0
      : part.type !== "image" && part.type !== "file"
  )
  const [expanded, setExpanded] = useState(false)
  const canCollapse = text.length > 800 || text.split("\n").length > 12
  const collapsed = canCollapse && !expanded && !query
  return (
    <Message
      align="end"
      data-slot="user-message-root"
      data-message-id={message.id}
      data-role="user"
      data-image-gallery
      className="animate-in duration-150 [contain-intrinsic-size:auto_200px] [content-visibility:auto] fade-in slide-in-from-bottom-1"
    >
      <MessageContent className="items-end gap-0">
        <div className="relative flex w-full min-w-0 flex-col items-end gap-2">
          <UserMessageAttachments />
          {hasBody || quote ? (
            <Bubble
              align="end"
              variant="muted"
              className="user-message-content relative max-w-[85%] overflow-hidden"
            >
              <BubbleContent className="rounded-2xl px-4 py-2 wrap-break-word text-foreground">
                <div
                  data-transcript-text
                  className={cn(
                    collapsed &&
                      "max-h-44 overflow-hidden [mask-image:linear-gradient(black_65%,transparent)]"
                  )}
                >
                  {quote ? <QuoteBlock text={quote.text} /> : null}
                  {text ? <SkillDirectiveText text={text} /> : null}
                </div>
                {canCollapse ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-expanded={!collapsed}
                    onClick={() => setExpanded(!expanded)}
                  >
                    {t(
                      collapsed ? "common.showFullMessage" : "common.showLess"
                    )}
                  </Button>
                ) : null}
              </BubbleContent>
              {locatedNonce > 0 ? (
                <span
                  key={locatedNonce}
                  aria-hidden
                  data-slot="message-locate-ring"
                  className="locate-rainbow pointer-events-none absolute inset-0 rounded-2xl"
                />
              ) : null}
            </Bubble>
          ) : null}
        </div>
        {showActions !== false ? (
          <MessageFooter
            data-slot="user-message-footer"
            className={cn("w-full justify-end gap-2 px-0", ACTION_BAR_HEIGHT)}
          >
            <MessageMetadata className="[&>time]:order-first" />
            <UserActionBar />
          </MessageFooter>
        ) : null}
      </MessageContent>
    </Message>
  )
}

function lastUserMessageText(content: readonly ThreadMessagePart[]) {
  return content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("")
}

const UserActionBar: FC = () => {
  const t = useT()
  const { conversationId } = useContext(ThreadComponentsContext)
  const runtime = useChatRuntime()
  const message = useChatMessage()
  // 只有当前回合的用户提问可以直接编辑，历史提问只能在新分支中编辑
  const canEdit = useChatRuntimeState(
    (s) => editableUserMessage(s.thread.rawMessages, message.id) !== null
  )
  const messageText = lastUserMessageText(message.content)
  return (
    <div className="user-action-bar-root flex animate-in gap-1 text-muted-foreground duration-200 fade-in">
      {messageText.trim() ? <MessageCopyButton /> : null}
      {canEdit ? (
        <TooltipIconButton
          type="button"
          tooltip={t("common.edit")}
          side="top"
          className="user-action-edit"
          onClick={() => {
            runtime.composer.setText(messageText)
            useComposerStore
              .getState()
              .startEditing(message.id, messageText, conversationId ?? null)
          }}
        >
          <PencilIcon />
        </TooltipIconButton>
      ) : (
        <MessageBranchButton edit />
      )}
      <MessageDeleteButton />
      <MessageBranchButton />
      <MessageRollbackButton />
    </div>
  )
}

function MessageDeleteButton() {
  const t = useT()
  const onDeleteMessage = useContext(ThreadComponentsContext).onDeleteMessage
  const message = useChatMessage()
  const pk = message.metadata?.custom?.pk
  if (!onDeleteMessage || typeof pk !== "number") return null
  return (
    <TooltipIconButton
      type="button"
      tooltip={t("common.delete")}
      side="top"
      onClick={() => onDeleteMessage(pk)}
    >
      <Trash2Icon />
    </TooltipIconButton>
  )
}
