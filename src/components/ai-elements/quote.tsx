"use client"

import {
  memo,
  useMemo,
  useState,
  useEffect,
  type ComponentProps,
  type FC,
} from "react"
import { ArrowUpRightIcon, QuoteIcon, XIcon } from "lucide-react"
import { useT } from "@/hooks/use-t"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/toast"
import {
  navigateTranscript,
  quoteAnchor,
  type TranscriptQuoteAnchor,
} from "@/features/chat/transcript-state"
import { useChatMessage, useChatRuntime } from "@/features/chat/chat-runtime"
import { useTranscriptScope } from "./transcript-scope"
import { captureTranscriptQuote } from "./transcript-dom"
import { serializeInlineQuote } from "@/features/chat/transcript-quote-selector"

function QuoteBlockRoot({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="quote-block"
      className={cn("mb-2 flex items-start gap-1.5", className)}
      {...props}
    />
  )
}

function QuoteBlockIcon({
  className,
  ...props
}: ComponentProps<typeof QuoteIcon>) {
  return (
    <QuoteIcon
      data-slot="quote-block-icon"
      className={cn(
        "mt-0.5 size-3 shrink-0 text-muted-foreground/60",
        className
      )}
      {...props}
    />
  )
}

function QuoteBlockText({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      data-slot="quote-block-text"
      className={cn(
        "line-clamp-2 min-w-0 text-sm text-muted-foreground/80 italic",
        className
      )}
      {...props}
    />
  )
}

function QuoteSourceButton({ anchor }: { anchor: TranscriptQuoteAnchor }) {
  const t = useT()
  const scope = useTranscriptScope()
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      aria-label={t("common.quoteSource")}
      onClick={async (event) => {
        event.preventDefault()
        event.stopPropagation()
        const root = event.currentTarget.closest<HTMLElement>(".thread-root")
        const destination = {
          ...anchor,
          conversationId:
            anchor.conversationId ?? scope.conversationId ?? undefined,
        }
        try {
          if (
            destination.conversationId &&
            destination.conversationId !== scope.conversationId
          ) {
            if (!scope.onNavigateQuote)
              throw new Error("missing source navigator")
            await scope.onNavigateQuote(destination)
            return
          }
          if (root && navigateTranscript(root, destination)) return
          if (!scope.onNavigateQuote) throw new Error("missing source message")
          await scope.onNavigateQuote(destination)
        } catch {
          toast.add({ title: t("common.quoteNavigationFailed"), type: "error" })
        }
      }}
    >
      <ArrowUpRightIcon />
    </Button>
  )
}

export function InlineQuote({ anchor }: { anchor: TranscriptQuoteAnchor }) {
  return (
    <span
      className="inline-flex max-w-full items-center gap-1 rounded border px-1 align-baseline"
      data-quote-markdown={serializeInlineQuote(anchor)}
    >
      <QuoteIcon className="size-3 shrink-0" />
      <span className="max-w-52 truncate">{anchor.text}</span>
      <QuoteSourceButton anchor={anchor} />
    </span>
  )
}

const QuoteBlockImpl = ({ text }: { text?: string }) => {
  const message = useChatMessage()
  const rawQuote = message.metadata?.custom?.quote
  const anchor = useMemo(() => quoteAnchor(rawQuote), [rawQuote])
  return (
    <QuoteBlockRoot className="mb-0" data-find-ignore>
      <QuoteBlockIcon />
      <QuoteBlockText>{text ?? anchor?.text}</QuoteBlockText>
      {anchor ? <QuoteSourceButton anchor={anchor} /> : null}
    </QuoteBlockRoot>
  )
}

const QuoteBlock = memo(QuoteBlockImpl) as unknown as FC<{
  text?: string
}> & {
  Root: typeof QuoteBlockRoot
  Icon: typeof QuoteBlockIcon
  Text: typeof QuoteBlockText
}

