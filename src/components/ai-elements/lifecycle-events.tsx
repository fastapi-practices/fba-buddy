import { useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  useChatMessageState,
  useChatRuntime,
} from "@/features/chat/chat-runtime"
import {
  ActivityIcon,
  ArchiveIcon,
  BotIcon,
  CopyIcon,
  DownloadIcon,
  PlayIcon,
  CheckIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  LoaderCircleIcon,
  CircleDashedIcon,
  CircleStopIcon,
  RouteIcon,
} from "lucide-react"
import {
  readRichEvents,
  isPersistentLifecycleEvent,
  latestLifecycleEvents,
  lifecycleStatus,
  persistentResourceUrl,
  type RichEvent,
} from "@/features/chat/rich-events"
import { WorkspaceActionsContext } from "@/features/chat/workspace-actions"
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard"
import { useT } from "@/hooks/use-t"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { downloadMediaSource } from "@/features/chat/media-transfer"
import { toast } from "@/components/ui/toast"
import type { PlanItem } from "@/api/chat-interactions"
import { useConversationAuxiliary } from "@/features/chat/conversation-auxiliary-context"
import { compactionSnapshot } from "@/features/chat/compaction-events"
import {
  planAwaitingExecution,
  planFromEvents,
  planProposalBody,
  proposalFromEvents,
} from "@/features/chat/plan-events"
import { PlanActionsContext } from "@/features/chat/plan-actions"
import { MarkdownText } from "./markdown-text"
import { TurnContentContext } from "./transcript"
import { Badge } from "@/components/ui/badge"
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockContent,
  CodeBlockCopyButton,
  CodeBlockHeader,
  CodeBlockTitle,
} from "@/components/ui/code-block"
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceDescription,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace"
import {
  controlDelegation,
  getDelegations,
  normalizeDelegationTaskId,
} from "@/api/delegations"
import { queryKeys } from "@/api/query-keys"
import { ApiError, apiErrorMessage } from "@/api/http"
import type { DelegationSnapshot } from "@/lib/types"



function lifecycleTimestamp(value: unknown) {
  return typeof value === "string"
    ? new Date(value).getTime()
    : typeof value === "number"
      ? value < 1e12
        ? value * 1000
        : value
      : NaN
}

function LifecycleDuration({
  value,
  active,
}: {
  value: Record<string, unknown>
  active: boolean
}) {
  const started = lifecycleTimestamp(value.started_at ?? value.startedAt)
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!active || !Number.isFinite(started)) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [active, started])
  const ended = lifecycleTimestamp(value.finished_at ?? value.finishedAt)
  const seconds =
    active && Number.isFinite(started)
      ? (now - started) / 1000
      : typeof value.duration_seconds === "number"
        ? value.duration_seconds
        : Number.isFinite(started) && (active || Number.isFinite(ended))
          ? ((active ? now : ended) - started) / 1000
          : null
  return seconds === null ? null : (
    <span className="shrink-0 tabular-nums">
      {Math.max(0, Math.round(seconds))}s
    </span>
  )
}

function subagentStatusText(
  status: ReturnType<typeof lifecycleStatus>,
  t: ReturnType<typeof useT>
) {
  if (status === "completed") return t("common.ran")
  if (status === "failed") return t("common.failed")
  if (status === "cancelled") return t("common.cancelled")
  if (status === "queued") return t("common.pending")
  return t("common.running")
}

function LifecycleLinks({
  value,
  url,
}: {
  value: Record<string, unknown>
  url: string | null
}) {
  const t = useT()
  return (
    <>
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline"
        >
          {url}
        </a>
      )}
      {typeof value.conversation_id === "string" && (
        <a
          href={`#/chat/${encodeURIComponent(value.conversation_id)}`}
          className="text-primary underline"
        >
          {t("common.openConversation")}
        </a>
      )}
      {typeof value.parent_conversation_id === "string" && (
        <a
          href={`#/chat/${encodeURIComponent(value.parent_conversation_id)}`}
          className="text-primary underline"
        >
          {t("common.parentConversation")}
        </a>
      )}
    </>
  )
}

