import { textMatches } from "@/features/chat/transcript-render"
import type { TranscriptLocation } from "@/features/chat/transcript-state"
import {
  quoteTextSelector,
  resolveQuoteTextMatch,
} from "@/features/chat/transcript-quote-selector"

const quoteExcluded = "button, [data-find-ignore], [role=dialog], style, script"
function quoteNodes(element: HTMLElement) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement?.closest(quoteExcluded)
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  })
  const nodes: { node: Text; start: number; end: number }[] = []
  let text = "",
    node: Node | null
  while ((node = walker.nextNode())) {
    const start = text.length
    text += node.textContent ?? ""
    nodes.push({ node: node as Text, start, end: text.length })
  }
  return { nodes, text }
}

export function captureTranscriptQuote(range: Range, root: HTMLElement) {
  if (
    !root.contains(range.startContainer) ||
    !root.contains(range.endContainer)
  )
    return null
  const prefix = document.createRange()
  prefix.selectNodeContents(root)
  prefix.setEnd(range.startContainer, range.startOffset)
  const before = prefix.cloneContents()
  before.querySelectorAll(quoteExcluded).forEach((node) => node.remove())
  prefix.setEnd(range.endContainer, range.endOffset)
  const through = prefix.cloneContents()
  through.querySelectorAll(quoteExcluded).forEach((node) => node.remove())
  return quoteTextSelector(
    quoteNodes(root).text,
    before.textContent?.length ?? 0,
    through.textContent?.length ?? 0
  )
}

export function resolveTranscriptQuoteRange(
  element: HTMLElement,
  anchor: TranscriptLocation
): Range | null {
  const { nodes, text } = quoteNodes(element)
  const match = resolveQuoteTextMatch(text, anchor)
  if (!match) return null
  const starts: number[] = [],
    ends: number[] = []
  for (let i = 0; i < text.length; i++) {
    if (/\s/.test(text[i]!) && i > 0 && /\s/.test(text[i - 1]!)) {
      ends[ends.length - 1] = i + 1
      continue
    }
    starts.push(i)
    ends.push(i + 1)
  }
  const start = starts[match.start],
    end = ends[match.end - 1]
  if (start === undefined || end === undefined) return null
  const first = nodes.find((node) => node.end > start),
    last = nodes.find((node) => node.end >= end)
  if (!first || !last) return null
  const range = document.createRange()
  range.setStart(first.node, start - first.start)
  range.setEnd(last.node, end - last.start)
  return range
}

export function transcriptTextRanges(
  element: HTMLElement,
  query: string
): Range[] {
  if (!query.trim()) return []
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement?.closest(
        "button, [data-find-ignore], [role=dialog], style, script"
      )
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  })
  const nodes: { node: Text; start: number; end: number }[] = []
  let text = ""
  let next: Node | null
  while ((next = walker.nextNode())) {
    const start = text.length
    text += next.textContent ?? ""
    nodes.push({ node: next as Text, start, end: text.length })
  }
  return textMatches(text, query).flatMap((match) => {
    const first = nodes.find((node) => node.end > match.start)
    const last = nodes.find((node) => node.end >= match.end)
    if (!first || !last) return []
    const range = document.createRange()
    range.setStart(first.node, match.start - first.start)
    range.setEnd(last.node, match.end - last.start)
    return [range]
  })
}

export function messageElements(root: HTMLElement, messageId: string) {
  return [
    ...root.querySelectorAll<HTMLElement>(
      "[data-message-id], [data-work-message-id]"
    ),
  ].filter(
    (element) =>
      element.dataset.messageId === messageId ||
      element.dataset.workMessageId === messageId
  )
}

export function setTranscriptHighlight(name: string, ranges: Range[]) {
  const registry = (CSS as typeof CSS & { highlights?: Map<string, unknown> })
    .highlights
  const HighlightCtor = (
    window as unknown as { Highlight?: new (...ranges: Range[]) => unknown }
  ).Highlight
  if (registry && HighlightCtor)
    registry.set(name, new HighlightCtor(...ranges))
  return () => registry?.delete(name)
}
