"use client"

import { memo, useCallback, useState } from "react"
import {
  AlertCircleIcon,
  CheckIcon,
  WrenchIcon,
  XCircleIcon,
  type LucideIcon,
} from "lucide-react"
import {
  useChatMessagePart,
  useChatMessageState,
  useChatRuntimeState,
} from "@/features/chat/chat-runtime"
import type {
  ToolCallMessagePart,
  ToolCallMessagePartStatus,
} from "@/features/chat/thread-types"
import { useLiveElapsed } from "@/hooks/use-live-elapsed"
import { liveToolTiming } from "@/features/chat/work-timing"
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
import { cn } from "@/lib/utils"
import { useT } from "@/hooks/use-t"
import { useTranscriptFind } from "./transcript"
import { ToolValue } from "./tool-value"

type ToolFallbackRootProps = Omit<
  React.ComponentProps<typeof TraceCollapsible>,
  "open" | "onOpenChange"
> & {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  defaultOpen?: boolean
}

function ToolFallbackRoot({
  className,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  defaultOpen = false,
  children,
  ...props
}: ToolFallbackRootProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen)
  const finding = Boolean(useTranscriptFind())

  const isControlled = controlledOpen !== undefined
  const isOpen = isControlled ? controlledOpen : uncontrolledOpen

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!isControlled) {
        setUncontrolledOpen(open)
      }
      controlledOnOpenChange?.(open)
    },
    [isControlled, controlledOnOpenChange]
  )

  return (
    <Trace className="min-w-0">
      <TraceCollapsible
        data-slot="tool-fallback-root"
        open={isOpen || finding}
        onOpenChange={handleOpenChange}
        className={cn("tool-fallback-root w-full min-w-0", className)}
        {...props}
      >
        {children}
      </TraceCollapsible>
    </Trace>
  )
}

type ToolStatus = ToolCallMessagePartStatus["type"]

const statusIconMap: Record<ToolStatus, LucideIcon> = {
  running: WrenchIcon,
  complete: CheckIcon,
  incomplete: XCircleIcon,
  "requires-action": AlertCircleIcon,
}