type SubagentToolCall = {
  id: string
  name: string
  status?: ReturnType<typeof lifecycleStatus>
  input?: unknown
  output?: unknown
}

function subagentToolCalls(value: Record<string, unknown>): SubagentToolCall[] {
  const raw = value.tool_calls ?? value.toolCalls ?? value.steps ?? value.parts
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return []
    const row = item as Record<string, unknown>
    const name = row.name ?? row.tool_name ?? row.toolName ?? row.command
    if (typeof name !== "string" || !name) return []
    const output = row.output ?? row.result ?? row.content
    const input = row.input ?? row.args ?? row.arguments ?? row.request
    return [
      {
        id: String(
          row.id ?? row.tool_call_id ?? row.toolCallId ?? `${name}-${index}`
        ),
        name,
        status: lifecycleStatus({ name: "buddy.activity", value: row }),
        input,
        output,
      },
    ]
  })
}

function SubagentToolTrace({ call }: { call: SubagentToolCall }) {
  const t = useT()
  const failed = call.status === "failed" || call.status === "cancelled"
  const running = call.status === "running" || call.status === "queued"
  const input =
    typeof call.input === "string"
      ? call.input
      : call.input == null
        ? ""
        : JSON.stringify(call.input, null, 2)
  const output =
    typeof call.output === "string"
      ? call.output
      : call.output == null
        ? ""
        : JSON.stringify(call.output, null, 2)
  const detail = output || input
  const line = (
    <TraceLine status={failed ? "error" : running ? "running" : undefined}>
      <TraceIcon>
        {failed ? (
          <CircleAlertIcon />
        ) : running ? (
          <LoaderCircleIcon className="animate-spin" />
        ) : (
          <CircleCheckIcon />
        )}
      </TraceIcon>
      <TraceTitle>
        {failed
          ? `${t("common.failed")} ${call.name}`
          : running
            ? `${t("common.running")} ${call.name}`
            : `${t("common.ran")} ${call.name}`}
      </TraceTitle>
    </TraceLine>
  )
  if (!detail) return line
  return (
    <TraceCollapsible>
      <TraceCollapsibleTrigger>{line}</TraceCollapsibleTrigger>
      <TraceCollapsibleContent>
        <CodeBlock variant={failed ? "destructive" : "default"} size="sm">
          <CodeBlockContent wrap className="max-h-64">
            {detail}
          </CodeBlockContent>
        </CodeBlock>
      </TraceCollapsibleContent>
    </TraceCollapsible>
  )
}

type SubagentDelegation = {
  conversationId: string
  runId: string
  snapshot: DelegationSnapshot
}

function DelegationControls({
  conversationId,
  runId,
  taskId,
}: {
  conversationId: string
  runId: string
  taskId: string
}) {
  const t = useT()
  const queryClient = useQueryClient()
  const [steering, setSteering] = useState(false)
  const [text, setText] = useState("")
  const refreshSnapshot = () => {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.conversationDelegations(conversationId, runId),
    })
  }
  const reportError = (error: unknown) => {
    refreshSnapshot()
    toast.add({
      title:
        error instanceof ApiError && error.code === 409
          ? t("common.subagentEnded")
          : apiErrorMessage(error, t("common.requestFailed")),
      type: "error",
    })
  }
  const stop = useMutation({
    mutationFn: () =>
      controlDelegation(conversationId, taskId, {
        run_id: runId,
        action: "stop",
      }),
    onSuccess: refreshSnapshot,
    onError: reportError,
  })
  const steer = useMutation({
    mutationFn: (value: string) =>
      controlDelegation(conversationId, taskId, {
        run_id: runId,
        action: "steer",
        text: value,
      }),
    onSuccess: () => {
      setSteering(false)
      setText("")
      refreshSnapshot()
    },
    onError: reportError,
  })
  return (
    <div
      data-slot="delegation-controls"
      className="flex flex-col gap-2 rounded-md border border-border/70 p-3"
    >
      {steering ? (
        <Textarea
          autoFocus
          value={text}
          maxLength={8000}
          placeholder={t("common.guideSubagentPlaceholder")}
          onChange={(event) => setText(event.target.value)}
        />
      ) : null}
      <div className="flex flex-wrap gap-2">
        {steering ? (
          <>
            <Button
              size="sm"
              disabled={!text.trim() || steer.isPending}
              onClick={() => steer.mutate(text.trim())}
            >
              {t("common.send")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={steer.isPending}
              onClick={() => {
                setSteering(false)
                setText("")
              }}
            >
              {t("common.cancel")}
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={stop.isPending}
            onClick={() => setSteering(true)}
          >
            {t("common.steer")}
          </Button>
        )}
        <Button
          size="sm"
          variant="destructive"
          disabled={stop.isPending || steer.isPending}
          onClick={() => stop.mutate()}
        >
          {t("common.stop")}
        </Button>
      </div>
    </div>
  )
}

