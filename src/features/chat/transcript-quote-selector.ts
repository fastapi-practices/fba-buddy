import type { TranscriptLocation } from "./transcript-state"
export {
  serializeInlineQuote,
  parseInlineQuote,
  expandInlineQuotes,
} from "@/shared/inline-quotes"
const normalize = (text: string) => text.replace(/\s+/g, " ")

export function quoteTextSelector(text: string, start: number, end: number) {
  const quoted = text.slice(start, end)
  if (!quoted.trim() || quoted.length > 8000) return null
  const before = text.slice(0, start)
  const normalized = normalize(text)
  let normalizedStart = normalize(before).length
  if (start > 0 && /\s/.test(text[start - 1]!) && /\s/.test(text[start]!))
    normalizedStart--
  const normalizedEnd = normalize(text.slice(0, end)).length
  const needle = normalize(quoted)
  let occurrence = 0,
    at = normalized.indexOf(needle)
  while (at >= 0 && at < normalizedStart) {
    occurrence++
    at = normalized.indexOf(needle, at + Math.max(1, needle.length))
  }
  return {
    text: quoted,
    start: normalizedStart,
    end: normalizedEnd,
    prefix: normalized.slice(
      Math.max(0, normalizedStart - 64),
      normalizedStart
    ),
    suffix: normalized.slice(normalizedEnd, normalizedEnd + 64),
    occurrence,
  }
}

export function resolveQuoteTextMatch(
  text: string,
  anchor: TranscriptLocation
) {
  if (!anchor.text?.trim()) return null
  const normalized = normalize(text),
    needle = normalize(anchor.text)
  const matches: { start: number; end: number }[] = []
  let at = normalized.indexOf(needle)
  while (at >= 0) {
    const end = at + needle.length
    if (
      (anchor.prefix === undefined ||
        normalized.slice(Math.max(0, at - anchor.prefix.length), at) ===
          anchor.prefix) &&
      (anchor.suffix === undefined ||
        normalized.slice(end, end + anchor.suffix.length) === anchor.suffix)
    )
      matches.push({ start: at, end })
    at = normalized.indexOf(needle, at + Math.max(1, needle.length))
  }
  if (anchor.prefix !== undefined || anchor.suffix !== undefined)
    return matches.length === 1 ? matches[0]! : null
  return matches[anchor.occurrence ?? 0] ?? null
}
