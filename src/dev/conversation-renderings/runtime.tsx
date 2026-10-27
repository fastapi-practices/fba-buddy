import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ChatRuntimeProvider,
  useChatRuntime,
} from "@/features/chat/chat-runtime"
import type {
  ChatQueueAdapter,
  ChatSubmission,
  QueueItemState,
} from "@/features/chat/thread-types"
import { Thread, type ThreadComponents } from "@/components/ai-elements/thread"
import { ChatComposerLayoutSlot } from "@/features/chat/chat-composer-layout"
import { ChatPaneSlotsContext } from "@/features/chat/chat-pane-slots"
import { handleComposerShortcutKeyDown } from "@/features/chat/composer-shortcuts"
import { ChatWelcome } from "@/features/chat/chat-welcome"
import { ConversationModeContext } from "@/features/chat/conversation-mode"
import { ComposerDraftBridge } from "@/features/chat/composer-draft-bridge"
import { QueueComposerProvider } from "@/features/chat/queue-composer"
import {
  queueItemFromSubmission,
  submissionFromQueueItem,
  toThreadMessages,
} from "@/features/chat/thread-message"
import { navigateTranscript } from "@/features/chat/transcript-state"
import { canRegenerateReply } from "@/features/chat/use-chat"
import { isPersistedMessagePk } from "@/features/chat/message-pk"
import { PlanActionsContext } from "@/features/chat/plan-actions"
import { useT } from "@/hooks/use-t"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/toast"
import {
  imageFile,
  textFile,
  type RenderingInputResolution,
  type RenderingScene,
} from "./fixtures"
import {
  applyPlaybackStep,
  buildEventPlayback,
  buildReplyPlayback,
  buildScenePlayback,
  DEFAULT_TOKENS_PER_SECOND,
  playbackApprovalRequest,
  planFork,
  planRegenerate,
  respondToPlaybackApproval,
  seedPlayback,
  type PlaybackStep,
  type ReplayPlan,
} from "./playback"
import { previewProviders } from "./preview-data"
import {
  askLocalPreviewInput,
  LOCAL_PREVIEW_INPUT_RESOLVED,
} from "./local-api"
import type { AgentMode, ChatMessage } from "@/lib/types"

type WaitingApproval = {
  index: number
  messageId: string
  requestId: string
  toolCallId: string
}

const CANCELLED_RUN: PlaybackStep = {
  kind: "event",
  event: {
    type: "RUN_FINISHED",
    threadId: "rendering-stream",
    runId: "rendering-run",
    result: { status: "interrupted" },
    outcome: { type: "cancelled" },
  },
  delay: 0,
}

// 新会话里没有原来那条提案消息，计划卡片改挂在本次执行的消息上
function retargetPlanEvents(events: Record<string, unknown>[]) {
  const owner = events.find(
    (event) =>
      event.type === "TEXT_MESSAGE_START" && event.role === "assistant"
  )
  const messageId = owner?.messageId
  if (typeof messageId !== "string") return events
  return events.map((event) =>
    event.name === "buddy.planning"
      ? { ...event, parentMessageId: messageId }
      : event
  )
}

function SeedComposerButton() {
  const runtime = useChatRuntime()
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => {
        runtime.composer.setText("请根据这些附件给我一份简短总结")
        void (async () => {
          const text = new File([atob(textFile.data)], textFile.name, {
            type: textFile.mime,
          })
          const imageBlob = await fetch(imageFile.url!).then((response) =>
            response.blob()
          )
          const image = new File([imageBlob], imageFile.name, {
            type: imageFile.mime,
          })
          await runtime.composer.addFiles([text, image])
        })()
      }}
    >
      填入草稿与附件
    </Button>
  )
}

