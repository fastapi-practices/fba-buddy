export type TranscriptQuoteAnchor = {
  messageId: string
  text: string
  conversationId?: string
  occurrence?: number
  start?: number
  end?: number
  prefix?: string
  suffix?: string
}

export function quoteAnchor(value: unknown): TranscriptQuoteAnchor | undefined {
  if (!value || typeof value !== "object") return
  const quote = value as Record<string, unknown>
  if (typeof quote.messageId !== "string" || typeof quote.text !== "string")
    return
  return {
    messageId: quote.messageId,
    text: quote.text,
    ...(typeof quote.conversationId === "string"
      ? { conversationId: quote.conversationId }
      : {}),
    ...(typeof quote.start === "number" &&
    Number.isSafeInteger(quote.start) &&
    quote.start >= 0
      ? { start: quote.start }
      : {}),
    ...(typeof quote.end === "number" &&
    Number.isSafeInteger(quote.end) &&
    quote.end >= 0
      ? { end: quote.end }
      : {}),
    ...(typeof quote.prefix === "string"
      ? { prefix: quote.prefix.slice(-64) }
      : {}),
    ...(typeof quote.suffix === "string"
      ? { suffix: quote.suffix.slice(0, 64) }
      : {}),
    ...(typeof quote.occurrence === "number" &&
    Number.isInteger(quote.occurrence) &&
    quote.occurrence >= 0
      ? { occurrence: quote.occurrence }
      : {}),
  }
}

export function serializeInlineQuote(anchor: TranscriptQuoteAnchor) {
  return `[Quote](fba-citation://v1/${encodeURIComponent(JSON.stringify(anchor)).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16)}`)})`
}

export function parseInlineQuote(href: string) {
  if (!href.startsWith("fba-citation://v1/") || href.length > 100000)
    return undefined
  try {
    const anchor = quoteAnchor(JSON.parse(decodeURIComponent(href.slice(18))))
    if (
      !anchor ||
      !anchor.messageId ||
      anchor.messageId.length > 128 ||
      !anchor.text.trim() ||
      anchor.text.length > 8000
    )
      return undefined
    return anchor
  } catch {
    return undefined
  }
}

export function expandInlineQuotes(text: string) {
  return text.replace(
    /\[[^\]\n]*\]\((fba-citation:\/\/v1\/[^\s)]+)\)/g,
    (source, href: string) => {
      const quote = parseInlineQuote(href)
      return quote ? `\n> ${quote.text.replace(/\n/g, "\n> ")}\n` : source
    }
  )
}
