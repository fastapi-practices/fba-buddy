"use client"

import { useMemo, useState, useContext, type ReactNode } from "react"
import {
  useChatMessageState,
} from "@/features/chat/chat-runtime"
import type { ToolCallMessagePart } from "@/features/chat/thread-types"

import { Trace, TraceIcon, TraceLine, TraceTitle } from "@/components/ui/trace"
import { ToolCall } from "@/components/ai-elements/tool-call"
import { ToolFallback } from "@/components/ai-elements/tool-fallback"
import { ToolApproval } from "@/components/ai-elements/tool-approval"
import { toolNeedsApproval } from "@/components/ai-elements/tool-approval-state"
import { SourcesView } from "@/features/chat/message-sources"
import {
  researchSources,
  RESEARCH_TOOL_NAMES,
} from "@/features/chat/research-sources"
import { useT } from "@/hooks/use-t"
import { TurnContentContext, useTranscriptFind } from "./transcript"
import { parseTestReport } from "@/features/chat/test-report"
import {
  CHANGE_TOOL_NAMES,
  changeStatsFromResult,
} from "@/features/chat/file-changes"
import { TestRunTool } from "./test-run-tool"
import { ToolGroup } from "./tool-group"
import { StackTrace } from "./stack-trace"
import { TOOL_STEP_META, toolTarget } from "./tool-presentation"
import { GlobeIcon } from "lucide-react"