export function SceneRuntime({
  scene,
  tokensPerSecond = DEFAULT_TOKENS_PER_SECOND,
  mode = "work",
}: {
  scene: RenderingScene
  tokensPerSecond?: number
  mode?: AgentMode
}) {
  const playback = useMemo(
    () => buildScenePlayback(scene, tokensPerSecond),
    [scene, tokensPerSecond]
  )
  const [followUpPlayback, setFollowUpPlayback] = useState<PlaybackStep[]>([])
  const activePlayback = useMemo(
    () => [...playback, ...followUpPlayback],
    [followUpPlayback, playback]
  )
  // 重新生成与分叉都会重放某一轮，这时播放的是重放计划而不是整段回放
  const [replayPlan, setReplayPlan] = useState<{
    plan: ReplayPlan
    source: PlaybackStep[]
  } | null>(null)
  // 回放速度或场景变化后，之前排好的重放计划不再适用
  const activeSteps =
    replayPlan && replayPlan.source === playback
      ? replayPlan.plan.steps
      : activePlayback
  const initialPlayback = useMemo(() => seedPlayback(playback), [playback])
  const [messages, setMessages] = useState<ChatMessage[]>(
    initialPlayback.messages
  )
  const [cursor, setCursor] = useState(initialPlayback.cursor)
  const [playing, setPlaying] = useState(
    initialPlayback.cursor < playback.length
  )
  const [waitingInput, setWaitingInput] = useState<{
    requestId: string
  } | null>(null)
  const [waitingApproval, setWaitingApproval] =
    useState<WaitingApproval | null>(null)
  const [items, setItems] = useState<QueueItemState[]>(() =>
    scene.id === "queue"
      ? [
          {
            id: "queued-risk",
            prompt: "补充风险说明",
            parts: [{ type: "text", text: "补充风险说明" }],
          },
          {
            id: "queued-table",
            prompt: "把结论转成表格",
            parts: [{ type: "text", text: "把结论转成表格" }],
          },
        ]
      : []
  )
  const sequence = useRef(0)
  const backgroundPlayed = useRef(false)
  const t = useT()
  const threadMessages = useMemo(() => toThreadMessages(messages), [messages])
  const running =
    playing ||
    Boolean(waitingInput) ||
    Boolean(waitingApproval) ||
    messages.some((message) => message.status === "streaming")
  const showComposer = ["input", "approval", "media", "queue"].includes(
    scene.id
  )
  // 没有内容时不留空顶栏
  const hasToolbar =
    showComposer || items.length > 0 || waitingApproval || waitingInput

  // 后台任务的完成事件在主回复结束之后才回来
  useEffect(() => {
    const followUp = scene.backgroundFollowUp
    if (!followUp || backgroundPlayed.current) return
    if (playing || waitingInput || waitingApproval) return
    if (cursor < activeSteps.length) return
    const timer = window.setTimeout(() => {
      backgroundPlayed.current = true
      setFollowUpPlayback(buildEventPlayback(followUp.events, tokensPerSecond))
      setPlaying(true)
    }, followUp.delay)
    return () => window.clearTimeout(timer)
  }, [
    activeSteps.length,
    cursor,
    playing,
    scene.backgroundFollowUp,
    tokensPerSecond,
    waitingApproval,
    waitingInput,
  ])
  useEffect(() => {
    if (!playing) return
    const step = activeSteps[cursor]
    if (!step) return
    const timer = window.setTimeout(() => {
      setMessages((previous) => applyPlaybackStep(previous, step))
      const next = cursor + 1
      setCursor(next)
      if (step.waitForInput) {
        askLocalPreviewInput(step.waitForInput)
        setWaitingInput({ requestId: step.waitForInput })
        setPlaying(false)
        return
      }
      if (step.waitForApproval) {
        const request = playbackApprovalRequest(step)
        if (request)
          setWaitingApproval({
            index: cursor,
            ...request,
          })
        setPlaying(false)
        return
      }
      if (next >= activeSteps.length) setPlaying(false)
    }, step.delay)
    return () => window.clearTimeout(timer)
  }, [activeSteps, cursor, playing])

  useEffect(() => {
    if (!waitingInput || !scene.inputFollowUp) return
    const resolveInput = (event: Event) => {
      const detail = (event as CustomEvent<RenderingInputResolution>).detail
      if (detail?.requestId !== waitingInput.requestId) return
      setFollowUpPlayback(
        buildEventPlayback(scene.inputFollowUp!(detail), tokensPerSecond)
      )
      setWaitingInput(null)
      setPlaying(true)
    }
    window.addEventListener(LOCAL_PREVIEW_INPUT_RESOLVED, resolveInput)
    return () =>
      window.removeEventListener(LOCAL_PREVIEW_INPUT_RESOLVED, resolveInput)
  }, [scene, tokensPerSecond, waitingInput])
  const respondToApproval = useCallback(
    (input: {
      toolCallId: string
      approved: boolean
      always?: boolean
      optionId?: string
    }) => {
      if (!waitingApproval || waitingApproval.toolCallId !== input.toolCallId)
        return false
      const result = respondToPlaybackApproval({
        messages,
        playback: activePlayback,
        approvalIndex: waitingApproval.index,
        approved: input.approved,
        always: input.always,
        optionId: input.optionId,
      })
      setMessages(result.messages)
      setCursor(result.cursor)
      setPlaying(result.playing)
      setWaitingApproval(null)
      return true
    },
    [activePlayback, messages, waitingApproval]
  )
  const resumeToolCall = useCallback(
    ({ toolCallId, payload }: { toolCallId: string; payload: unknown }) => {
      const body =
        payload && typeof payload === "object"
          ? (payload as {
              approved?: unknown
              always?: unknown
              optionId?: unknown
            })
          : null
      respondToApproval({
        toolCallId,
        approved: Boolean(body?.approved),
        always: Boolean(body?.always),
        optionId:
          typeof body?.optionId === "string" ? body.optionId : undefined,
      })
    },
    [respondToApproval]
  )
  const approveTool = useCallback(
    async (toolCallId: string, approved: boolean, always = false) =>
      respondToApproval({
        toolCallId,
        approved,
        always,
      }),
    [respondToApproval]
  )
  const stop = useCallback(() => {
    setPlaying(false)
    setWaitingInput(null)
    setWaitingApproval(null)
    setMessages((previous) =>
      previous.some(
        (message) =>
          message.status === "streaming" ||
          message.status === "awaiting-approval"
      )
        ? applyPlaybackStep(previous, CANCELLED_RUN)
        : previous
    )
  }, [])
  // 重新生成与分叉都只重放被点击那条消息所在的一轮
  const startReplay = useCallback((plan: ReplayPlan | null) => {
    if (!plan) return
    setMessages(plan.base)
    setReplayPlan({ plan, source: playback })
    setCursor(0)
    setFollowUpPlayback([])
    setWaitingInput(null)
    setWaitingApproval(null)
    // 重放的是新一轮，后台任务不再追加
    backgroundPlayed.current = true
    setPlaying(plan.steps.length > 0)
  }, [playback])
  const regenerateReply = useCallback(
    (messageId: string) => {
      const target = messages.find((message) => message.id === messageId)
      if (!target || !isPersistedMessagePk(target.pk)) return
      const plan = planRegenerate(playback, target.pk)
      if (!plan) {
        toast.add({ title: "本地预览里没有这条回复的回放记录", type: "error" })
        return
      }
      // 当前回合原地重生成，历史回复先分叉出新分支再重生成
      const inPlace = canRegenerateReply(messages, messageId)
      startReplay(plan)
      toast.add({
        title: inPlace
          ? "已原地重新生成这条回复"
          : "已在新分支中重新生成这条回复",
      })
    },
    [messages, playback, startReplay]
  )
  const branchFrom = useCallback(
    (pk: number, options?: { regenerate?: boolean; content?: string }) => {
      if (options?.regenerate) {
        const plan = planRegenerate(playback, pk, {
          question: options.content,
        })
        if (!plan) {
          toast.add({ title: "本地预览里没有这条消息的回放记录", type: "error" })
          return
        }
        startReplay(plan)
        toast.add({ title: "已在新分支中重新生成" })
        return
      }
      const plan = planFork(playback, pk)
      if (!plan) {
        toast.add({ title: "本地预览里没有这条消息的回放记录", type: "error" })
        return
      }
      startReplay(plan)
      toast.add({ title: "已从这条消息创建新分支" })
    },
    [playback, startReplay]
  )
  const append = async (message: ChatSubmission) => {
    const content = message.text
    const quote = message.quote
    const id = `preview-${++sequence.current}`
    const answerId = `${id}-answer`
    setMessages((previous) => [
      ...previous,
      {
        id,
        role: "user",
        content,
        attachments: message.attachments,
        ...(quote ? { turnContext: { quote } } : {}),
      },
    ])
    // 回复按真实速度流式输出，跑完之后才出现完整的动作栏
    setCursor(playback.length)
    setFollowUpPlayback(
      buildReplyPlayback(
        answerId,
        scene.queuedReplies?.[content] ??
          `已经按「${content}」处理完成，改动集中在渲染链路，类型检查与单元测试均已通过。`,
        tokensPerSecond
      )
    )
    setPlaying(true)
  }
  const planActions = useMemo(
    () => ({
      execute: async (markdown: string, newConversation: boolean) => {
        const steps = scene.planExecution
        if (!steps?.length) {
          toast.add({ title: "本地预览没有计划执行回放", type: "error" })
          return
        }
        const id = `plan-exec-${++sequence.current}`
        const planMessage: ChatMessage = {
          id,
          role: "user",
          content: markdown,
        }
        setMessages((previous) =>
          newConversation ? [planMessage] : [...previous, planMessage]
        )
        // 从基础回放之后接着播，模拟模型真正开始推进步骤
        setCursor(playback.length)
        setFollowUpPlayback(
          buildEventPlayback(
            newConversation ? retargetPlanEvents(steps) : steps,
            tokensPerSecond
          )
        )
        setPlaying(true)
      },
    }),
    [playback.length, scene.planExecution, tokensPerSecond]
  )
  const steerMessage = (message: ChatSubmission) => {
    setMessages((previous) => [
      ...previous,
      {
        id: `steered-${++sequence.current}`,
        role: "user",
        content: message.text,
        attachments: message.attachments,
      },
    ])
  }
  const saveQueuedMessage = useCallback(
    async (id: string, message: ChatSubmission) => {
      setItems((previous) =>
        previous.map((item) =>
          item.id === id ? queueItemFromSubmission(id, message) : item
        )
      )
    },
    []
  )
  const queue: ChatQueueAdapter = {
    items,
    steerItems: [],
    enqueue: (message) => {
      if (running || items.length)
        setItems((previous) => [
          ...previous,
          queueItemFromSubmission(`queued-${++sequence.current}`, message),
        ])
      else void append(message)
    },
    steer: (message) => {
      // 引导：消息立即发给正在运行的模型，不中断当前回复
      steerMessage(message)
    },
    remove: (id) =>
      setItems((previous) => previous.filter((item) => item.id !== id)),
    edit: (id, message) => {
      void saveQueuedMessage(id, message)
    },
    move: (id, placement) => {
      if (placement.lane === "steer") {
        const item = items.find((entry) => entry.id === id)
        if (!item) return
        setItems((previous) => previous.filter((entry) => entry.id !== id))
        steerMessage(submissionFromQueueItem(item))
        return
      }
      setItems((previous) => {
        const moved = previous.find((item) => item.id === id)
        if (!moved) return previous
        const rest = previous.filter((item) => item.id !== id)
        const before = rest.findIndex(
          (item) => item.id === placement.insertBefore
        )
        const after = rest.findIndex(
          (item) => item.id === placement.insertAfter
        )
        rest.splice(
          before >= 0 ? before : after >= 0 ? after + 1 : rest.length,
          0,
          moved
        )
        return rest
      })
    },
  }
  const paneSlots = useMemo(
    () => ({
      paneKey: `rendering-${scene.id}`,
      providers: previewProviders.providers,
      defaultModel: previewProviders.default_models.chat ?? null,
      // 与线程组件用同一个会话标识，输入框里的检查点才对得上位置
      conversationId: `rendering-${scene.id}`,
      projectId: null,
      onProjectChange: () => undefined,
      projectDisabled: true,
      worktreeDraft: null,
    }),
    [scene.id]
  )
  const threadComponents = useMemo<ThreadComponents>(
    () => ({
      Welcome: ChatWelcome,
      ComposerLayout: ChatComposerLayoutSlot,
      // 真实客户端始终带着会话标识，分支、版本、删除与提问卡片都依赖它
      conversationId: `rendering-${scene.id}`,
      showComposer,
      onComposerKeyDown: handleComposerShortcutKeyDown,
      onQueueEdit: saveQueuedMessage,
      onDeleteMessage: (pk) => {
        // 真实客户端删除后由服务端返回新列表，预览直接移除本地消息
        setMessages((previous) => previous.filter((message) => message.pk !== pk))
      },
      onBranchMessage: async (pk, options) => {
        branchFrom(pk, options)
      },
      onNavigateQuote: (anchor) => {
        const root = document.querySelector<HTMLElement>(
          '[data-testid="rendering-thread"] .thread-root'
        )
        if (root && navigateTranscript(root, anchor)) return
        toast.add({ title: t("common.quoteNavigationFailed"), type: "error" })
      },
      onApproveTool: approveTool,
      visible: true,
    }),
    [approveTool, branchFrom, saveQueuedMessage, scene.id, showComposer, t]
  )

  return (
    <ConversationModeContext value={mode}>
      <ChatPaneSlotsContext.Provider value={paneSlots}>
        <ChatRuntimeProvider
          messages={threadMessages}
          rawMessages={messages}
          running={running}
          queue={queue}
          onSend={append}
          onStop={async () => stop()}
          onResumeToolCall={resumeToolCall}
          onReload={async (messageId) => {
            regenerateReply(messageId)
          }}
        >
          <ComposerDraftBridge />
          <QueueComposerProvider
            onEdit={saveQueuedMessage}
          >
            {hasToolbar ? (
            <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
              {items.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={running}
                  onClick={() => {
                    const next = items[0]
                    if (!next) return
                    setItems((previous) =>
                      previous.filter((item) => item.id !== next.id)
                    )
                    void append(submissionFromQueueItem(next))
                  }}
                >
                  派发下一条
                </Button>
              )}
              {showComposer ? <SeedComposerButton /> : null}
              {waitingApproval || waitingInput ? (
                <span
                  className="text-xs text-muted-foreground"
                  role="status"
                  data-testid="playback-status"
                  data-state={waitingApproval ? "waiting-approval" : "waiting"}
                >
                  {waitingApproval ? "等待工具审批" : "等待结构化输入"}
                </span>
              ) : null}
            </div>
            ) : null}
            <PlanActionsContext value={planActions}>
              <Thread
                autoFocus={false}
                components={threadComponents}
              />
            </PlanActionsContext>
          </QueueComposerProvider>
        </ChatRuntimeProvider>
      </ChatPaneSlotsContext.Provider>
    </ConversationModeContext>
  )
}
