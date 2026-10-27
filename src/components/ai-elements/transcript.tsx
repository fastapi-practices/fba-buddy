"use client"

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react"
import {
  ChatMessageProvider,
  useChatRuntimeState,
} from "@/features/chat/chat-runtime"
import { ChevronDownIcon, HistoryIcon } from "lucide-react"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  transcriptTurns,
  type TranscriptTurn,
} from "@/features/chat/transcript-render"
import { turnStream } from "@/features/chat/turn-stream"
import {
  formatTurnDuration,
  settleTurnElapsed,
  transcriptWorkTiming,
  turnElapsedMs,
  type TranscriptWorkTiming,
} from "@/features/chat/transcript-work-timing"
import { useT } from "@/hooks/use-t"
import { useTurnDisclosure } from "@/hooks/use-turn-disclosure"
import { type RichEvent } from "@/features/chat/rich-events"
import { TranscriptWindow } from "./transcript-window"
import { TranscriptRevealContext, useTranscriptScope } from "./transcript-scope"
import { RunActivity } from "./run-activity"
import { ThinkingIndicator } from "./thinking-indicator"
import { TOOL_STEP_META } from "./tool-presentation"
import { toolNeedsApproval } from "./tool-approval-state"
import { isDeclinedToolApproval } from "@/features/chat/tool-approvals"
import { hasPendingInputRequest } from "@/features/chat/input-requests"
import {
  placeModelCheckpoints,
  useModelCheckpoints,
} from "@/features/chat/model-checkpoints"
import { ModelCheckpointMarker } from "./model-checkpoint"
export { TranscriptScopeProvider } from "./transcript-scope"

const TranscriptFindContext = createContext("")
export const TurnContentContext = createContext<{
  mode: "all" | "work" | "final" | "approval" | "approval-denied"
  finalId?: string
  finalParts?: Record<string, number[]>
  summaryId?: string
  isTurnRunning?: boolean
  // 后台任务还在跑，回复不算结束
  backgroundRunning?: boolean
  outsideNotices?: boolean
  supersededAttempt?: boolean
  lifecycleEvents?: Record<string, RichEvent[]>
  persistentTools?: Record<string, string[]>
  turnMessages?: readonly unknown[]
  approvalPending?: boolean
  approvalDenied?: boolean
}>({ mode: "all" })
export const useTranscriptFind = () => {
  const query = useContext(TranscriptFindContext)
  const reveal = useContext(TranscriptRevealContext)
  return query || reveal?.text || ""
}

export function TranscriptMessages({
  Message,
  WorkMessage,
  PersistentMessage,
  NoticeMessage,
  busy,
  leading,
  trailing,
}: {
  Message: ComponentType
  WorkMessage: ComponentType
  PersistentMessage?: ComponentType
  NoticeMessage?: ComponentType
  busy?: boolean
  leading?: ReactNode
  trailing?: ReactNode
}) {
  const messages = useChatRuntimeState((s) => s.thread.messages)
  const query = useContext(TranscriptFindContext)
  const [snapshot, setSnapshot] = useState(() => ({
    messages,
    turns: transcriptTurns(messages),
  }))
  if (snapshot.messages !== messages)
    setSnapshot({ messages, turns: transcriptTurns(messages, snapshot.turns) })
  const turns = snapshot.turns
  const scope = useTranscriptScope()
  const checkpoints = useModelCheckpoints(scope.conversationId)
  const checkpointPlacement = useMemo(
    () => placeModelCheckpoints(checkpoints, turnUserOrdinals(turns)),
    [checkpoints, turns]
  )
  const committedTurns = useRef(turns)
  useEffect(() => {
    const previousIds = new Map(
      committedTurns.current.map((turn) => [turn.renderKey, turn.id])
    )
    let changed = false
    for (const turn of turns) {
      const before = previousIds.get(turn.renderKey)
      if (!before || before === turn.id) continue
      const state = scope.view.current
      if (before in state.expanded) {
        state.expanded[turn.id] = state.expanded[before]!
        delete state.expanded[before]
        changed = true
      }
    }
    committedTurns.current = turns
    if (changed) scope.persist()
  }, [turns, scope.view, scope.persist])
  return (
    <TranscriptWindow
      turns={turns}
      query={query}
      busy={busy}
      leading={leading}
      trailing={trailing}
    >
      {(turn, index) => (
        <>
          <TranscriptTurnRow
            key={turn.renderKey}
            turn={turn}
            Message={Message}
            WorkMessage={WorkMessage}
            PersistentMessage={PersistentMessage}
            NoticeMessage={NoticeMessage}
            latest={turn === turns.at(-1)}
          />
          {[
            ...(checkpointPlacement.afterTurn.get(index + 1) ?? []),
            ...(index === turns.length - 1 ? checkpointPlacement.trailing : []),
          ].map((checkpoint) => (
            <ModelCheckpointMarker
              key={checkpoint.id}
              checkpoint={checkpoint}
            />
          ))}
        </>
      )}
    </TranscriptWindow>
  )
}

