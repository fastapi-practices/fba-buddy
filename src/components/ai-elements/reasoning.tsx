"use client"

import { memo, useState, type PropsWithChildren } from "react"
import { BrainIcon } from "lucide-react"
import {
  ChatPartProvider,
  useChatMessageState,
} from "@/features/chat/chat-runtime"
import type { ReasoningMessagePart } from "@/features/chat/thread-types"
import { MarkdownText } from "@/components/ai-elements/markdown-text"
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
import { useT } from "@/hooks/use-t"
import { formatLiveDuration, useLiveElapsed } from "@/hooks/use-live-elapsed"
import { useTranscriptFind } from "./transcript"

const ReasoningImpl = ({ text, status, timing }: ReasoningMessagePart) => {
  const t = useT()
  const finding = Boolean(useTranscriptFind())
  const messageRunning = useChatMessageState(
    (s) => s.message.status?.type === "running"
  )
  const running = messageRunning && status?.type === "running"
  const elapsedMs = useLiveElapsed(
    running,
    timing?.startedAt,
    timing?.completedAt
  )
  const duration =
    elapsedMs === undefined ? undefined : formatLiveDuration(elapsedMs, running)
  const [open, setOpen] = useState<boolean>()

  const line = (
    <TraceLine status={running ? "running" : undefined}>
      <TraceIcon>
        <BrainIcon
          className={
            running
              ? "size-3.5 animate-pulse motion-reduce:animate-none"
              : "size-3.5"
          }
        />
      </TraceIcon>
      <TraceTitle>
        <span
          key={running ? "thinking" : "thought"}
          className="motion-safe:animate-in motion-safe:duration-300 motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1"
        >
          {running
            ? duration
              ? t("common.deepThinkingInProgress")
              : t("common.deepThinking")
            : duration
              ? t("common.deepThoughtWithDuration")
              : t("common.thought")}
        </span>
      </TraceTitle>
      {duration ? <TraceDescription>{duration}</TraceDescription> : null}
    </TraceLine>
  )

  if (text.length === 0) return line

  return (
    <TraceCollapsible
      open={finding || (open ?? running)}
      onOpenChange={setOpen}
    >
      <TraceCollapsibleTrigger>{line}</TraceCollapsibleTrigger>
      <TraceCollapsibleContent aria-busy={running}>
        <ChatPartProvider part={{ type: "reasoning", text, status, timing }}>
          <MarkdownText text={text} />
        </ChatPartProvider>
      </TraceCollapsibleContent>
    </TraceCollapsible>
  )
}

function AssistantReasoningGroup({ children }: PropsWithChildren) {
  return <Trace className="gap-2">{children}</Trace>
}

const Reasoning = memo(ReasoningImpl)
Reasoning.displayName = "Reasoning"

export { Reasoning, AssistantReasoningGroup }
