import { beforeEach, describe, expect, it } from "vitest"

import {
  getConversationTuning,
  isConversationTuningActive,
  useConversationTuningStore,
} from "@/features/chat/conversation-tuning"

describe("conversation tuning", () => {
  beforeEach(() => {
    useConversationTuningStore.setState({ byId: {} })
  })

  it("keeps sampling and limits per conversation", () => {
    useConversationTuningStore.getState().patchTuning("conv-a", {
      temperature: 0.2,
      max_tokens: 6,
    })
    useConversationTuningStore.getState().patchTuning("conv-b", {
      temperature: 1.1,
    })

    expect(getConversationTuning("conv-a")).toMatchObject({
      temperature: 0.2,
      max_tokens: 6,
    })
    expect(getConversationTuning("conv-b").temperature).toBe(1.1)
    expect(getConversationTuning("conv-b").max_tokens).toBeNull()
    expect(isConversationTuningActive(getConversationTuning("conv-a"))).toBe(
      true
    )
    expect(isConversationTuningActive(getConversationTuning(null))).toBe(false)
  })

  it("moves draft tuning onto a new conversation id", () => {
    useConversationTuningStore.getState().patchTuning(null, {
      max_tokens: 800,
      extra_body: { foo: 1 },
    })
    useConversationTuningStore.getState().adoptDraftTuning("conv-new")

    expect(getConversationTuning("conv-new")).toMatchObject({
      max_tokens: 800,
      extra_body: { foo: 1 },
    })
    expect(isConversationTuningActive(getConversationTuning(null))).toBe(false)
  })

  it("treats conversation sampling, advisor off, MCP writes, and logit bias as active", () => {
    useConversationTuningStore.getState().patchTuning("conv-runtime", {
      temperature: 0,
      advisor_model: "",
      mcp_approve_writes: false,
      logit_bias: { "9": 1 },
    })
    expect(
      isConversationTuningActive(getConversationTuning("conv-runtime"))
    ).toBe(true)
    expect(getConversationTuning("conv-runtime")).toMatchObject({
      temperature: 0,
      advisor_model: "",
      mcp_approve_writes: false,
      logit_bias: { "9": 1 },
    })
  })
})
