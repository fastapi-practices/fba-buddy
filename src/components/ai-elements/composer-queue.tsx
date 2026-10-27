"use client"

import { useRef, useState } from "react"
import { CornerDownRightIcon, PencilIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TooltipHint } from "@/components/ui/tooltip"
import {
  Attachment,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment"
import { getMimeTypeIcon } from "./file"
import { TooltipIconButton } from "./tooltip-icon-button"
import { useT } from "@/hooks/use-t"
import { cn } from "@/lib/utils"
import { MessageQueue, MessageQueueItem } from "./message-queue"
import { ghostButton, mono } from "./surfaces"
import { useQueueComposer } from "@/features/chat/queue-composer-context"
import {
  base64ByteSize,
  formatAttachmentSize,
  formatMimeLabel,
} from "@/features/chat/attachments"
import { useChatRuntime } from "@/features/chat/chat-runtime"
import type {
  ChatSubmission,
  QueueItemState,
} from "@/features/chat/thread-types"

export type SaveQueuedMessage = (
  id: string,
  message: ChatSubmission
) => Promise<void>

export function ComposerQueue({ onEdit }: { onEdit?: SaveQueuedMessage }) {
  const runtime = useChatRuntime()
  const queueComposer = useQueueComposer()
  const [collapsed, setCollapsed] = useState(false)
  const draggedRef = useRef<string | null>(null)
  // 队列只在正在回复时出现，其余时间没有待派发的消息
  if (!runtime.thread.isRunning || !runtime.queue?.items.length) return null
  return (
    <div
      data-slot="composer-queue"
      className="mb-2 flex min-w-0 flex-col gap-1.5"
    >
      <MessageQueue
        queued={runtime.queue.items.map((item) => ({
          id: item.id,
          text: item.parts
            .flatMap((part) => (part.type === "text" ? [part.text] : []))
            .join("\n"),
        }))}
        className="max-w-none"
        collapsed={collapsed}
        onCollapsedChange={setCollapsed}
      >
        {runtime.queue.items.map((item, index) => (
          <QueueRow
            key={item.id}
            item={item}
            index={index}
            items={runtime.queue!.items}
            onEdit={
              queueComposer?.begin ?? (onEdit ? () => undefined : undefined)
            }
            draggedRef={draggedRef}
          />
        ))}
      </MessageQueue>
    </div>
  )
}

function QueueRow({
  item,
  index,
  items,
  onEdit,
  draggedRef,
}: {
  item: QueueItemState
  index: number
  items: readonly QueueItemState[]
  onEdit?: (item: QueueItemState) => void
  draggedRef: React.RefObject<string | null>
}) {
  const t = useT()
  const runtime = useChatRuntime()
  const pending = item.id.startsWith("pending:")
  const failed = item.id.startsWith("failed:")
  const move = (id: string, before: string | null) =>
    runtime.queue?.move(id, { lane: "queue", insertBefore: before })
  return (
    <MessageQueueItem
      data-slot="message-queue-item"
      index={index}
      text={
        <>
          {item.prompt}
          {pending || failed ? (
            <span
              className={cn(
                "ml-2 text-xs",
                failed ? "text-destructive" : "text-muted-foreground"
              )}
            >
              {t(pending ? "common.saving" : "common.generationFailed")}
            </span>
          ) : null}
        </>
      }
      onCancel={pending ? undefined : () => runtime.queue?.remove(item.id)}
      onDragOver={(event) => {
        if (draggedRef.current) event.preventDefault()
      }}
      onDrop={(event) => {
        event.preventDefault()
        if (draggedRef.current && draggedRef.current !== item.id)
          move(draggedRef.current, item.id)
        draggedRef.current = null
      }}
      leading={
        <button
          type="button"
          draggable={!pending && !failed}
          disabled={pending || failed}
          aria-label={t("common.reorderQueuedMessage")}
          className={cn(
            ghostButton,
            mono,
            "size-6 shrink-0 cursor-grab tabular-nums"
          )}
          onDragStart={(event) => {
            draggedRef.current = item.id
            event.dataTransfer.setData("text/plain", item.id)
            event.dataTransfer.effectAllowed = "move"
          }}
          onDragEnd={() => {
            draggedRef.current = null
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowUp" && index > 0) {
              event.preventDefault()
              move(item.id, items[index - 1]!.id)
            }
            if (event.key === "ArrowDown" && index < items.length - 1) {
              event.preventDefault()
              move(item.id, items[index + 2]?.id ?? null)
            }
          }}
        >
          {index + 1}
        </button>
      }
      preview={
        item.parts.some((part) => part.type === "file") ? (
          <AttachmentGroup className="max-w-64 shrink-0 gap-1.5 py-0">
            {item.parts.flatMap((part, index) => {
              if (part.type !== "file") return []
              const Icon = getMimeTypeIcon(part.mimeType)
              const image = part.mimeType.startsWith("image/")
              const size = part.size ?? base64ByteSize(part.data)
              const meta = [
                formatMimeLabel(part.mimeType),
                size === undefined ? undefined : formatAttachmentSize(size),
              ]
                .filter(Boolean)
                .join(" · ")
              return [
                <Attachment
                  key={index}
                  size="xs"
                  className="min-w-0 max-w-40"
                >
                  <AttachmentMedia variant={image ? "image" : "icon"}>
                    {image ? (
                      <img src={part.data} alt={part.filename ?? ""} />
                    ) : (
                      <Icon />
                    )}
                  </AttachmentMedia>
                  <AttachmentContent>
                    <AttachmentTitle title={part.filename}>
                      {part.filename}
                    </AttachmentTitle>
                    <AttachmentDescription>{meta}</AttachmentDescription>
                  </AttachmentContent>
                </Attachment>,
              ]
            })}
          </AttachmentGroup>
        ) : null
      }
    >
      {onEdit && !pending ? (
        <TooltipIconButton
          tooltip={t("common.editQueuedMessage")}
          onClick={() => onEdit(item)}
        >
          <PencilIcon />
        </TooltipIconButton>
      ) : null}
      {!pending && !failed ? (
        <TooltipHint label={t("common.steerHint")}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              runtime.queue?.move(item.id, { lane: "steer", insertAfter: null })
            }
          >
            <CornerDownRightIcon data-icon="inline-start" />
            {t("common.steer")}
          </Button>
        </TooltipHint>
      ) : null}
    </MessageQueueItem>
  )
}
