import { describe, expect, it } from "vitest"

import {
  formatContextLength,
  formatInputPrice,
  formatModelPrice,
  getModelContextWindow,
  getModelLogoKind,
  getModelMeta,
  getModelThinking,
  normalizeModelId,
} from "./model-meta"

describe("normalizeModelId", () => {
  it("strips vendor prefixes", () => {
    expect(normalizeModelId("anthropic/claude-sonnet-4")).toBe(
      "claude-sonnet-4"
    )
  })
})

describe("formatContextLength", () => {
  it("formats thousands and millions", () => {
    expect(formatContextLength(128_000)).toBe("128k")
    expect(formatContextLength(1_048_576)).toBe("1M")
  })
})

describe("formatInputPrice", () => {
  it("formats dollars per million tokens", () => {
    expect(formatInputPrice(2.5)).toBe("$2.5 / 1M")
    expect(formatInputPrice(0)).toBe("Free")
  })
})

describe("formatModelPrice", () => {
  it("formats input and output together", () => {
    expect(formatModelPrice(2.5, 10)).toBe("$2.5 / $10")
    expect(formatModelPrice(1.75, null)).toBe("$1.75")
    expect(formatModelPrice(null, null)).toBeUndefined()
  })
})

describe("getModelMeta", () => {
  it("resolves gpt-4o name, context, in/out price, and tags", () => {
    expect(getModelMeta("gpt-4o")).toEqual({
      name: "GPT-4o",
      context: "128k",
      price: "$2.5 / $10",
      capabilities: ["vision", "tools"],
    })
  })

  it("resolves claude sonnet dated ids from the catalog", () => {
    expect(getModelMeta("anthropic/claude-sonnet-4-5-20250929")).toMatchObject({
      name: "Claude Sonnet 4.5",
      context: "1M",
      price: "$3 / $15",
      capabilities: ["vision", "thinking", "tools"],
    })
  })

  it("returns empty meta for unknown models", () => {
    expect(getModelMeta("my-local-model")).toEqual({})
  })
})

