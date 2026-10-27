"use client"

import type { ReactNode } from "react"
import { AlertCircleIcon, LayersIcon } from "lucide-react"
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace"
import { useTranscriptFind } from "./transcript"
import { useT } from "@/hooks/use-t"

// 连续工具调用按 shadcn Trace 的 Chain of Thought 组合展示
export function ToolGroup({
  streaming,
  open,
  onOpenChange,
  restingLabel,
  activeLabel,
  attention,
  children,
}: {
  streaming: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  restingLabel: string
  activeLabel: string
  attention?: boolean
  children: ReactNode
}) {
  const t = useT()
  const finding = Boolean(useTranscriptFind())
  return (
    <Trace className="min-w-0">
      <TraceCollapsible
        data-slot="tool-group"
        open={open || finding}
        onOpenChange={onOpenChange}
        className="w-full min-w-0"
      >
        <TraceCollapsibleTrigger>
          <TraceLine status={streaming ? "running" : undefined}>
            <TraceIcon>
              <LayersIcon />
            </TraceIcon>
            <TraceTitle>{streaming ? activeLabel : restingLabel}</TraceTitle>
            {attention ? (
              <>
                <TraceIcon className="text-destructive">
                  <AlertCircleIcon />
                </TraceIcon>
                <span className="sr-only">
                  {t("common.activityNeedsAttention")}
                </span>
              </>
            ) : null}
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent keepMounted>
          <Trace className="gap-2">{children}</Trace>
        </TraceCollapsibleContent>
      </TraceCollapsible>
    </Trace>
  )
}