function stringifyToolValue(value: unknown): string {
  if (value == null) {
    return ""
  }
  if (typeof value === "string") {
    return value
  }
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function errorStack(value: unknown): string {
  if (typeof value === "string") return value
  if (value && typeof value === "object") {
    if ("stack" in value && typeof value.stack === "string") return value.stack
    if ("message" in value && typeof value.message === "string")
      return value.message
  }
  return stringifyToolValue(value)
}

type ToolFailurePart = {
  isError?: boolean
  status?: {
    type?: string
    reason?: string
    error?: unknown
  }
  result?: unknown
}

function isFailedTool(part: ToolFailurePart): boolean {
  if (part.isError) {
    return true
  }
  return part.status?.type === "incomplete" && part.status.reason === "error"
}

export const AssistantToolCall = (part: ToolCallMessagePart) => {
  const t = useT()
  const { mode } = useContext(TurnContentContext)
  const messageRunning = useChatMessageState(
    (state) => state.message.status?.type === "running"
  )
  const lifecycle = part.providerMetadata?.buddy?.status
  // 展开状态按运行阶段记忆，整轮结束后回到默认收起
  const phase = toolNeedsApproval(part)
    ? "requires-action"
    : messageRunning ||
        part.status?.type === "running" ||
        lifecycle === "running"
      ? "running"
      : "settled"
  const [openByPhase, setOpenByPhase] = useState<
    Partial<Record<typeof phase, boolean>>
  >({})
  const open = openByPhase[phase] === true
  const setOpen = (nextOpen: boolean) =>
    setOpenByPhase((previous) => ({ ...previous, [phase]: nextOpen }))
  const finding = Boolean(useTranscriptFind())
  const testReport =
    part.toolName === "run_tests" ? parseTestReport(part.result) : null

  if (lifecycle === "declined" || (lifecycle === "stopped" && !testReport)) {
    return (
      <ToolCall
        label={t(lifecycle === "declined" ? "common.denied" : "common.stopped")}
        activeLabel={t("common.working")}
        query={toolTarget(part.args, "")}
        request={part.argsText || stringifyToolValue(part.args)}
        result={stringifyToolValue(part.result)}
        running={false}
        outcome={lifecycle}
        icon={TOOL_STEP_META[part.toolName]?.icon}
        open={open}
        onOpenChange={setOpen}
      />
    )
  }

  if (part.toolName === "run_tests" && !toolNeedsApproval(part)) {
    return (
      <TestRunTool
        report={testReport}
        request={part.argsText || stringifyToolValue(part.args)}
        rawResult={stringifyToolValue(part.result)}
        query={toolTarget(part.args, "")}
        running={part.status?.type === "running" && part.result == null}
        open={open || finding}
        onOpenChange={setOpen}
      />
    )
  }

  if (isFailedTool(part)) {
    const error =
      part.status?.type === "incomplete" ? part.status.error : part.result
    return (
      <StackTrace
        stack={errorStack(error)}
        open={open || finding}
        onOpenChange={setOpen}
      />
    )
  }

  if (toolNeedsApproval(part)) {
    // 审批卡片只渲染在正文，执行过程里显示等待审批的轨迹
    if (mode === "approval" || mode === "approval-denied")
      return (
        <ToolApproval
          toolCallId={part.toolCallId}
          interrupt={part.interrupt}
          approval={part.approval}
          toolName={part.toolName}
          argsText={part.argsText}
        />
      )
    return (
      <ToolCall
        label={t(TOOL_STEP_META[part.toolName]?.verb ?? "common.toolRequest")}
        activeLabel={t("common.waitingApproval")}
        query={toolTarget(part.args, "")}
        request={part.argsText || stringifyToolValue(part.args)}
        result=""
        running
        waitingForUser
        icon={TOOL_STEP_META[part.toolName]?.icon}
        open={false}
        onOpenChange={() => {}}
      />
    )
  }

  if (part.status?.type === "incomplete") {
    return <ToolFallback {...part} />
  }

  if (RESEARCH_TOOL_NAMES.has(part.toolName)) {
    const results = researchSources(part.result)
    if (results.length > 0) {
      return (
        <SourcesView
          sources={results}
          open={finding || open}
          onOpenChange={setOpen}
        />
      )
    }
    if (part.status?.type === "running") {
      return (
        <TraceLine status="running">
          <TraceIcon>
            <GlobeIcon />
          </TraceIcon>
          <TraceTitle>{t("common.searching")}</TraceTitle>
        </TraceLine>
      )
    }
  }

  const meta = TOOL_STEP_META[part.toolName]
  const query = toolTarget(part.args, "")
  const stats = CHANGE_TOOL_NAMES.has(part.toolName)
    ? changeStatsFromResult(part.result)
    : undefined
  const changeStats =
    stats && (stats.additions || stats.deletions)
      ? { additions: stats.additions ?? 0, deletions: stats.deletions ?? 0 }
      : undefined
  return (
    <ToolCall
      label={meta ? t(meta.verb) : `${t("common.usedTool")} ${part.toolName}`}
      activeLabel={t(meta?.activeVerb ?? "common.working")}
      query={query}
      request={part.argsText || stringifyToolValue(part.args)}
      result={stringifyToolValue(part.result)}
      running={part.status?.type === "running" || lifecycle === "running"}
      changeStats={changeStats}
      open={open}
      onOpenChange={setOpen}
      icon={meta?.icon}
    />
  )
}

export function AssistantToolGroup({
  group,
  children,
}: {
  group: { indices: readonly number[]; status: { type: string } }
  children: ReactNode
}) {
  const t = useT()
  const finding = Boolean(useTranscriptFind())
  const parts = useChatMessageState((state) => state.message.content)
  const indices = group.indices
  const tools = useMemo(
    () =>
      indices.flatMap((index) => {
        const part = parts[index]
        return part?.type === "tool-call" ? [part] : []
      }),
    [indices, parts]
  )
  const gated = tools.some((part) => toolNeedsApproval(part))
  const streaming =
    group.status.type === "running" ||
    tools.some((part) => part.status?.type === "running")
  const phase = gated ? "requires-action" : streaming ? "running" : "settled"
  const [openByPhase, setOpenByPhase] = useState<
    Partial<Record<typeof phase, boolean>>
  >({})
  const open = openByPhase[phase] === true
  const setOpen = (nextOpen: boolean) =>
    setOpenByPhase((previous) => ({ ...previous, [phase]: nextOpen }))
  if (tools.length <= 1) return <Trace>{children}</Trace>

  return (
    <ToolGroup
      streaming={streaming}
      open={finding || open}
      onOpenChange={setOpen}
      activeLabel={t("common.working")}
      restingLabel={t("common.nSteps", { n: tools.length })}
      attention={gated}
    >
      {children}
    </ToolGroup>
  )
}