function SubagentEvent({
  value,
  active,
  superseded,
  delegation,
}: {
  value: Record<string, unknown>
  active: boolean
  superseded: boolean
  delegation?: SubagentDelegation
}) {
  const t = useT()
  const originalStatus = lifecycleStatus({ name: "buddy.subagent", value })
  const status =
    superseded && ["running", "queued"].includes(originalStatus)
      ? "cancelled"
      : originalStatus
  const running = status === "running"
  const failed = status === "failed"
  const output = value.output ?? value.summary ?? value.content
  const task = value.task ?? value.prompt ?? value.description
  const model = value.model_name ?? value.model
  const effort = value.reasoning_effort ?? value.effort
  const tools = Array.isArray(value.tools)
    ? value.tools.filter((item): item is string => typeof item === "string")
    : []
  const toolCalls = subagentToolCalls(value)
  const taskId = typeof value.task_id === "string" ? value.task_id.trim() : null
  const normalizedTaskId = taskId ? normalizeDelegationTaskId(taskId) : null
  const delegationTask =
    delegation?.snapshot.active && normalizedTaskId
      ? delegation.snapshot.tasks.find(
          (item) =>
            item.status === "running" &&
            normalizeDelegationTaskId(item.task_id) === normalizedTaskId
        )
      : undefined
  const duration = <LifecycleDuration value={value} active={active} />
  const url = persistentResourceUrl(value)
  const title = `${subagentStatusText(status, t)} ${String(
    value.agent_name ?? t("common.subagent")
  )}`
  const detail =
    typeof output === "string"
      ? output
      : output != null
        ? JSON.stringify(output, null, 2)
        : ""
  const line = (
    <TraceLine
      status={
        failed
          ? "error"
          : running
            ? "running"
            : status === "queued"
              ? "pending"
              : undefined
      }
    >
      <TraceIcon>
        {failed ? (
          <CircleAlertIcon />
        ) : running ? (
          <LoaderCircleIcon className="animate-spin" />
        ) : status === "queued" ? (
          <CircleDashedIcon />
        ) : status === "cancelled" ? (
          <CircleStopIcon />
        ) : (
          <CircleCheckIcon />
        )}
      </TraceIcon>
      <TraceTitle>{title}</TraceTitle>
      <TraceDescription>{duration}</TraceDescription>
    </TraceLine>
  )
  const hasDetails = Boolean(
    task ||
    model ||
    effort ||
    tools.length ||
    toolCalls.length ||
    detail ||
    delegationTask ||
    url ||
    typeof value.conversation_id === "string" ||
    typeof value.parent_conversation_id === "string"
  )

  // 受控展开：运行状态变化时跟随，用户手动折叠后不再被重置
  const [open, setOpen] = useState(running)
  const [syncedRunning, setSyncedRunning] = useState(running)
  if (syncedRunning !== running) {
    setSyncedRunning(running)
    setOpen(running)
  }

  if (!hasDetails) return line

  return (
    <TraceCollapsible open={open} onOpenChange={setOpen}>
      <TraceCollapsibleTrigger>{line}</TraceCollapsibleTrigger>
      <TraceCollapsibleContent keepMounted className="flex flex-col gap-3">
        {(model || effort || tools.length > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {typeof model === "string" && (
              <Badge variant="secondary">{model}</Badge>
            )}
            {typeof effort === "string" && (
              <Badge variant="outline">{effort}</Badge>
            )}
            {tools.map((tool) => (
              <Badge key={tool} variant="outline" className="font-mono">
                {tool}
              </Badge>
            ))}
          </div>
        )}
        {typeof task === "string" && (
          <p className="whitespace-pre-wrap">{task}</p>
        )}
        {toolCalls.length > 0 && (
          <Trace>
            {toolCalls.map((call) => (
              <SubagentToolTrace key={call.id} call={call} />
            ))}
          </Trace>
        )}
        {delegationTask && delegation ? (
          <DelegationControls
            conversationId={delegation.conversationId}
            runId={delegation.runId}
            taskId={delegationTask.task_id}
          />
        ) : null}
        {detail && (
          <CodeBlock variant={failed ? "destructive" : "default"} size="sm">
            <CodeBlockHeader>
              <CodeBlockTitle>{t("common.output")}</CodeBlockTitle>
              <CodeBlockActions>
                <CodeBlockCopyButton value={detail} />
              </CodeBlockActions>
            </CodeBlockHeader>
            <CodeBlockContent wrap className="max-h-64">
              {detail}
            </CodeBlockContent>
          </CodeBlock>
        )}
        <LifecycleLinks value={value} url={url} />
      </TraceCollapsibleContent>
    </TraceCollapsible>
  )
}

