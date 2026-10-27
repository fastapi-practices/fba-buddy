import { describe, expect, it } from "vitest"

import { applyAgUiEvent, snapshotToChatMessages } from "./message-events"
import { researchSources, RESEARCH_TOOL_NAMES } from "./research-sources"
import { toThreadMessage } from "./thread-message"

describe("research sources", () => {
  it("reads real DuckDuckGo, Tavily and Exa result shapes with clickable originals", () => {
    expect(
      researchSources(
        JSON.stringify([
          {
            title: "DDG",
            href: "https://ddg.example/a",
            body: "search snippet",
          },
        ])
      )
    ).toEqual([
      {
        title: "DDG",
        url: "https://ddg.example/a",
        domain: "ddg.example",
        snippet: "search snippet",
      },
    ])
    expect(
      researchSources({
        results: [
          {
            title: "Tavily",
            url: "https://tavily.example/p",
            content: "retrieved content",
          },
        ],
      })[0]?.snippet
    ).toBe("retrieved content")
    expect(
      researchSources({
        results: [
          {
            title: "Exa",
            url: "https://exa.example/p",
            text: "retrieved text",
          },
        ],
      })[0]?.snippet
    ).toBe("retrieved text")
    expect(
      researchSources([
        { uri: "https://gemini.example.com/source", title: "Google grounding" },
      ])[0]?.url
    ).toBe("https://gemini.example.com/source")
    expect(RESEARCH_TOOL_NAMES.has("duckduckgo_search")).toBe(true)
    expect(RESEARCH_TOOL_NAMES.has("tavily_search")).toBe(true)
    expect(RESEARCH_TOOL_NAMES.has("exa_search")).toBe(true)
  })

  it("never guesses sources from text or permits unsafe links and bounds output", () => {
    expect(researchSources("See https://unverified.example.com")).toEqual([])
    expect(
      researchSources([
        { url: "javascript:alert(1)" },
        { url: "https://user:secret@example.com" },
        { domain: "invented.example.com", title: "Unlinked" },
      ])
    ).toEqual([])
    const rows = Array.from({ length: 120 }, (_, n) => ({
      url: `https://example.com/${n}`,
      title: "a".repeat(1000),
      body: "b".repeat(1000),
    }))
    expect(researchSources(rows)).toHaveLength(100)
    expect(researchSources(rows)[0]?.title).toHaveLength(512)
    expect(researchSources(rows)[0]?.snippet).toHaveLength(500)
  })

  it("keeps link preview metadata and resolves safe image URLs against the source", () => {
    const [source, unsafe] = researchSources([
      {
        url: "https://docs.example.com/guide/start",
        title: "Guide",
        description: "Getting started",
        image: "../preview.png",
        favicon: "/favicon.ico",
        site_name: "Example Docs",
      },
      {
        url: "https://docs.example.com/other",
        image: "javascript:alert(1)",
        favicon: "https://user:secret@example.com/icon.png",
      },
    ])
    expect(source).toEqual({
      url: "https://docs.example.com/guide/start",
      domain: "docs.example.com",
      title: "Guide",
      snippet: "Getting started",
      image: "https://docs.example.com/preview.png",
      favicon: "https://docs.example.com/favicon.ico",
      siteName: "Example Docs",
    })
    expect(unsafe).not.toHaveProperty("image")
    expect(unsafe).not.toHaveProperty("favicon")
  })

  it("preserves citations across stream, history and assistant UI conversion", () => {
    const sources = [
      { url: "https://docs.example.com/page", title: "Documentation" },
    ]
    let messages = applyAgUiEvent([], {
      type: "TEXT_MESSAGE_START",
      messageId: "answer",
      role: "assistant",
    })
    messages = applyAgUiEvent(messages, {
      type: "CUSTOM",
      name: "buddy.citations",
      value: { message_id: "answer", sources },
    })
    expect(messages[0]?.sources).toEqual(researchSources(sources))
    const snapshot = snapshotToChatMessages([
      {
        id: "history",
        role: "assistant",
        content: "Documented answer",
        sources,
      },
    ])
    expect(snapshot[0]?.sources).toEqual(researchSources(sources))
    expect(toThreadMessage(snapshot[0]!).metadata?.custom?.sources).toEqual(
      researchSources(sources)
    )
  })
})
