"use client"

import type { ReactNode } from "react"
import { WrenchIcon, type LucideIcon } from "lucide-react"
import {
  useChatMessagePart,
  useChatMessageState,
  useChatRuntimeState,
} from "@/features/chat/chat-runtime"

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
import { CodeBlock, CodeBlockContent } from "@/components/ui/code-block"
import { useT } from "@/hooks/use-t"
import { cn } from "@/lib/utils"
import { useTranscriptFind } from "./transcript"
import { formatLiveDuration, useLiveElapsed } from "@/hooks/use-live-elapsed"
import { liveToolTiming } from "@/features/chat/work-timing"

export function ToolCall({
  label,
  activeLabel,
  query,
  request,
  result,
  resultContent,
  running,
  waitingForUser,
  changeStats,
  outcome,
  open,
  onOpenChange,
  className,
  icon: Icon,
}: {
  label: string
  activeLabel: string
  query: string
  request: string
  result: string
  resultContent?: ReactNode
  running: boolean
  /** 等待用户处理，计时不受整轮运行状态影响 */
  waitingForUser?: boolean
  /** 编辑操作的增删行数，显示在轨迹描述里 */
  changeStats?: { additions: number; deletions: number }
  outcome?: "declined" | "stopped" | "failed" | "unknown"
  open: boolean
  onOpenChange: (open: boolean) => void
  className?: string
  icon?: LucideIcon
}) {
  const t = useT()
  const finding = Boolean(useTranscriptFind())
  const part = useChatMessagePart()
  const messageRunning = useChatMessageState(
    (state) => state.message.status?.type === "running"
  )
  // 工具在等待用户回答时消息文本可能已经结束，整轮仍在运行就继续计时
  const turnRunning = useChatRuntimeState((state) => state.thread.isRunning)
  const timing = part?.type === "tool-call" ? part.timing : undefined
  const elapsedMs = useLiveElapsed(
    liveToolTiming({
      toolRunning: running,
      messageRunning,
      turnRunning,
      waitingForUser,
    }),
    timing?.startedAt,
    timing?.completedAt
  )
  const duration =
    elapsedMs === undefined ? undefined : formatLiveDuration(elapsedMs, running)
  const failed = outcome === "failed"
  const hasOutput = Boolean(resultContent || result.trim())
  const title = `${label}${query ? ` ${query}` : ""}`
  const changes = changeStats
    ? `${changeStats.additions ? `+${changeStats.additions} ` : ""}${
        changeStats.deletions ? `−${changeStats.deletions}` : ""
      }`.trim()
    : ""
  const line = (
    <TraceLine status={running ? "running" : failed ? "error" : undefined}>
      <TraceIcon>{Icon ? <Icon /> : <WrenchIcon />}</TraceIcon>
      <TraceTitle>{running ? `${activeLabel} ${query}` : title}</TraceTitle>
      {changes || duration ? (
        <TraceDescription>
          {changes ? (
            <span className="font-mono tabular-nums">
              {changeStats!.additions ? (
                <span className="text-[var(--diff-added)]">
                  +{changeStats!.additions}
                </span>
              ) : null}{" "}
              {changeStats!.deletions ? (
                <span className="text-[var(--diff-removed)]">
                  −{changeStats!.deletions}
                </span>
              ) : null}
            </span>
          ) : null}
          {changes && duration ? " · " : null}
          {duration}
        </TraceDescription>
      ) : null}
    </TraceLine>
  )

  if (
    running ||
    !hasOutput ||
    outcome === "declined" ||
    outcome === "stopped"
  )
    return (
      <Trace
        data-slot="tool-call"
        data-outcome={running ? "running" : (outcome ?? "success")}
      >
        {line}
      </Trace>
    )

  return (
    <Trace>
      <TraceCollapsible
        data-slot="tool-call"
        data-outcome={outcome ?? "success"}
        open={open || finding}
        onOpenChange={onOpenChange}
        className={cn("w-full min-w-0", className)}
      >
        <TraceCollapsibleTrigger>{line}</TraceCollapsibleTrigger>
        <TraceCollapsibleContent
          keepMounted
          className="flex min-w-0 flex-col gap-2 outline-none"
        >
          {request ? (
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-xs font-medium text-muted-foreground">
                {t("common.toolRequest")}
              </p>
              <CodeBlock size="sm">
                <CodeBlockContent wrap className="max-h-40">
                  {request}
                </CodeBlockContent>
              </CodeBlock>
            </div>
          ) : null}
          {resultContent || result ? (
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-xs font-medium text-muted-foreground">
                {failed ? t("common.failed") : t("common.toolResult")}
              </p>
              {resultContent ?? (
                <CodeBlock
                  size="sm"
                  variant={failed ? "destructive" : "default"}
                >
                  <CodeBlockContent wrap className="max-h-64">
                    {result}
                  </CodeBlockContent>
                </CodeBlock>
              )}
            </div>
          ) : null}
        </TraceCollapsibleContent>
      </TraceCollapsible>
    </Trace>
  )
}