function PlanCard({
  items,
  proposal,
}: {
  items: PlanItem[]
  proposal?: { markdown: string; title?: string } | null
}) {
  const t = useT()
  const runtime = useChatRuntime()
  const { conversationId } = useContext(WorkspaceActionsContext)
  const actions = useContext(PlanActionsContext)
  const running = useChatMessageState((s) => s.thread.isRunning)
  const copy = useCopyToClipboard()
  const markdown =
    proposal?.markdown ??
    `# ${t("common.plan")}\n\n${items.map((item) => `- [${item.status === "completed" ? "x" : " "}] ${item.content}`).join("\n")}\n`
  const [executing, setExecuting] = useState(false)
  const [open, setOpen] = useState(true)
  const completed = items.filter((item) => item.status === "completed").length
  // 计划进行中：整轮在跑且还有未完成的步骤
  const planRunning =
    running && (items.length === 0 || completed < items.length)
  // 回合在跑或者计划已经推进过，就不再提供执行入口
  const executable = !running && planAwaitingExecution(items)
  const proposalBody = proposal ? planProposalBody(proposal.markdown) : ""
  const execute = async (newConversation = false) => {
    if (executing) return
    setExecuting(true)
    try {
      if (actions && conversationId)
        await actions.execute(markdown, newConversation)
      else {
        // 没有后端执行接口时，把计划作为一条消息发出去
        const prompt =
          `${runtime.composer.text}\n\n${t("common.executePlan")}\n\n${markdown}`.trim()
        runtime.composer.setText(prompt)
        await runtime.actions.sendText(prompt)
      }
    } catch (error) {
      toast.add({ title: String(error), type: "error" })
    } finally {
      setExecuting(false)
    }
  }
  return (
    <Trace className="my-3" data-slot="plan-card">
      <TraceCollapsible open={open} onOpenChange={setOpen}>
        <TraceCollapsibleTrigger>
          <TraceLine status={planRunning ? "running" : undefined}>
            <TraceIcon>
              <RouteIcon />
            </TraceIcon>
            <TraceTitle>
              {proposal?.title
                ? `${t("common.plan")}：${proposal.title}`
                : t("common.plan")}
            </TraceTitle>
            {items.length > 0 ? (
              <TraceDescription>
                {completed} / {items.length} {t("common.completed")}
              </TraceDescription>
            ) : null}
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent keepMounted>
          <div className="flex min-w-0 flex-col gap-3">
            {proposalBody ? (
              <div
                data-slot="plan-proposal"
                className="min-w-0 text-sm text-muted-foreground [&_.markdown-h1]:text-sm [&_.markdown-h1]:font-medium [&_.markdown-h2]:text-sm [&_.markdown-h2]:font-medium"
              >
                <MarkdownText text={proposalBody} />
              </div>
            ) : null}
            {items.length > 0 ? (
              <Trace data-slot="plan-steps" className="gap-2">
                {items.map((item) => {
                  const failed =
                    item.status === "blocked" || item.status === "cancelled"
                  const active = item.status === "in_progress"
                  const done = item.status === "completed"
                  return (
                    <TraceLine
                      key={item.id}
                      status={
                        failed
                          ? "error"
                          : active
                            ? "running"
                            : done
                              ? undefined
                              : "pending"
                      }
                      className="w-full"
                    >
                      <TraceIcon>
                        {failed ? (
                          <CircleAlertIcon />
                        ) : active ? (
                          <LoaderCircleIcon className="animate-spin" />
                        ) : done ? (
                          <CircleCheckIcon />
                        ) : (
                          <CircleDashedIcon />
                        )}
                      </TraceIcon>
                      <TraceTitle>{item.content}</TraceTitle>
                    </TraceLine>
                  )
                })}
              </Trace>
            ) : null}
          </div>
        </TraceCollapsibleContent>
      </TraceCollapsible>
      <div data-slot="plan-actions" className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void copy.copyToClipboard(markdown)}
        >
          {copy.isCopied ? <CheckIcon /> : <CopyIcon />}
          {t("common.copy")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            void downloadMediaSource(
              `data:text/markdown;charset=utf-8,${encodeURIComponent(markdown)}`,
              `plan-${conversationId ?? "draft"}.md`
            ).catch(() =>
              toast.add({ title: t("common.downloadFailed"), type: "error" })
            )
          }
        >
          <DownloadIcon />
          {t("common.savePlan")}
        </Button>
        {executable ? (
          <>
            <Button
              size="sm"
              variant="outline"
              disabled={running || executing}
              onClick={() => void execute()}
            >
              <PlayIcon />
              {t("common.executePlan")}
            </Button>
            {actions && conversationId && (
              <Button
                size="sm"
                variant="outline"
                disabled={executing}
                onClick={() => void execute(true)}
              >
                {t("common.executePlanNewConversation")}
              </Button>
            )}
          </>
        ) : null}
      </div>
    </Trace>
  )
}

