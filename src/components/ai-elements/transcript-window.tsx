"use client"

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { useChatViewportState } from "@/features/chat/chat-runtime"
import type { TranscriptTurn } from "@/features/chat/transcript-render"
import {
  TRANSCRIPT_MOUNTED,
  TRANSCRIPT_NAVIGATE,
  type TranscriptLocation,
} from "@/features/chat/transcript-state"
import { TranscriptRevealContext, useTranscriptScope } from "./transcript-scope"
import {
  MessageScrollerContent,
  MessageScrollerItem,
  useMessageScroller,
} from "@/components/ui/message-scroller"
import {
  messageElements,
  setTranscriptHighlight,
  transcriptTextRanges,
  resolveTranscriptQuoteRange,
} from "./transcript-dom"

export function TranscriptWindow({
  turns,
  children,
  query,
  busy,
  leading,
  trailing,
}: {
  turns: TranscriptTurn[]
  children: (turn: TranscriptTurn, index: number) => ReactNode
  query: string
  busy?: boolean
  leading?: ReactNode
  trailing?: ReactNode
}) {
  const viewport = useChatViewportState((s) => s.element.viewport)
  const scope = useTranscriptScope()
  const { scrollToMessage } = useMessageScroller()
  const [target, setTarget] = useState<TranscriptLocation>()
  const highlightId = `quote-${useId().replace(/[^a-z0-9]/gi, "")}`
  const root = viewport?.closest<HTMLElement>(".thread-root")
  const turnIndex = useMemo(() => {
    const index = new Map<string, number>()
    turns.forEach((turn, position) => {
      index.set(turn.id, position)
      turn.assistants.forEach((id) => index.set(id, position))
    })
    return index
  }, [turns])

  useEffect(() => {
    if (query) return
    setTarget(undefined)
    scope.finishNavigation()
  }, [query, scope.finishNavigation])

  const locate = useCallback(
    (location: TranscriptLocation) => {
      const index = turnIndex.get(location.messageId)
      if (index === undefined) return false
      scope.beginNavigation()
      setTarget({ ...location })
      return true
    },
    [turnIndex, scope.beginNavigation]
  )

  useEffect(() => {
    if (!root) return
    const navigate = (event: Event) => {
      const location = (event as CustomEvent<TranscriptLocation>).detail
      if (location?.messageId && locate(location)) event.preventDefault()
    }
    root.addEventListener(TRANSCRIPT_NAVIGATE, navigate)
    return () => root.removeEventListener(TRANSCRIPT_NAVIGATE, navigate)
  }, [root, locate])

  useLayoutEffect(() => {
    root?.dispatchEvent(new CustomEvent(TRANSCRIPT_MOUNTED))
  }, [root, turns])

  useEffect(() => {
    if (!target) return
    if (!root || !viewport) {
      scope.finishNavigation()
      return
    }
    const index = turnIndex.get(target.messageId)
    if (index === undefined) {
      scope.finishNavigation()
      return
    }
    const messageId = turns[index]!.id
    let frame = 0
    let attempts = 0
    let clearHighlight: (() => void) | undefined
    const finish = () => {
      const elements = messageElements(root, target.messageId)
      const ranges = target.text
        ? elements.flatMap((element) =>
            transcriptTextRanges(element, target.text!)
          )
        : []
      const selected =
        target.prefix !== undefined || target.suffix !== undefined
          ? elements
              .map((element) => resolveTranscriptQuoteRange(element, target))
              .find(Boolean)
          : (ranges[target.occurrence ?? 0] ?? ranges[0])
      const element =
        (selected &&
          elements.find((item) =>
            item.contains(selected.commonAncestorContainer)
          )) ||
        elements.find((item) => item.getBoundingClientRect().height > 0)
      if (!element && attempts++ < 12) {
        frame = requestAnimationFrame(finish)
        return
      }
      if (!element) {
        scope.finishNavigation()
        return
      }
      if (
        !scrollToMessage(messageId, {
          align: "start",
          behavior: "auto",
        }) &&
        attempts++ < 12
      ) {
        frame = requestAnimationFrame(finish)
        return
      }
      clearHighlight?.()
      clearHighlight = setTranscriptHighlight(
        highlightId,
        selected ? [selected] : []
      )
      element.setAttribute("data-transcript-located", "true")
      scope.finishNavigation()
    }
    frame = requestAnimationFrame(finish)
    return () => {
      cancelAnimationFrame(frame)
      clearHighlight?.()
      messageElements(root, target.messageId).forEach((element) =>
        element.removeAttribute("data-transcript-located")
      )
    }
  }, [
    target,
    root,
    viewport,
    turns,
    turnIndex,
    scrollToMessage,
    highlightId,
    scope.finishNavigation,
  ])

  return (
    <MessageScrollerContent
      aria-busy={busy}
      data-slot="transcript-message-group"
      data-transcript-window
      className="min-h-full min-w-0 gap-0"
    >
      <MessageScrollerItem
        messageId="transcript-highlight"
        className="hidden"
        aria-hidden
      >
        <style>{`::highlight(${highlightId}){background:color-mix(in oklab,var(--color-primary) 40%,transparent);color:inherit}`}</style>
      </MessageScrollerItem>
      {leading}
      {turns.map((turn, index) => {
        const revealing =
          target && turnIndex.get(target.messageId) === index
            ? target
            : undefined
        return (
          <MessageScrollerItem
            key={turn.renderKey}
            messageId={turn.id}
            scrollAnchor={turn.user !== undefined}
            className="mx-auto w-full max-w-(--thread-max-width) min-w-0 px-4 py-4 [content-visibility:visible]"
          >
            <TranscriptRevealContext value={revealing}>
              {children(turn, index)}
            </TranscriptRevealContext>
          </MessageScrollerItem>
        )
      })}
      {trailing}
    </MessageScrollerContent>
  )
}
