"use client"

import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { CollapsibleContent } from "@/components/ui/collapsible"
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleTrigger,
  TraceDescription,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace"
import { ThinkingIndicator } from "./thinking-indicator"
import { TURN_DISCLOSURE_CLASS } from "@/hooks/use-turn-disclosure"

export type RunActivityStatus =
  | "running"
  | "requires-action"
  | "complete"
  | "cancelled"
  | "incomplete"
  | "error"
export type RunActivityEntry = {
  id: string
  kind: "commentary" | "tool"
  label: string
  content: ReactNode
}

// 回合顶部唯一的运行状态行：执行中显示实时状态，结束后收成一行耗时
export function RunActivity({
  status,
  statusLabel,
  durationLabel,
  entries,
  open,
  onOpenChange,
  attention,
  children,
  className,
  turnPhase,
  liveLabel,
}: {
  status: RunActivityStatus
  statusLabel: string
  durationLabel?: ReactNode
  entries: readonly RunActivityEntry[]
  open: boolean
  onOpenChange: (open: boolean) => void
  attention?: ReactNode
  children?: ReactNode
  className?: string
  turnPhase?: string
  liveLabel?: string
}) {
  const running = status === "running"
  const requiresAction = status === "requires-action"
  const failed = status === "incomplete" || status === "error"
  const line = (
    <TraceLine
      status={running ? "running" : failed ? "error" : undefined}
      className="min-h-7"
    >
      {running ? (
        <TraceIcon>
          <ThinkingIndicator active />
        </TraceIcon>
      ) : null}
      <TraceTitle>
        {running ? (liveLabel ?? statusLabel) : statusLabel}
      </TraceTitle>
      {durationLabel != null ? (
        <TraceDescription>{durationLabel}</TraceDescription>
      ) : null}
    </TraceLine>
  )
  return (
    <Trace className={cn("min-w-0", className)}>
      <TraceCollapsible
        data-slot="run-activity"
        data-status={status}
        data-turn-phase={turnPhase}
        open={open}
        onOpenChange={onOpenChange}
        className="min-w-0"
      >
        <TraceCollapsibleTrigger
          data-slot={entries.length === 0 ? "turn-working-header" : undefined}
          aria-busy={running}
          iconVisibility={running || requiresAction ? "hover" : "always"}
          className="w-fit max-w-full"
        >
          {line}
        </TraceCollapsibleTrigger>
        <CollapsibleContent
          className={cn(TURN_DISCLOSURE_CLASS, "min-w-0")}
          inert={!open}
          aria-hidden={!open}
        >
          <div
            data-slot={running ? "turn-running-work" : "turn-work-content"}
            className="flex min-w-0 flex-col gap-2 pt-2 pb-1 text-sm wrap-break-word [&_*:last-child]:mb-0"
          >
            {entries.map((entry) => (
              <div
                key={entry.id}
                data-activity-kind={entry.kind}
                className="min-w-0 empty:hidden has-[>[data-work-message-id]:empty]:hidden"
              >
                {entry.content}
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </TraceCollapsible>
      <span role="status" aria-atomic="true" className="sr-only">
        {statusLabel}
      </span>
      {attention}
      {children}
    </Trace>
  )
}