function lifecycleGroupStatus(entries: readonly RichEvent[]) {
  const statuses = entries.map(lifecycleStatus)
  if (statuses.includes("running")) return "running" as const
  if (statuses.includes("failed")) return "error" as const
  if (statuses.includes("queued")) return "pending" as const
  return undefined
}

function LifecycleGroup({
  slot,
  title,
  entries,
  icon,
  children,
}: {
  slot: string
  title: string
  entries: readonly RichEvent[]
  icon: ReactNode
  children: ReactNode
}) {
  const t = useT()
  return (
    <section data-slot={slot} className="min-w-0">
      <Trace>
        <TraceCollapsible defaultOpen className="w-full min-w-0">
          <TraceCollapsibleTrigger>
            <TraceLine status={lifecycleGroupStatus(entries)}>
              <TraceIcon>{icon}</TraceIcon>
              <TraceTitle>{title}</TraceTitle>
              <TraceDescription>
                {t("common.itemsCount", { count: entries.length })}
              </TraceDescription>
            </TraceLine>
          </TraceCollapsibleTrigger>
          <TraceCollapsibleContent keepMounted>
            <Trace className="gap-1">{children}</Trace>
          </TraceCollapsibleContent>
        </TraceCollapsible>
      </Trace>
    </section>
  )
}