QuoteBlock.displayName = "QuoteBlock"
QuoteBlock.Root = QuoteBlockRoot
QuoteBlock.Icon = QuoteBlockIcon
QuoteBlock.Text = QuoteBlockText

const SelectionToolbar: FC = () => {
  const t = useT()
  const runtime = useChatRuntime()
  const scope = useTranscriptScope()
  const [position, setPosition] = useState<{ x: number; y: number } | null>(
    null
  )

  useEffect(() => {
    const update = () => {
      const selection = window.getSelection()
      if (!selection || selection.isCollapsed || !selection.rangeCount) {
        setPosition(null)
        return
      }
      const range = selection.getRangeAt(0)
      const start =
        range.startContainer instanceof Element
          ? range.startContainer
          : range.startContainer.parentElement
      if (!start?.closest(".thread-root")) {
        setPosition(null)
        return
      }
      const rect = range.getBoundingClientRect()
      if (!rect.width && !rect.height) return
      setPosition({ x: rect.left + rect.width / 2, y: rect.top - 8 })
    }
    document.addEventListener("selectionchange", update)
    return () => document.removeEventListener("selectionchange", update)
  }, [])

  if (!position) return null
  return (
    <div
      data-slot="selection-toolbar"
      className="fixed z-50 flex -translate-x-1/2 -translate-y-full items-center gap-1 rounded-lg border bg-popover px-1 py-1 shadow-md"
      style={{ left: position.x, top: position.y }}
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 px-2.5 text-sm"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          const selection = window.getSelection()
          const range = selection?.rangeCount ? selection.getRangeAt(0) : null
          const element =
            range?.startContainer instanceof Element
              ? range.startContainer
              : range?.startContainer.parentElement
          const root = element?.closest<HTMLElement>(
            "[data-message-id], [data-work-message-id]"
          )
          const selector =
            range && root ? captureTranscriptQuote(range, root) : null
          const messageId =
            root?.dataset.messageId ?? root?.dataset.workMessageId
          if (!selector || !messageId) return
          const previous = runtime.composer.quote
          if (previous)
            runtime.composer.setText(
              `${runtime.composer.text.trimEnd()}\n\n${serializeInlineQuote(previous)}\n`.trimStart()
            )
          runtime.composer.setQuote({
            ...selector,
            messageId,
            conversationId: scope.conversationId ?? undefined,
          })
          selection?.removeAllRanges()
          setPosition(null)
        }}
      >
        <QuoteIcon className="size-3.5" />
        {t("common.quote")}
      </Button>
    </div>
  )
}

const ComposerQuotePreview: FC = () => {
  const runtime = useChatRuntime()
  const t = useT()
  const anchor = useMemo(
    () => quoteAnchor(runtime.composer.quote),
    [runtime.composer.quote]
  )
  if (!anchor) return null
  return (
    <div
      data-slot="composer-quote"
      className="mx-3 mt-2 mb-2 flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2"
    >
      <QuoteIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/70" />
      <span className="line-clamp-2 min-w-0 flex-1 text-sm text-muted-foreground">
        {anchor.text}
      </span>
      <QuoteSourceButton anchor={anchor} />
      <Button
        size="icon-xs"
        variant="ghost"
        aria-label={t("common.keepQuoteInMessage")}
        onClick={() => {
          runtime.composer.setText(
            `${runtime.composer.text.trimEnd()}\n\n${serializeInlineQuote(anchor)}\n`.trimStart()
          )
          runtime.composer.setQuote(null)
        }}
      >
        <QuoteIcon />
      </Button>
      <Button
        size="icon-xs"
        variant="ghost"
        aria-label={t("common.removeQuote")}
        onClick={() => runtime.composer.setQuote(null)}
      >
        <XIcon />
      </Button>
    </div>
  )
}

export {
  QuoteBlock,



  SelectionToolbar,
  ComposerQuotePreview,
}