/** 每个回合是第几条用户消息开启的回合 */
function turnUserOrdinals(turns: readonly TranscriptTurn[]): number[] {
  let userCount = 0
  return turns.map((turn) => {
    if (turn.user) userCount += 1
    return userCount
  })
}

function TurnWorkDuration({
  timing,
  running,
}: {
  timing: TranscriptWorkTiming
  running: boolean
}) {
  const [now, setNow] = useState(() => Date.now())
  // 回合结束的瞬间把总耗时定格，等待审批与后台任务的时间都算进总耗时
  const [settled, setSettled] = useState<number | undefined>(undefined)
  const wasRunning = useRef(running)
  useEffect(() => {
    if (!running || timing.startedAt === undefined) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [running, timing.startedAt])
  useEffect(() => {
    if (running) {
      wasRunning.current = true
      return
    }
    if (!wasRunning.current) return
    wasRunning.current = false
    setSettled(settleTurnElapsed(timing, Date.now()))
  }, [running, timing])
  const elapsed = turnElapsedMs(timing, running, now, settled)
  const duration =
    elapsed !== undefined ? formatTurnDuration(elapsed, running) : undefined
  if (!duration) return null
  const compactDuration = duration.replace(/(\d+[dhms])\s+(?=\d)/g, "$1")
  return <span data-slot="turn-work-duration">{compactDuration}</span>
}

function InlineGeneratingReply({ waiting }: { waiting?: boolean }) {
  const t = useT()
  return (
    <div
      data-slot="inline-generating-reply"
      role="status"
      aria-live="polite"
      aria-busy={waiting ? undefined : "true"}
      className="flex min-w-0 items-center gap-1.5 px-2 text-sm text-muted-foreground"
    >
      <ThinkingIndicator active={!waiting} />
      <span>
        {waiting ? t("common.waitingForAnswer") : t("common.generatingReply")}
      </span>
    </div>
  )
}

function TranscriptTurnRow({
  turn,
  Message,
  WorkMessage,
  PersistentMessage,
  NoticeMessage,
  latest,
}: {
  turn: TranscriptTurn
  Message: ComponentType
  WorkMessage: ComponentType
  PersistentMessage?: ComponentType
  NoticeMessage?: ComponentType
  latest: boolean
}) {
  const t = useT()
  const query = useTranscriptFind()
  const messages = useChatRuntimeState((s) => s.thread.messages)
  const scope = useTranscriptScope()
  const members = messages.filter((message) =>
    turn.assistants.includes(message.id)
  )
  const supersededIds = new Set(
    turn.attempts?.flatMap((attempt) => attempt.messages) ?? []
  )
  const currentMembers = members.filter(
    (message) => !supersededIds.has(message.id)
  )
  const pendingApprovalMembers = currentMembers.filter((message) =>
    message.content.some(
      (part) => part.type === "tool-call" && toolNeedsApproval(part)
    )
  )
  const declinedApprovalMembers = currentMembers.filter((message) =>
    message.content.some(
      (part) => part.type === "tool-call" && isDeclinedToolApproval(part)
    )
  )
  const approvalDenied = declinedApprovalMembers.length > 0
  const approvalStream = pendingApprovalMembers.length > 0
  const lastStatus = currentMembers.at(-1)?.status
  const interrupted = lastStatus?.type === "incomplete" && !approvalDenied
  const interruptionReason = interrupted ? lastStatus.reason : undefined
  const background = Boolean(turn.background && latest && !interrupted)
  const active = turn.running || turn.pending || background
  // 提问期间运行会停在提问这一步，等用户回答后才继续
  const requiresInput = active && hasPendingInputRequest(currentMembers)
  const [manualOpen, setManualOpen] = useState<boolean | null>(
    () => scope.view.current.expanded[turn.id] ?? null
  )
  const [openAttempts, setOpenAttempts] = useState<Set<string>>(() => new Set())
  // 按真实流式顺序切分：最后一个执行步骤之后的文本才是最终答复
  const stream = turnStream(currentMembers, {
    persistentTools: turn.persistentTools,
    lifecycleEvents: turn.lifecycleEvents,
  })
  const finalId =
    approvalDenied && !stream.finalId
      ? undefined
      : (stream.finalId ??
        turn.final ??
        turn.assistants.findLast((id) => !supersededIds.has(id)))
  const finalMessage = currentMembers.find((message) => message.id === finalId)
  const directFinalMessage = finalId
    ? messages.find((message) => message.id === finalId)
    : undefined
  const activityMembers =
    finalMessage == null && directFinalMessage
      ? [...currentMembers, directFinalMessage]
      : currentMembers
  const approvalBoundaryId = pendingApprovalMembers[0]?.id
  const approvalBoundaryIndex = activityMembers.findIndex(
    (message) => message.id === approvalBoundaryId
  )
  const approvalActivityMembers =
    approvalStream && approvalBoundaryIndex >= 0
      ? activityMembers.slice(0, approvalBoundaryIndex + 1)
      : activityMembers
  // 最终答复一开始输出就算执行过程结束，运行过程立即收起
  const finalReplyStarted = stream.finalReplyStarted
  // 等待审批期间执行过程保持展开，等待轨迹和耗时才看得见
  const executionActive = active && !finalReplyStarted
  const phase = useTurnDisclosure(executionActive, finalReplyStarted)
  const wasActive = useRef(executionActive)
  useEffect(() => {
    if (executionActive) {
      wasActive.current = true
      return
    }
    if (!wasActive.current) return
    wasActive.current = false
    setManualOpen(false)
    scope.view.current.expanded[turn.id] = false
    scope.persist()
  }, [executionActive, scope.view, scope.persist, turn.id])
  const updateOpen = (open: boolean) => {
    if (executionActive && !open) return
    setManualOpen(open)
    scope.view.current.expanded[turn.id] = open
    scope.persist()
  }
  const timing = transcriptWorkTiming(members)
  // 执行过程包含思考、工具调用，以及最终答复之前输出的铺垫文本
  const hasWork = stream.hasWork
  // 没有执行过程时，生成状态跟最后一条内容走，不再占用回合顶部的运行入口
  const inlineGeneratingReply =
    active && !hasWork && !turn.pending && !background
  const showActivity = approvalStream
    ? true
    : hasWork || (!inlineGeneratingReply && active)
  const context = {
    finalId,
    finalParts: stream.finalParts,
    isTurnRunning: turn.running || turn.pending,
    backgroundRunning: background,
    outsideNotices: Boolean(NoticeMessage),
    lifecycleEvents: turn.lifecycleEvents ?? {},
    persistentTools: turn.persistentTools ?? {},
    turnMessages: members,
    approvalPending: approvalStream,
    approvalDenied,
  }
  // 执行过程中保持展开，最终答复开始后由 disclosure phase 自动收起
  const open =
    executionActive ||
    Boolean(query) ||
    phase === "settling" ||
    (phase === "settled" && manualOpen === true)
  const row = (id: string, Component: ComponentType) => {
    const message = messages.find((item) => item.id === id)
    if (!message) return null
    return (
      <ChatMessageProvider
        key={id}
        message={message}
        index={messages.indexOf(message)}
        isLast={message === messages.at(-1)}
      >
        <Component />
      </ChatMessageProvider>
    )
  }
  type LatestPart =
    | { type: "tool-call"; result?: unknown; toolName: string }
    | { type: "reasoning"; status?: { type: string } }
  const latestPart = currentMembers
    .filter((message) => message.status?.type === "running")
    .flatMap((message) => [...message.content] as unknown as LatestPart[])
    .findLast(
      (part) =>
        (part.type === "tool-call" && part.result === undefined) ||
        (part.type === "reasoning" && part.status?.type === "running")
    )
  const liveLabel = requiresInput
    ? t("common.waitingForAnswer")
    : background && !turn.running && !turn.pending
      ? t("common.waitingBackgroundAgents")
      : turn.pending
        ? approvalStream
          ? t("common.executionProcess")
          : t("common.activityNeedsAttention")
        : finalReplyStarted
          ? t("common.generatingReply")
          : latestPart?.type === "tool-call" && latestPart.result === undefined
            ? t(
                TOOL_STEP_META[latestPart.toolName]?.activeVerb ??
                  "common.working"
              )
            : latestPart?.type === "reasoning"
              ? t("status.deepThinking")
              : t("common.generatingReply")
  return (
    <section
      data-turn-id={turn.id}
      data-turn-phase={phase}
      className="flex min-w-0 flex-col gap-3"
    >
      {turn.user ? row(turn.user, Message) : null}
      {turn.attempts?.map((attempt) => (
        <Collapsible
          key={attempt.id}
          open={Boolean(query) || openAttempts.has(attempt.id)}
          onOpenChange={(open) =>
            setOpenAttempts((current) => {
              const next = new Set(current)
              if (open) next.add(attempt.id)
              else next.delete(attempt.id)
              return next
            })
          }
          className="min-w-0 px-2"
          data-slot="superseded-attempt"
        >
          <CollapsibleTrigger className="group flex w-full min-w-0 items-center gap-2 py-1 text-left text-sm text-muted-foreground transition-colors hover:text-foreground">
            <HistoryIcon className="size-3.5 shrink-0" />
            <span className="truncate">
              {attempt.number !== undefined
                ? t("common.supersededAttemptNumber", {
                    number: attempt.number,
                  })
                : t("common.supersededAttempt")}
            </span>
            <span className="min-w-0 truncate text-xs opacity-70">
              {t("common.supersededAttemptHint")}
            </span>
            <ChevronDownIcon className="ml-auto size-3.5 shrink-0 -rotate-90 transition-transform group-data-panel-open:rotate-0 group-data-open:rotate-0" />
          </CollapsibleTrigger>
          <CollapsibleContent keepMounted>
            <TurnContentContext
              value={{
                mode: "work",
                finalId,
                finalParts: {},
                persistentTools: {},
                supersededAttempt: true,
              }}
            >
              <div className="flex min-w-0 flex-col gap-3 border-l-2 border-muted-foreground/20 py-2 pl-3 opacity-75">
                {attempt.messages.map((id) => row(id, WorkMessage))}
              </div>
            </TurnContentContext>
          </CollapsibleContent>
        </Collapsible>
      ))}
      {showActivity ? (
        <div
          data-slot="turn-activity"
          data-turn-phase={phase}
          className="w-full min-w-0 self-start px-2"
        >
          <RunActivity
            turnPhase={phase}
            liveLabel={liveLabel}
            status={
              turn.pending || requiresInput
                ? "requires-action"
                : interrupted
                  ? "incomplete"
                  : active
                    ? "running"
                    : "complete"
            }
            statusLabel={
              turn.pending || requiresInput
                ? (liveLabel ?? t("common.working"))
                : active
                  ? t("common.working")
                  : interrupted
                    ? t(
                        interruptionReason === "cancelled"
                          ? "common.stopped"
                          : "common.failed"
                      )
                    : t("common.completed")
            }
            durationLabel={
              // 回合还在跑（流式、等待审批、等待回答、后台任务）时耗时继续走，结束后定格在真实总耗时
              <TurnWorkDuration timing={timing} running={active} />
            }
            entries={(!hasWork
              ? []
              : approvalStream
                ? approvalActivityMembers
                : activityMembers
            ).map((message) => ({
              id: message.id,
              kind: message.content.some((part) => part.type === "tool-call")
                ? "tool"
                : "commentary",
              label: t("common.activity"),
              content: (
                <TurnContentContext value={{ ...context, mode: "work" }}>
                  {row(message.id, WorkMessage)}
                </TurnContentContext>
              ),
            }))}
            open={open}
            onOpenChange={updateOpen}
          />
        </div>
      ) : null}
      <TurnContentContext value={{ ...context, mode: "work" }}>
        {PersistentMessage && !approvalStream
          ? turn.persistent?.map((id) => row(id, PersistentMessage))
          : null}
        {NoticeMessage && !turn.running && !turn.pending
          ? currentMembers.map((message) => row(message.id, NoticeMessage))
          : null}
      </TurnContentContext>
      <div className="flex min-w-0 flex-col gap-1">
        {approvalStream ? (
          <TurnContentContext
            value={{
              ...context,
              mode: "approval",
              finalParts: {},
              summaryId: turn.assistants.at(-1),
            }}
          >
            <div
              data-slot="turn-approval-flow"
              className="flex min-w-0 flex-col gap-3"
            >
              {pendingApprovalMembers.map((message) =>
                row(message.id, Message)
              )}
            </div>
          </TurnContentContext>
        ) : null}
        {!approvalStream && declinedApprovalMembers.length ? (
          <TurnContentContext
            value={{
              ...context,
              mode: "approval-denied",
              finalParts: {},
              summaryId: turn.assistants.at(-1),
            }}
          >
            <div
              data-slot="turn-approval-outcome"
              className="flex min-w-0 flex-col gap-3"
            >
              {declinedApprovalMembers.map((message) =>
                row(message.id, Message)
              )}
            </div>
          </TurnContentContext>
        ) : null}
        {!approvalStream && finalId ? (
          <TurnContentContext
            value={{
              ...context,
              mode: hasWork || turn.persistent?.length ? "final" : "all",
              summaryId: turn.assistants.at(-1),
            }}
          >
            {row(finalId, Message)}
          </TurnContentContext>
        ) : null}
        {inlineGeneratingReply ? (
          <InlineGeneratingReply waiting={requiresInput} />
        ) : null}
      </div>
    </section>
  )
}