// 上下文压缩是一条过程线：压缩中 → 已压缩，展开后是压缩前后的对比
function CompactionEvent({ value }: { value: Record<string, unknown> }) {
  const t = useT()
  const snapshot = compactionSnapshot(value)
  const { running, failed } = snapshot
  const title = failed
    ? t("common.compactionFailed")
    : running
      ? t("common.compacting")
      : t("common.contextCompacted")
  const tokenDelta = snapshot.tokenDelta
  const line = (
    <TraceLine status={failed ? "error" : running ? "running" : undefined}>
      <TraceIcon>
        {failed ? (
          <CircleAlertIcon />
        ) : running ? (
          <LoaderCircleIcon className="animate-spin" />
        ) : (
          <ArchiveIcon />
        )}
      </TraceIcon>
      <TraceTitle>{title}</TraceTitle>
      {tokenDelta ? <TraceDescription>{tokenDelta}</TraceDescription> : null}
    </TraceLine>
  )
  const rows = [
    snapshot.tokenRow
      ? { label: t("common.compactionTokens"), value: snapshot.tokenRow }
      : undefined,
    snapshot.messageRow
      ? { label: t("common.compactionMessages"), value: snapshot.messageRow }
      : undefined,
  ].filter((row): row is { label: string; value: string } => Boolean(row))
  const summary = snapshot.summary
  if (!rows.length && !summary) return line
  return (
    <TraceCollapsible>
      <TraceCollapsibleTrigger>{line}</TraceCollapsibleTrigger>
      <TraceCollapsibleContent keepMounted className="flex flex-col gap-1.5">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-3 text-xs"
          >
            <span className="text-muted-foreground">{row.label}</span>
            <span className="tabular-nums">{row.value}</span>
          </div>
        ))}
        {summary ? (
          <p className="text-xs whitespace-pre-wrap text-muted-foreground">
            {summary}
          </p>
        ) : null}
      </TraceCollapsibleContent>
    </TraceCollapsible>
  )
}

function LifecycleEntry({
  entry,
  active,
  superseded,
  delegation,
}: {
  entry: RichEvent
  active: boolean
  superseded: boolean
  delegation?: SubagentDelegation
}) {
  const t = useT()
  const value = entry.value
  if (entry.name === "buddy.subagent")
    return (
      <SubagentEvent
        value={value}
        active={active}
        superseded={superseded}
        delegation={delegation}
      />
    )
  if (
    entry.name === "buddy.compaction" ||
    value.activityType === "pydantic_ai_compaction"
  )
    return <CompactionEvent value={value} />
  const title = String(value.title ?? value.name ?? t("common.backgroundTasks"))
  const rawDetail = value.output ?? value.task ?? value.summary ?? value.content
  const detail =
    typeof rawDetail === "string"
      ? rawDetail
      : JSON.stringify(rawDetail, null, 2)
  const url = persistentResourceUrl(value)
  const line = (
    <TraceLine>
      <TraceIcon>
        <ActivityIcon />
      </TraceIcon>
      <TraceTitle>{title}</TraceTitle>
    </TraceLine>
  )
  return (
    <TraceCollapsible>
      <TraceCollapsibleTrigger>{line}</TraceCollapsibleTrigger>
      <TraceCollapsibleContent keepMounted className="flex flex-col gap-3">
        <p className="whitespace-pre-wrap">{detail}</p>
        <LifecycleLinks value={value} url={url} />
      </TraceCollapsibleContent>
    </TraceCollapsible>
  )
}

