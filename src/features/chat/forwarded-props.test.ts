import { beforeEach, describe, expect, it } from "vitest"

import {
  buildForwardedProps,
  buildImageForwardedProps,
  resolveChatForwardedProps,
} from "@/features/chat/forwarded-props"
import { useComposerStore } from "@/features/chat/composer-store"
import { useConversationTuningStore } from "@/features/chat/conversation-tuning"
import {
  currentUserPrefsKey,
  useUserChatPrefsStore,
} from "@/features/settings/user-prefs"
import { useSessionStore } from "@/lib/session"

describe("buildForwardedProps", () => {
  beforeEach(() => {
    useUserChatPrefsStore.setState({ byUser: {} })
    useConversationTuningStore.setState({ byId: {} })
    useSessionStore.setState({ user: null })
  })

  it("copies thinking and web_search from the composer state used by send", () => {
    useComposerStore.setState({
      provider_id: 7,
      model_id: "demo-model",
      thinking: true,
      web_search: "builtin",
      generation_type: "text",
    })

    const payload = buildForwardedProps(useComposerStore.getState())

    expect(payload).toMatchObject({
      provider_id: 7,
      model_id: "demo-model",
      thinking: "high",
      web_search: "builtin",
    })
    expect(payload).toHaveProperty("thinking", "high")
    expect(payload).toHaveProperty("web_search", "builtin")
  })

  it("keeps web search off when the composer toggle is off", () => {
    const payload = buildForwardedProps({
      provider_id: 1,
      model_id: "m",
      thinking: false,
      web_search: "off",
    })
    expect(payload.thinking).toBeNull()
    expect(payload.web_search).toBe("off")
  })

  it("includes mcp_ids when MCPs are selected and omits them when none are", () => {
    const selected = buildForwardedProps({
      provider_id: 1,
      model_id: "m",
      mcp_ids: [3, 8],
    })
    expect(selected.mcp_ids).toEqual([3, 8])

    const none = buildForwardedProps({
      provider_id: 1,
      model_id: "m",
    })
    expect(none.mcp_ids).toBeUndefined()

    const empty = buildForwardedProps({
      provider_id: 1,
      model_id: "m",
      mcp_ids: [],
    })
    expect(empty.mcp_ids).toBeUndefined()
  })

  it("forwards image generation options only when generating images", () => {
    const image = buildForwardedProps({
      provider_id: 1,
      model_id: "m",
      generation_type: "image",
      image_size: "1K",
      image_quality: "high",
      image_aspect_ratio: "16:9",
    })
    expect(image.image_size).toBe("1K")
    expect(image.image_quality).toBe("high")
    expect(image.image_aspect_ratio).toBe("16:9")

    const text = buildForwardedProps({
      provider_id: 1,
      model_id: "m",
      generation_type: "text",
      image_size: "1K",
      image_quality: "high",
      image_aspect_ratio: "16:9",
    })
    expect(text.image_size).toBeUndefined()
    expect(text.image_quality).toBeUndefined()
    expect(text.image_aspect_ratio).toBeUndefined()
  })

  it("builds image-page props with generation_type image and chat tools off", () => {
    const payload = buildImageForwardedProps({
      provider_id: 3,
      model_id: "image-model",
      thinking: true,
      web_search: "exa",
      mcp_ids: [1],
      logit_bias: { "1": -1 },
      image_size: "2K",
      image_quality: "high",
      image_aspect_ratio: "1:1",
    })
    expect(payload).toMatchObject({
      provider_id: 3,
      model_id: "image-model",
      generation_type: "image",
      thinking: null,
      web_search: "off",
      image_size: "2K",
      image_quality: "high",
      image_aspect_ratio: "1:1",
    })
    expect(payload.agent_mode).toBeUndefined()
    expect(payload.mcp_ids).toBeUndefined()
    expect(payload.logit_bias).toBeUndefined()
    expect(payload.memory_enabled).toBeUndefined()
  })

  it("preserves an explicit memory opt-out on text runs", () => {
    const payload = buildForwardedProps({
      provider_id: 1,
      model_id: "m",
      memory_enabled: false,
    })
    expect(payload.memory_enabled).toBe(false)
    expect(JSON.parse(JSON.stringify(payload)).memory_enabled).toBe(false)
  })

  it("reads the current memory setting for every chat round", () => {
    const composer = { provider_id: 1, model_id: "m", memory_enabled: true }
    expect(resolveChatForwardedProps(composer).memory_enabled).toBe(true)

    useUserChatPrefsStore.getState().setPrefs({ memory_enabled: false })
    const disabled = resolveChatForwardedProps(composer, {
      memory_enabled: true,
    })
    expect(disabled.memory_enabled).toBe(false)

    useUserChatPrefsStore.getState().setPrefs({ memory_enabled: true })
    expect(resolveChatForwardedProps(composer).memory_enabled).toBe(true)
  })

  it("preserves catalog max thinking for the backend", () => {
    const payload = buildForwardedProps({
      provider_id: 1,
      model_id: "m",
      thinking: "max",
    })
    expect(payload.thinking).toBe("max")
  })

  it("includes the attached later-period workspace ref on the send payload", () => {
    const payload = buildForwardedProps({
      provider_id: 4,
      model_id: "demo",
      workspace_ref: { kind: "knowledge", id: 21 },
    })
    expect(payload.workspace_ref).toEqual({ kind: "knowledge", id: 21 })
  })

  it("omits advisor and MCP write approval when they are unset", () => {
    const payload = buildForwardedProps({
      provider_id: 1,
      model_id: "m",
    })
    expect(payload.advisor_model).toBeUndefined()
    expect(payload.mcp_approve_writes).toBeUndefined()
    expect(payload.deferred_approvals).toBeUndefined()
    expect(payload.agent_mode).toBe("work")
    expect(payload.permission_mode).toBeUndefined()
    expect(payload.acp_runner).toBeUndefined()
    expect(payload.acp_runner_name).toBeUndefined()
  })

  it("forwards coding mode with permission and acp_runner", () => {
    const payload = buildForwardedProps({
      provider_id: 1,
      model_id: "m",
      agent_mode: "coding",
      permission_mode: "full",
      acp_runner: true,
      acp_runner_name: "opencode",
    })
    expect(payload.agent_mode).toBe("coding")
    expect(payload.permission_mode).toBe("full")
    expect(payload.acp_runner).toBe(true)
    expect(payload.acp_runner_name).toBe("opencode")
  })

  it("sends acp_runner false without a runner name", () => {
    const payload = buildForwardedProps({
      provider_id: 1,
      model_id: "m",
      agent_mode: "coding",
      acp_runner: false,
      acp_runner_name: "pi",
    })
    expect(payload.acp_runner).toBe(false)
    expect(payload.acp_runner_name).toBeUndefined()
  })

  it("forwards advisor and write approval", () => {
    const payload = buildForwardedProps({
      provider_id: 1,
      model_id: "m",
      advisor_model: "openai/gpt-5",
      mcp_approve_writes: true,
      deferred_approvals: { call_write_1: true },
    })
    expect(payload.advisor_model).toBe("openai/gpt-5")
    expect(payload.mcp_approve_writes).toBe(true)
    expect(payload.deferred_approvals).toEqual({ call_write_1: true })
  })

  it("treats empty advisor and false write approval as omitted", () => {
    const payload = buildForwardedProps({
      provider_id: 1,
      model_id: "m",
      advisor_model: "  ",
      mcp_approve_writes: false,
    })
    expect(payload.advisor_model).toBeUndefined()
    expect(payload.mcp_approve_writes).toBeUndefined()
  })

  it("merges persisted user prefs into every chat send", () => {
    useUserChatPrefsStore.setState({
      byUser: {
        [currentUserPrefsKey()]: {
          advisor_model: "openai/gpt-5",
          mcp_approve_writes: true,
        },
      },
    })
    const payload = resolveChatForwardedProps({
      provider_id: 1,
      model_id: "m",
    })
    expect(payload.advisor_model).toBe("openai/gpt-5")
    expect(payload.mcp_approve_writes).toBe(true)
    expect(payload.memory_enabled).toBe(true)
  })

  it("merges per-conversation sampling into chat send", () => {
    useConversationTuningStore.getState().patchTuning("conv-9", {
      temperature: 0.4,
      top_p: 0.8,
      max_tokens: 1024,
      extra_body: { openai_reasoning_effort: "low" },
    })
    const payload = resolveChatForwardedProps(
      { provider_id: 1, model_id: "m" },
      { conversationId: "conv-9" }
    )
    expect(payload.temperature).toBe(0.4)
    expect(payload.top_p).toBe(0.8)
    expect(payload.max_tokens).toBe(1024)
    expect(payload.extra_body).toEqual({
      openai_reasoning_effort: "low",
    })
  })

  it("forwards first-class logit_bias from conversation tuning", () => {
    useConversationTuningStore.getState().patchTuning("conv-bias", {
      logit_bias: { "123": -10, "456": 2 },
    })
    const payload = resolveChatForwardedProps(
      { provider_id: 1, model_id: "m" },
      { conversationId: "conv-bias" }
    )
    expect(payload.logit_bias).toEqual({ "123": -10, "456": 2 })
  })

  it("lets conversation advisor and MCP write approval override user prefs", () => {
    useUserChatPrefsStore.setState({
      byUser: {
        [currentUserPrefsKey()]: {
          advisor_model: "openai/gpt-5",
          mcp_approve_writes: true,
        },
      },
    })
    useConversationTuningStore.getState().patchTuning("conv-over", {
      advisor_model: "anthropic/claude-sonnet-4.6",
      mcp_approve_writes: false,
    })
    const payload = resolveChatForwardedProps(
      { provider_id: 1, model_id: "m" },
      { conversationId: "conv-over" }
    )
    expect(payload.advisor_model).toBe("anthropic/claude-sonnet-4.6")
    expect(payload.mcp_approve_writes).toBeUndefined()
  })

  it("lets a conversation disable inherited advisor", () => {
    useUserChatPrefsStore.setState({
      byUser: {
        [currentUserPrefsKey()]: {
          advisor_model: "openai/gpt-5",
          mcp_approve_writes: true,
        },
      },
    })
    useConversationTuningStore.getState().patchTuning("conv-off", {
      advisor_model: "",
    })
    const payload = resolveChatForwardedProps(
      { provider_id: 1, model_id: "m" },
      { conversationId: "conv-off" }
    )
    expect(payload.advisor_model).toBeUndefined()
    expect(payload.mcp_approve_writes).toBe(true)
  })
})
