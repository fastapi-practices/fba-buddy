import { describe, expect, it } from "vitest"
import {
  conversationSearchText,
  conversationSearchTarget,
  normalizeSearchText,
  searchExcerpt,
} from "./conversation-search"

describe("searchable transcript text", () => {
  it("covers live ChatMessage text, thinking, tools, streamed argument text, and attachment names", () => {
    const message = {
      content: "live reply",
      thinking: "live thought",
      tools: [
        {
          name: "read_live",
          args: '{"path":"live.ts"}',
          result: "live output",
        },
        { toolName: "pending_call", argsText: '{"path":"pending.ts"}' },
      ],
      attachments: [{ name: "live-attachment.txt", data: "hidden-live-bytes" }],
    }
    const text = conversationSearchText(message)
    for (const expected of [
      "live reply",
      "live thought",
      "read_live",
      "live.ts",
      "live output",
      "pending_call",
      "pending.ts",
      "live-attachment.txt",
    ])
      expect(text).toContain(expected)
    expect(text).not.toContain("hidden-live-bytes")
  })
  it("supports persisted camel-case tool calls and locates tool outputs at their assistant message", () => {
    const assistant = {
      id: "assistant",
      role: "assistant",
      toolCalls: [
        {
          id: "call",
          function: { name: "read_notes", arguments: '{"path":"notes.md"}' },
        },
      ],
    }
    const result = {
      id: "result",
      role: "tool",
      toolCallId: "call",
      content: "found content",
    }
    expect(conversationSearchText(assistant)).toContain("read_notes")
    expect(conversationSearchText(assistant)).toContain("notes.md")
    expect(conversationSearchTarget(result, [assistant, result])).toBe(
      assistant
    )
  })
  it("finds normalized mixed-case whitespace matches without losing deep Unicode offsets", () => {
    const text = `${"İ".repeat(500)} ${"前文 ".repeat(100)} NEEDLE\n\tphrase 后文`
    expect(normalizeSearchText(text)).toContain("needle phrase")
    const excerpt = searchExcerpt(text, "NEEDLE phrase")
    expect(excerpt).toContain("NEEDLE phrase 后文")
    expect(excerpt.length).toBeLessThanOrEqual(242)
  })
  it("extracts visible rich message content while omitting binary payloads, credentials and unrelated metadata", () => {
    const text = conversationSearchText({
      content: [
        { type: "text", text: "body" },
        { type: "reasoning", text: "thought" },
        {
          type: "tool-call",
          toolName: "shell",
          args: { command: "ls", password: "hidden-password" },
          result: '{"stdout":"found","data":"hidden-data"}',
        },
        {
          type: "image",
          filename: "diagram.png",
          image: "data:image/png;base64,hidden-image",
        },
        { type: "source", title: "Reference" },
      ],
      attachments: [{ name: "notes.txt", data: "hidden-attachment" }],
      turn_context: { anything: "hidden-context" },
      thinking: "extra reasoning",
    })
    for (const expected of [
      "body",
      "thought",
      "shell",
      "command",
      "ls",
      "found",
      "diagram.png",
      "Reference",
      "notes.txt",
      "extra reasoning",
    ])
      expect(text).toContain(expected)
    expect(text).not.toContain("hidden-")
  })
})