const formatToolDuration = (ms: number) => {
  if (ms < 1000) return "<1s"
  const seconds = ms / 1000
  if (seconds < 10) return `${(Math.floor(seconds * 10) / 10).toFixed(1)}s`
  if (seconds < 60) return `${Math.floor(seconds)}s`
  return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`
}

function ToolFallbackDuration({
  className,
  ...props
}: React.ComponentProps<"span">) {
  const part = useChatMessagePart()
  const messageRunning = useChatMessageState(
    (state) => state.message.status?.type === "running"
  )
  // 工具在等待用户回答时消息文本可能已经结束，整轮仍在运行就继续计时
  const turnRunning = useChatRuntimeState((state) => state.thread.isRunning)
  const timing = part?.type === "tool-call" ? part.timing : undefined
  const toolRunning =
    part?.type === "tool-call" && part.status?.type === "running"
  const elapsedMs = useLiveElapsed(
    liveToolTiming({ toolRunning, messageRunning, turnRunning }),
    timing?.startedAt,
    timing?.completedAt
  )
  if (elapsedMs === undefined) return null

  return (
    <TraceDescription
      data-slot="tool-fallback-duration"
      className={cn("tool-fallback-duration", className)}
      {...props}
    >
      {formatToolDuration(elapsedMs)}
    </TraceDescription>
  )
}

function ToolFallbackTrigger({
  toolName,
  status,
  failed = false,
  className,
  ...props
}: React.ComponentProps<typeof TraceCollapsibleTrigger> & {
  toolName: string
  status?: ToolCallMessagePartStatus
  failed?: boolean
}) {
  const t = useT()
  const statusType = status?.type ?? "complete"
  const isRunning = statusType === "running"
  const isCancelled =
    status?.type === "incomplete" && status.reason === "cancelled"

  const Icon = failed ? XCircleIcon : statusIconMap[statusType]
  const label = failed
    ? t("common.toolCallFailed")
    : isCancelled
      ? "Cancelled tool"
      : "Used tool"

  return (
    <TraceCollapsibleTrigger
      data-slot="tool-fallback-trigger"
      className={className}
      {...props}
    >
      <TraceLine
        status={
          failed
            ? "error"
            : isRunning
              ? "running"
              : statusType === "requires-action"
                ? "pending"
                : undefined
        }
        className={cn(isCancelled && "line-through")}
      >
        <TraceIcon>
          <Icon />
        </TraceIcon>
        <TraceTitle>
          {label}: {toolName}
        </TraceTitle>
        <ToolFallbackDuration />
      </TraceLine>
    </TraceCollapsibleTrigger>
  )
}

function ToolFallbackContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof TraceCollapsibleContent>) {
  return (
    <TraceCollapsibleContent
      data-slot="tool-fallback-content"
      keepMounted
      className={cn(
        "tool-fallback-content flex flex-col gap-2 pt-1 pb-2 text-sm outline-none",
        className
      )}
      {...props}
    >
      {children}
    </TraceCollapsibleContent>
  )
}

function ToolFallbackArgs({
  argsText,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  argsText?: string
}) {
  if (!argsText) return null

  return (
    <div
      data-slot="tool-fallback-args"
      className={cn("tool-fallback-args", className)}
      {...props}
    >
      <ToolValue value={argsText} />
    </div>
  )
}

function ToolFallbackResult({
  result,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  result?: unknown
}) {
  if (result === undefined) return null

  return (
    <div
      data-slot="tool-fallback-result"
      className={cn("tool-fallback-result", className)}
      {...props}
    >
      <p className="tool-fallback-result-header text-xs font-medium text-muted-foreground">
        Result:
      </p>
      <ToolValue
        value={
          typeof result === "string" ? result : JSON.stringify(result, null, 2)
        }
      />
    </div>
  )
}

function ToolFallbackError({
  status,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  status?: ToolCallMessagePartStatus
}) {
  if (status?.type !== "incomplete") return null

  const error = status.error
  const errorText = error
    ? typeof error === "string"
      ? error
      : JSON.stringify(error)
    : null

  if (!errorText) return null

  const isCancelled = status.reason === "cancelled"
  const headerText = isCancelled ? "Cancelled reason:" : "Error:"

  return (
    <div
      data-slot="tool-fallback-error"
      className={cn("tool-fallback-error", className)}
      {...props}
    >
      <p className="tool-fallback-error-header font-semibold text-muted-foreground">
        {headerText}
      </p>
      <p className="tool-fallback-error-reason text-muted-foreground">
        {errorText}
      </p>
    </div>
  )
}

const ToolFallbackImpl = ({
  toolName,
  argsText,
  result,
  status,
  isError,
}: ToolCallMessagePart) => {
  const isCancelled =
    status?.type === "incomplete" && status.reason === "cancelled"
  const isRequiresAction = status?.type === "requires-action"
  const failed =
    isError || (status?.type === "incomplete" && status.reason === "error")

  const messageRunning = useChatMessageState(
    (state) => state.message.status?.type === "running"
  )
  const phase = isRequiresAction
    ? "requires-action"
    : messageRunning || status?.type === "running"
      ? "running"
      : "settled"
  const [openByPhase, setOpenByPhase] = useState<
    Partial<Record<typeof phase, boolean>>
  >({})
  const open = openByPhase[phase] ?? false
  const setOpen = (nextOpen: boolean) =>
    setOpenByPhase((previous) => ({ ...previous, [phase]: nextOpen }))

  return (
    <ToolFallbackRoot open={open} onOpenChange={setOpen}>
      <ToolFallbackTrigger
        toolName={toolName}
        status={status}
        failed={failed}
      />
      <ToolFallbackContent>
        <ToolFallbackError status={status} />
        <ToolFallbackArgs
          argsText={argsText}
          className={cn(isCancelled && "opacity-60")}
        />
        {!isCancelled && <ToolFallbackResult result={result} />}
      </ToolFallbackContent>
    </ToolFallbackRoot>
  )
}

const ToolFallback = memo(
  ToolFallbackImpl
) as unknown as React.ComponentType<ToolCallMessagePart> & {
  Root: typeof ToolFallbackRoot
  Trigger: typeof ToolFallbackTrigger
  Content: typeof ToolFallbackContent
  Args: typeof ToolFallbackArgs
  Result: typeof ToolFallbackResult
  Error: typeof ToolFallbackError
}

ToolFallback.displayName = "ToolFallback"
ToolFallback.Root = ToolFallbackRoot
ToolFallback.Trigger = ToolFallbackTrigger
ToolFallback.Content = ToolFallbackContent
ToolFallback.Args = ToolFallbackArgs
ToolFallback.Result = ToolFallbackResult
ToolFallback.Error = ToolFallbackError

export {
  ToolFallback,






}