export function LifecycleEvents({
  planOnly = false,
  scope = "all",
}: {
  planOnly?: boolean
  // 压缩发生在这一轮开工之前，要单独排到执行过程的最前面
  scope?: "all" | "compaction" | "other"
}) {
  const t = useT()
  const { plan: storedPlanDetail } = useConversationAuxiliary()
  const context = useChatMessageState(
    (s) => s.message.metadata?.custom?.turnContext
  ) as Record<string, unknown> | undefined
  const messageId = useChatMessageState((s) => s.message.id)
  const runId = useChatMessageState((s) => {
    const workTiming = s.message.metadata?.custom?.workTiming
    return typeof workTiming === "object" &&
      workTiming !== null &&
      "runId" in workTiming &&
      typeof workTiming.runId === "string"
      ? workTiming.runId
      : null
  })
  const { conversationId } = useContext(WorkspaceActionsContext)
  const turn = useContext(TurnContentContext)
  const originalEvents = useMemo(
    () => readRichEvents(context?.lifecycle_events),
    [context]
  )
  const events = useMemo(() => {
    if (planOnly || !turn.lifecycleEvents) return originalEvents
    return [
      ...originalEvents.filter(
        (event) =>
          !["buddy.subagent", "buddy.activity", "buddy.compaction"].includes(
            event.name
          )
      ),
      ...(turn.lifecycleEvents[messageId] ?? []),
    ]
  }, [
    originalEvents,
    planOnly,
    turn.lifecycleEvents,
    messageId,
  ])
  const plan = useMemo(() => planFromEvents(events), [events])
  const proposal = useMemo(() => proposalFromEvents(events), [events])
  const latest = useChatMessageState(
    (s) =>
      s.thread.messages.findLast((item) => item.role === "assistant")?.id ===
      s.message.id
  )
  const hasPlan = events.some((item) => item.name === "buddy.planning")
  const storedPlan = storedPlanDetail?.items ?? []
  const entries = useMemo(() => {
    const rows = events.filter(
      (event) =>
        event.name === "buddy.subagent" ||
        event.name === "buddy.activity" ||
        event.name === "buddy.compaction"
    )
    return turn.lifecycleEvents ? rows : latestLifecycleEvents(rows)
  }, [events, turn.lifecycleEvents, turn.supersededAttempt])
  const groups = useMemo(
    () => ({
      subagents: entries.filter((entry) => entry.name === "buddy.subagent"),
      backgroundTasks: entries.filter(
        (entry) =>
          entry.name === "buddy.activity" &&
          entry.value.activityType !== "pydantic_ai_compaction"
      ),
      compactions: entries.filter(
        (entry) =>
          entry.name === "buddy.compaction" ||
          entry.value.activityType === "pydantic_ai_compaction"
      ),
    }),
    [entries]
  )
  const delegationQuery = useQuery({
    queryKey: queryKeys.conversationDelegations(
      conversationId ?? "",
      runId ?? ""
    ),
    queryFn: ({ signal }) => {
      if (!conversationId || !runId) {
        throw new Error("Conversation and run are required for delegations")
      }
      return getDelegations(conversationId, runId, signal)
    },
    enabled: Boolean(conversationId && runId && groups.subagents.length > 0),
    retry: false,
    refetchInterval: (query) => (query.state.data?.active ? 2000 : false),
  })
  const delegation =
    conversationId && runId && delegationQuery.data?.active
      ? {
          conversationId,
          runId,
          snapshot: delegationQuery.data,
        }
      : undefined
  if (planOnly) {
    const items = hasPlan ? plan : latest ? storedPlan : []
    return items.length || proposal ? (
      <PlanCard items={items} proposal={proposal} />
    ) : null
  }
  const shown = {
    subagents: scope === "compaction" ? [] : groups.subagents,
    backgroundTasks: scope === "compaction" ? [] : groups.backgroundTasks,
    compactions: scope === "other" ? [] : groups.compactions,
  }
  const hasEntries =
    shown.subagents.length > 0 ||
    shown.backgroundTasks.length > 0 ||
    shown.compactions.length > 0
  // 没有内容时不要留空壳，否则会多出一段空白间距
  if (!hasEntries) return null
  const renderEntries = (items: readonly RichEvent[]) =>
    items.map((entry, index) => (
      <LifecycleEntry
        key={`${entry.name}:${index}`}
        entry={entry}
        active={!turn.supersededAttempt && isPersistentLifecycleEvent(entry)}
        superseded={Boolean(turn.supersededAttempt)}
        delegation={entry.name === "buddy.subagent" ? delegation : undefined}
      />
    ))
  return (
    <div
      data-slot="lifecycle-events"
      className="my-2 flex min-w-0 flex-col gap-2 text-sm"
    >
      {shown.subagents.length ? (
        <LifecycleGroup
          slot="subagent-events"
          title={t("common.subagents")}
          entries={shown.subagents}
          icon={<BotIcon />}
        >
          {renderEntries(shown.subagents)}
        </LifecycleGroup>
      ) : null}
      {shown.backgroundTasks.length ? (
        <LifecycleGroup
          slot="background-tasks"
          title={t("common.backgroundTasks")}
          entries={shown.backgroundTasks}
          icon={<ActivityIcon />}
        >
          {renderEntries(shown.backgroundTasks)}
        </LifecycleGroup>
      ) : null}
      {shown.compactions.length ? (
        <div
          data-slot="context-compaction"
          className="flex min-w-0 flex-col gap-1"
        >
          {renderEntries(shown.compactions)}
        </div>
      ) : null}
    </div>
  )
}
