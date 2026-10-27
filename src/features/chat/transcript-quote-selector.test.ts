import { describe, expect, it } from "vitest"
import {
  quoteTextSelector,
  resolveQuoteTextMatch,
  serializeInlineQuote,
  parseInlineQuote,
  expandInlineQuotes,
} from "./transcript-quote-selector"

describe("durable quote selectors", () => {
  it("identifies a later identical phrase with its surrounding text", () => {
    const text = "first repeated phrase then second repeated phrase end"
    const start = text.lastIndexOf("repeated phrase")
    const selector = quoteTextSelector(text, start, start + 15)!
    expect(selector.occurrence).toBe(1)
    expect(
      resolveQuoteTextMatch(text, { messageId: "m", ...selector })
    ).toEqual({ start, end: start + 15 })
    expect(
      resolveQuoteTextMatch("first repeated phrase then changed", {
        messageId: "m",
        ...selector,
      })
    ).toBeNull()
  })
  it("normalizes wrapped whitespace while preserving selected text", () => {
    const selector = quoteTextSelector(
      "before\n\n repeated\nphrase after",
      9,
      24
    )!
    expect(selector.text).toBe("repeated\nphrase")
    expect(
      resolveQuoteTextMatch("before repeated phrase after", {
        messageId: "m",
        ...selector,
      })
    ).toEqual({ start: 7, end: 22 })
  })
  it("roundtrips multiple quotes and occurrence anchors", () => {
    const a = {
      messageId: "m1",
      conversationId: "c1",
      text: "first (quote)",
      occurrence: 2,
    }
    const b = { messageId: "m2", text: "second\nquote" }
    const encoded = serializeInlineQuote(a)
    expect(parseInlineQuote(encoded.slice(8, -1))).toEqual(a)
    const expanded = expandInlineQuotes(
      `${encoded}\n${serializeInlineQuote(b)}\nMy request`
    )
    expect(expanded).toContain("> first (quote)")
    expect(expanded).toContain("> second\n> quote")
    expect(expanded).toContain("My request")
    expect(expanded).not.toContain("fba-citation:")
    expect(parseInlineQuote("fba-citation://v1/%invalid")).toBeUndefined()
  })
})
