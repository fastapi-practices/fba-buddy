import { useEffect, useRef, type KeyboardEvent } from "react"
import { useChatRuntime } from "@/features/chat/chat-runtime"

function composerHistoryTexts(
  messages: readonly {
    role: string
    content: readonly { type: string; text?: string }[]
  }[]
) {
  const values: string[] = []
  for (const message of [...messages].reverse()) {
    if (message.role !== "user") continue
    const text = message.content
      .flatMap((part) => (part.type === "text" ? [part.text ?? ""] : []))
      .join("")
      .trim()
    if (text && values.at(-1) !== text) values.push(text)
  }
  return values
}

export function useComposerHistory(conversationId?: string | null) {
  const runtime = useChatRuntime()
  const browse = useRef<{
    cursor: number
    draft: string
    recalled: string
  } | null>(null)
  useEffect(() => {
    browse.current = null
  }, [conversationId])
  return (event: KeyboardEvent<HTMLElement>) => {
    if (
      event.defaultPrevented ||
      event.nativeEvent.isComposing ||
      event.altKey ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      !["ArrowUp", "ArrowDown"].includes(event.key)
    )
      return
    const editor =
      event.target instanceof HTMLTextAreaElement
        ? event.target
        : event.currentTarget.querySelector("textarea")
    if (!editor || editor.getAttribute("aria-expanded") === "true") return
    const direction = event.key === "ArrowUp" ? "up" : "down"
    if (
      (direction === "up" && editor.selectionStart > 0) ||
      (direction === "down" && editor.selectionStart < editor.value.length)
    )
      return
    const current = runtime.composer.text
    if (browse.current && current !== browse.current.recalled)
      browse.current = null
    if (!browse.current && (current.trim() || direction !== "up")) return
    const history = composerHistoryTexts(runtime.thread.messages)
    if (!history.length) return
    const cursor = browse.current
      ? browse.current.cursor + (direction === "up" ? 1 : -1)
      : 0
    const next = cursor < 0 ? (browse.current?.draft ?? "") : history[cursor]
    event.preventDefault()
    event.stopPropagation()
    if (next === undefined) return
    browse.current =
      cursor < 0
        ? null
        : { cursor, draft: browse.current?.draft ?? current, recalled: next }
    runtime.composer.setText(next)
    requestAnimationFrame(() => {
      if (!editor.isConnected) return
      editor.setSelectionRange(next.length, next.length)
    })
  }
}