describe("getModelThinking", () => {
  it("uses backend policy levels and allows off only when explicitly configured", () => {
    const configured = getModelThinking("gpt-5.2", 0, undefined, ["thinking"], {
      levels: ["low", "high"],
      default_level: "high",
      can_disable: true,
    })
    expect(configured).toMatchObject({
      efforts: ["none", "low", "high", "off"],
      default: "high",
    })
    expect(
      getModelThinking("gpt-5.2", 0, undefined, ["thinking"], {
        levels: ["minimal"],
        default_level: null,
        can_disable: false,
      })
    ).toMatchObject({ efforts: ["none", "minimal"], default: "none" })
    expect(
      getModelThinking("gpt-5.2", 0, undefined, [], {
        levels: ["low"],
        default_level: "low",
        can_disable: true,
      })
    ).toBeUndefined()
  })

  it("hides effort options for non-reasoning models", () => {
    expect(getModelThinking("gpt-4o")).toBeUndefined()
    expect(getModelThinking("gpt-5-chat-latest")).toBeUndefined()
  })

  it("does not infer selectable levels without a backend policy", () => {
    expect(
      getModelThinking("gpt-5.2", 0, undefined, ["thinking"], null)
    ).toBeUndefined()
    expect(
      getModelThinking("custom-chat", 0, undefined, ["thinking", "tools"])
    ).toBeUndefined()
    expect(
      getModelThinking("gpt-5.2", 0, undefined, ["thinking"], {
        levels: [],
        default_level: null,
        can_disable: false,
      })
    ).toBeUndefined()
    expect(
      getModelThinking("gpt-5.2", 0, undefined, ["thinking"], {
        levels: [],
        default_level: null,
        can_disable: true,
      })?.efforts
    ).toEqual(["none", "off"])
  })

  it("follows backend capability flags when they are present", () => {
    expect(getModelThinking("gpt-5.2", 0, undefined, [])).toBeUndefined()
  })

  it("uses official OpenAI effort levels", () => {
    expect(getModelThinking("gpt-5.6-luna")).toEqual({
      supported: true,
      efforts: ["none", "low", "medium", "high", "xhigh", "max"],
      default: "medium",
      mandatory: false,
    })
    expect(getModelThinking("gpt-5.6")).toMatchObject({
      efforts: ["none", "low", "medium", "high", "xhigh", "max"],
      default: "medium",
    })
    expect(getModelThinking("gpt-5.5")).toEqual({
      supported: true,
      efforts: ["none", "low", "medium", "high", "xhigh"],
      default: "medium",
      mandatory: false,
    })
    expect(getModelThinking("gpt-5.2")).toEqual({
      supported: true,
      efforts: ["none", "low", "medium", "high", "xhigh"],
      default: "none",
      mandatory: false,
    })
    expect(getModelThinking("gpt-5.4-pro")).toEqual({
      supported: true,
      efforts: ["medium", "high", "xhigh"],
      default: "medium",
      mandatory: true,
    })
    expect(getModelThinking("gpt-5.3-codex-spark")).toEqual({
      supported: true,
      efforts: ["low", "medium", "high", "xhigh"],
      default: "low",
      mandatory: true,
    })
    expect(getModelThinking("gpt-5.1-codex-max")).toMatchObject({
      efforts: ["low", "medium", "high", "xhigh"],
      default: "low",
      mandatory: true,
    })
    expect(getModelThinking("gpt-5.1")).toMatchObject({
      efforts: ["none", "low", "medium", "high"],
      default: "none",
    })
    expect(getModelThinking("gpt-5")).toMatchObject({
      efforts: ["minimal", "low", "medium", "high"],
      default: "medium",
    })
    expect(getModelThinking("gpt-5-pro")).toMatchObject({
      efforts: ["high"],
      mandatory: true,
    })
    expect(getModelThinking("o3")).toMatchObject({
      efforts: ["low", "medium", "high"],
      default: "medium",
      mandatory: true,
    })
  })

  it("uses official Anthropic effort levels", () => {
    expect(getModelThinking("claude-opus-5")).toEqual({
      supported: true,
      efforts: ["low", "medium", "high", "xhigh", "max"],
      default: "high",
      mandatory: true,
    })
    expect(getModelThinking("claude-sonnet-5")).toMatchObject({
      efforts: ["low", "medium", "high", "xhigh", "max"],
    })
    expect(getModelThinking("claude-opus-4-7")).toMatchObject({
      efforts: ["low", "medium", "high", "xhigh", "max"],
    })
    expect(getModelThinking("claude-sonnet-4-6")).toEqual({
      supported: true,
      efforts: ["low", "medium", "high", "max"],
      default: "high",
      mandatory: true,
    })
    expect(getModelThinking("claude-opus-4-5-20251101")).toMatchObject({
      efforts: ["low", "medium", "high"],
    })
    expect(getModelThinking("claude-haiku-4-5")).toEqual({
      supported: true,
      efforts: ["none", "high"],
      default: "none",
      mandatory: false,
    })
    expect(getModelThinking("claude-sonnet-4-5")).toMatchObject({
      efforts: ["none", "high"],
      default: "none",
    })
  })

  it("uses official Google thinking levels", () => {
    expect(getModelThinking("gemini-3.8-flash")).toEqual({
      supported: true,
      efforts: ["low", "medium", "high"],
      default: "medium",
      mandatory: true,
    })
    expect(getModelThinking("gemini-3.5-flash")).toEqual({
      supported: true,
      efforts: ["minimal", "low", "medium", "high"],
      default: "medium",
      mandatory: false,
    })
    expect(getModelThinking("gemini-3.1-pro")).toEqual({
      supported: true,
      efforts: ["low", "medium", "high"],
      default: "high",
      mandatory: true,
    })
    expect(getModelThinking("gemini-3-pro-preview")).toEqual({
      supported: true,
      efforts: ["low", "high"],
      default: "high",
      mandatory: true,
    })
    expect(getModelThinking("gemini-3-flash-preview")).toMatchObject({
      efforts: ["minimal", "low", "medium", "high"],
      default: "high",
    })
    expect(getModelThinking("gemini-2.5-pro")).toMatchObject({
      efforts: ["low", "medium", "high"],
      mandatory: true,
    })
    expect(getModelThinking("gemini-2.5-flash")).toMatchObject({
      efforts: ["none", "low", "medium", "high"],
      mandatory: false,
    })
  })

  it("uses official xAI, DeepSeek, MiniMax, Qwen, and MiMo efforts", () => {
    expect(getModelThinking("grok-4.6")).toEqual({
      supported: true,
      efforts: ["low", "medium", "high", "xhigh"],
      default: "high",
      mandatory: true,
    })
    expect(getModelThinking("grok-4.5")).toMatchObject({
      efforts: ["low", "medium", "high"],
      default: "high",
      mandatory: true,
    })
    expect(getModelThinking("grok-4.3")).toEqual({
      supported: true,
      efforts: ["none", "low", "medium", "high"],
      default: "low",
      mandatory: false,
    })
    expect(getModelThinking("deepseek-v4-pro")).toEqual({
      supported: true,
      efforts: ["none", "low", "high", "max"],
      default: "high",
      mandatory: false,
    })
    expect(getModelThinking("MiniMax-M3")).toEqual({
      supported: true,
      efforts: ["none", "high"],
      default: "high",
      mandatory: false,
    })
    expect(getModelThinking("MiniMax-M2.5")).toEqual({
      supported: true,
      efforts: ["high"],
      default: "high",
      mandatory: true,
    })
    expect(getModelThinking("qwen3.8-max")).toEqual({
      supported: true,
      efforts: ["none", "low", "medium", "xhigh"],
      default: "xhigh",
      mandatory: false,
    })
    expect(getModelThinking("qwen3.7-plus")).toEqual({
      supported: true,
      efforts: ["none", "high"],
      default: "high",
      mandatory: false,
    })
    expect(getModelThinking("mimo-v2.5-pro")).toEqual({
      supported: true,
      efforts: ["none", "high"],
      default: "high",
      mandatory: false,
    })
  })

  it("uses an exact remote catalog record instead of a parent id", () => {
    expect(
      getModelMeta("gpt-5.6-luna", 5, {
        id: "gpt-5.6-luna",
        name: "GPT-5.6 Luna",
        provider: "openai",
        created_by: "openai",
        source: "official",
        last_updated: "2026-08-16",
        family: "gpt-5.6",
        context_window: 1_050_000,
        pricing: { input: 0.2, output: 1.2 },
        capabilities: {
          reasoning: true,
          vision: true,
          tool_call: true,
        },
        tools: ["function_calling"],
        modalities: { input: ["text", "image"], output: ["text"] },
      })
    ).toMatchObject({
      name: "GPT-5.6 Luna",
      context: "1.1M",
      price: "$0.2 / $1.2",
      capabilities: ["vision", "thinking", "tools"],
    })
  })

  it("returns the numeric context window from a remote catalog record", () => {
    expect(
      getModelContextWindow("gpt-5.6-luna", 5, {
        id: "gpt-5.6-luna",
        name: "GPT-5.6 Luna",
        provider: "openai",
        created_by: "openai",
        source: "official",
        last_updated: "2026-08-16",
        family: "gpt-5.6",
        context_window: 1_050_000,
        pricing: { input: 0.2, output: 1.2 },
        capabilities: {
          reasoning: true,
          vision: true,
          tool_call: true,
        },
        tools: ["function_calling"],
        modalities: { input: ["text", "image"], output: ["text"] },
      })
    ).toBe(1_050_000)
  })

  it("does not invent parent catalog data for an exact spark id", () => {
    expect(getModelContextWindow("gpt-5.3-codex-spark", 5)).toBeUndefined()
    expect(getModelMeta("gpt-5.3-codex-spark", 5).context).toBeUndefined()
    expect(getModelThinking("gpt-5.3-codex-spark", 5)).toMatchObject({
      supported: true,
      efforts: ["low", "medium", "high", "xhigh"],
    })
  })
})

describe("getModelLogoKind", () => {
  it("uses provider type when the id has no vendor hint", () => {
    expect(getModelLogoKind(1, "sonnet")).toBe("claude")
    expect(getModelLogoKind(2, "flash")).toBe("gemini")
    expect(getModelLogoKind(3, "latest")).toBe("xai")
    expect(getModelLogoKind(0, "gpt-4o")).toBe("openai")
  })

  it("prefers model id vendor for OpenRouter", () => {
    expect(getModelLogoKind(4, "anthropic/claude-sonnet-4")).toBe("claude")
    expect(getModelLogoKind(4, "google/gemini-2.5-pro")).toBe("gemini")
    expect(getModelLogoKind(4, "x-ai/grok-4")).toBe("xai")
    expect(getModelLogoKind(4, "openai/gpt-5.6-luna")).toBe("openai")
  })

  it("does not use the OpenAI logo for unrelated vendors", () => {
    expect(getModelLogoKind(4, "qwen3.8-max")).toBeUndefined()
    expect(getModelLogoKind(4, "deepseek-v4-pro")).toBeUndefined()
    expect(getModelLogoKind(4, "MiniMax-M3")).toBeUndefined()
  })
})
