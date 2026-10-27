"use client"

import type { ComponentProps, ReactNode } from "react"
import { ArrowUpIcon, ListTodoIcon, XIcon } from "lucide-react"
import { useT } from "@/hooks/use-t"
import { cn } from "@/lib/utils"
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace"
import { TooltipIconButton } from "./tooltip-icon-button"
import { ghostButton, mono } from "./surfaces"

export interface QueuedMessage {
  id: string
  text: string
}

// 消息队列：运行中的请求和待发送消息使用原生 Trace 组合展示
export function MessageQueue({
  queued,
  onCancel,
  collapsed = false,
  onCollapsedChange,
  children,
  className,
  ...props
}: Omit<ComponentProps<"div">, "children"> & {
  queued: readonly QueuedMessage[]
  onCancel?: (id: string) => void
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
  children?: ReactNode
}) {
  const t = useT()
  const count = t("common.queuedMessages", { n: queued.length })
  return (
    <Trace
      data-slot="message-queue"
      className={cn("w-full max-w-sm", className)}
      {...props}
    >
      {queued.length > 0 && (
        <TraceCollapsible
          open={!collapsed}
          onOpenChange={(open) => onCollapsedChange?.(!open)}
        >
          <TraceCollapsibleTrigger>
            <TraceLine>
              <TraceIcon>
                <ListTodoIcon />
              </TraceIcon>
              <TraceTitle>{count}</TraceTitle>
            </TraceLine>
          </TraceCollapsibleTrigger>
          <TraceCollapsibleContent>
            <Trace>
              {children ??
                queued.map((message, index) => (
                  <MessageQueueItem
                    key={message.id}
                    index={index}
                    text={message.text}
                    onCancel={onCancel ? () => onCancel(message.id) : undefined}
                  />
                ))}
            </Trace>
          </TraceCollapsibleContent>
        </TraceCollapsible>
      )}
    </Trace>
  )
}

export function MessageQueueItem({
  index,
  text,
  leading,
  preview,
  onCancel,
  children,
  className,
  ...props
}: Omit<ComponentProps<"div">, "children"> & {
  index: number
  text: ReactNode
  leading?: ReactNode
  preview?: ReactNode
  onCancel?: () => void
  children?: ReactNode
}) {
  const t = useT()
  return (
    <div
      data-slot="message-queue-item"
      className={cn(
        "group/item flex min-w-0 items-center gap-2 rounded-md bg-muted/70 px-2 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-muted",
        className
      )}
      {...props}
    >
      {leading ?? (
        <span
          className={cn(mono, "w-3 shrink-0 text-foreground/30 tabular-nums")}
        >
          {index + 1}
        </span>
      )}
      {preview}
      <span className="min-w-0 flex-1 truncate text-foreground/70">{text}</span>
      {children ?? (
        <ArrowUpIcon className="size-3 shrink-0 text-foreground/25" />
      )}
      {onCancel && (
        <TooltipIconButton
          type="button"
          tooltip={t("common.removeFromQueue")}
          onClick={onCancel}
          className={cn(ghostButton, "shrink-0")}
        >
          <XIcon />
        </TooltipIconButton>
      )}
    </div>
  )
}
