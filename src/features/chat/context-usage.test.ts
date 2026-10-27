import { describe, expect, it } from "vitest"

import {
  composerUsageFromThreadMessages,
  estimateTextTokens,
  formatUsdCost,
  parseSnapshotUsage,
  textsFromMessageContent,
  tokensToK,
  usageFromChatMessages,
  usageFromThreadMessages,
} from "@/features/chat/context-usage"
import type { ChatMessage } from "@/lib/types"

describe("estimateTextTokens", () => {
  it("returns 0 for empty text", () => {
    expect(estimateTextTokens("")).toBe(0)
  })

  it("counts latin at about 4 characters per token", () => {
    expect(estimateTextTokens("abcd")).toBe(1)
    expect(estimateTextTokens("abcdefgh")).toBe(2)
  })

  it("counts CJK denser than latin", () => {
    expect(estimateTextTokens("你好")).toBe(2)
    expect(estimateTextTokens("你好世界")).toBe(3)
  })
})

describe("textsFromMessageContent", () => {
  it("reads a plain string", () => {
    expect(textsFromMessageContent("hello")).toEqual({
      text: "hello",
      reasoning: "",
      tools: "",
    })
  })

  it("joins text, reasoning, and tool-call parts", () => {
    expect(
      textsFromMessageContent([
        { type: "reasoning", text: "想" },
        { type: "tool-call", toolName: "search", argsText: '{"q":1}' },
        { type: "text", text: "答" },
        { type: "image", image: "data:image/png;base64,xx" },
      ])
    ).toEqual({
      text: "答",
      reasoning: "想",
      tools: 'search{"q":1}',
    })
  })
})

describe("parseSnapshotUsage", () => {
  it("reads camelCase usage and cost from a snapshot payload", () => {
    expect(
      parseSnapshotUsage({
        inputTokens: 12,
        outputTokens: 4,
        totalTokens: 16,
        cacheReadTokens: 3,
        details: { reasoning_tokens: 2 },
        cost: 0.0012,
      })
    ).toEqual({
      inputTokens: 12,
      outputTokens: 4,
      totalTokens: 16,
      cacheReadTokens: 3,
      reasoningTokens: 2,
      costUsd: 0.0012,
    })
  })

  it("returns undefined for empty usage", () => {
    expect(parseSnapshotUsage({ input_tokens: 0, output_tokens: 0 })).toBe(
      undefined
    )
  })
})

describe("formatUsdCost", () => {
  it("keeps small costs readable", () => {
    expect(formatUsdCost(0)).toBe("$0")
    expect(formatUsdCost(0.0012)).toBe("$0.0012")
    expect(formatUsdCost(0.12)).toBe("$0.12")
  })
})

describe("usageFromThreadMessages", () => {
  it("prefers the latest reported model usage over text estimates", () => {
    expect(
      usageFromThreadMessages([
        { role: "user", content: [{ type: "text", text: "abcd" }] },
        {
          role: "assistant",
          content: [{ type: "text", text: "ok" }],
          usage: {
            inputTokens: 80,
            outputTokens: 20,
            totalTokens: 100,
            cacheReadTokens: 10,
            costUsd: 0.002,
          },
        },
      ])
    ).toEqual({
      inputTokens: 80,
      outputTokens: 20,
      cachedInputTokens: 10,
      reasoningTokens: undefined,
      totalTokens: 100,
      costUsd: 0.002,
      totalCostUsd: 0.002,
    })
  })

  it("splits user text into input and assistant text into output", () => {
    expect(
      usageFromThreadMessages([
        { role: "user", content: [{ type: "text", text: "abcd" }] },
        {
          role: "assistant",
          content: [
            { type: "reasoning", text: "想一想" },
            { type: "text", text: "ok" },
          ],
        },
      ])
    ).toEqual({
      inputTokens: 1,
      outputTokens: 1,
      reasoningTokens: 2,
      totalTokens: 4,
    })
  })
})

describe("tokensToK", () => {
  it("rounds token counts into thousands", () => {
    expect(tokensToK(128_000)).toBe(128)
    expect(tokensToK(400)).toBe(0)
    expect(tokensToK(500)).toBe(1)
  })
})

describe("composerUsageFromThreadMessages", () => {
  it("splits tool tokens from conversation tokens", () => {
    expect(
      composerUsageFromThreadMessages(
        [
          { role: "user", content: "a".repeat(4000) },
          {
            role: "assistant",
            content: [
              {
                type: "tool-call",
                toolName: "search",
                argsText: "b".repeat(2000),
              },
              { type: "text", text: "c".repeat(4000) },
            ],
          },
        ],
        128_000
      )
    ).toEqual({
      system: 0,
      tools: 1,
      messages: 2,
      total: 128,
    })
  })
})

describe("usageFromChatMessages", () => {
  it("counts thinking and tool args", () => {
    const messages: ChatMessage[] = [
      { id: "u1", role: "user", content: "abcd" },
      {
        id: "a1",
        role: "assistant",
        content: "efgh",
        thinking: "想",
        tools: [{ id: "t1", name: "ab", args: "cd" }],
      },
    ]
    expect(usageFromChatMessages(messages)).toEqual({
      inputTokens: 2,
      outputTokens: 1,
      reasoningTokens: 1,
      totalTokens: 4,
    })
  })
})
