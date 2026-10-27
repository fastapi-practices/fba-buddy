import { useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { submissionFromQueueItem } from "./thread-message"
import type { SaveQueuedMessage } from "@/components/ai-elements/composer-queue"
import type { QueueItemState } from "./thread-types"
import { useChatRuntime } from "./chat-runtime"
import { useT } from "@/hooks/use-t"
import { useComposerStore } from "./composer-store"
import {
  QueueComposerContext,
  useQueueComposer,
} from "./queue-composer-context"

export function QueueComposerProvider({
  onEdit,
  children,
}: {
  onEdit: SaveQueuedMessage
  children: ReactNode
}) {
  const runtime = useChatRuntime()
  const t = useT()
  const [editing, setEditing] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const lock = useRef(false)
  const previous = useRef<{
    text: string
    attachments: typeof runtime.composer.attachments
  } | null>(null)
  const replace = async (item: QueueItemState) => {
    const submission = submissionFromQueueItem(item)
    runtime.composer.setText(submission.text)
    runtime.composer.setAttachments(submission.attachments)
    useComposerStore.getState().setDraft(submission.text)
  }
  const restore = async () => {
    const original = previous.current
    previous.current = null
    setEditing(null)
    setError("")
    if (original) {
      runtime.composer.setText(original.text)
      runtime.composer.setAttachments([...original.attachments])
    }
  }
  const begin = (item: QueueItemState) => {
    if (lock.current || item.id.startsWith("pending:")) return
    if (!previous.current)
      previous.current = {
        text: runtime.composer.text,
        attachments: runtime.composer.attachments,
      }
    setEditing(item.id)
    setError("")
    lock.current = true
    setBusy(true)
    void replace(item)
      .catch((cause) => setError(String(cause)))
      .finally(() => {
        lock.current = false
        setBusy(false)
      })
  }
  const save = async () => {
    if (!editing || lock.current) return
    lock.current = true
    setBusy(true)
    setError("")
    try {
      if (!runtime.queue?.items.some((item) => item.id === editing))
        throw new Error(t("common.queuedMessageNoLongerAvailable"))
      if (!runtime.composer.text.trim() && !runtime.composer.attachments.length)
        return
      await onEdit(editing, {
        text: runtime.composer.text,
        attachments: runtime.composer.attachments,
      })
      await restore()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.nativeEvent.isComposing || event.defaultPrevented) return
    if (editing && event.key === "Escape") {
      event.preventDefault()
      event.stopPropagation()
      if (!busy) void restore()
    }
    if (
      (event.metaKey || event.ctrlKey) &&
      !event.altKey &&
      event.key === "ArrowUp"
    ) {
      const item = runtime.queue?.items.findLast(
        (entry) => !entry.id.startsWith("pending:")
      )
      if (item) {
        event.preventDefault()
        begin(item)
      }
    }
    if (
      (event.metaKey || event.ctrlKey) &&
      event.shiftKey &&
      event.key === "Enter" &&
      !editing
    ) {
      const item = runtime.queue?.items.find(
        (entry) => !entry.id.startsWith("pending:")
      )
      if (item) {
        event.preventDefault()
        runtime.queue?.move(item.id, { lane: "steer", insertAfter: null })
      }
    }
  }
  return (
    <QueueComposerContext
      value={{
        editing,
        busy,
        error,
        begin,
        save,
        cancel: () => {
          if (!busy) void restore()
        },
        onKeyDown,
      }}
    >
      {children}
    </QueueComposerContext>
  )
}

export function QueueComposerBanner() {
  const queue = useQueueComposer()
  const t = useT()
  if (!queue?.editing) return null
  return (
    <div
      data-slot="queue-composer-edit"
      className="flex flex-wrap items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm"
    >
      <span className="flex-1">{t("common.editQueuedMessage")}</span>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={queue.busy}
        onClick={queue.cancel}
      >
        {t("common.cancel")}
      </Button>
      <Button
        type="button"
        size="sm"
        disabled={queue.busy}
        onClick={() => void queue.save()}
      >
        {t(queue.busy ? "common.saving" : "common.save")}
      </Button>
      {queue.error && (
        <p role="alert" className="w-full text-destructive">
          {queue.error}
        </p>
      )}
    </div>
  )
}
