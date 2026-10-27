import { describe, expect, it } from "vitest"

import {
  ADVISOR_INHERIT,
  ADVISOR_OFF,
  advisorModelChoices,
  parseAdvisorModel,
  parseExtraBody,
  parseLogitBias,
  parseOptionalBoundedNumber,
  parseOptionalLimit,
  parseStopSequences,
} from "@/features/chat/chat-prefs"

describe("chat prefs parsers", () => {
  it("omits empty and non-positive limits instead of defaulting to 50/40", () => {
    expect(parseOptionalLimit(undefined)).toBeUndefined()
    expect(parseOptionalLimit("")).toBeUndefined()
    expect(parseOptionalLimit(0)).toBeUndefined()
    expect(parseOptionalLimit(1.5)).toBeUndefined()
    expect(parseOptionalLimit(9)).toBe(9)
  })

  it("omits blank advisor models", () => {
    expect(parseAdvisorModel("")).toBeUndefined()
    expect(parseAdvisorModel("openai/gpt-5")).toBe("openai/gpt-5")
  })

  it("keeps temperature 0 and rejects out-of-range sampling", () => {
    expect(parseOptionalBoundedNumber(0, 0, 2)).toBe(0)
    expect(parseOptionalBoundedNumber(2.1, 0, 2)).toBeUndefined()
    expect(parseStopSequences("END\nSTOP")).toEqual(["END", "STOP"])
    expect(parseExtraBody('{"openai_reasoning_effort":"low"}')).toEqual({
      openai_reasoning_effort: "low",
    })
    expect(parseExtraBody("[]")).toBeUndefined()
  })

  it("parses first-class logit_bias as token id to integer", () => {
    expect(parseLogitBias(undefined)).toBeUndefined()
    expect(parseLogitBias("")).toBeUndefined()
    expect(parseLogitBias({})).toBeUndefined()
    expect(parseLogitBias('{"123":-10,"456":5}')).toEqual({
      "123": -10,
      "456": 5,
    })
    expect(parseLogitBias({ "11": -2 })).toEqual({ "11": -2 })
    expect(parseLogitBias({ "11": 1.5 })).toBeUndefined()
    expect(parseLogitBias("[]")).toBeUndefined()
  })

  it("lists enabled model ids once for the advisor picker", () => {
    const items = advisorModelChoices([
      {
        name: "OpenRouter",
        models: [
          { model_id: "openai/gpt-5" },
          { model_id: "anthropic/claude-sonnet-4.6" },
          { model_id: "text-embedding-3-small", kind: "embedding" },
          { model_id: "gpt-image-2", kind: "image" },
        ],
      },
      {
        name: "OpenAI",
        models: [{ model_id: "openai/gpt-5", name: "GPT-5" }],
      },
    ])
    expect(items.map((item) => item.value)).toEqual([
      "openai/gpt-5",
      "anthropic/claude-sonnet-4.6",
    ])
    expect(ADVISOR_OFF).toBe("__off__")
    expect(ADVISOR_INHERIT).toBe("__inherit__")
  })
})
