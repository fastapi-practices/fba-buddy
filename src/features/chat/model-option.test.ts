import { describe, expect, it } from "vitest"

import {
  buildModelOption,
  modelsForProvider,
  parseModelOptionId,
  resolveChatDefaultModel,
} from "./model-option"
import type { DefaultModel, ModelItem, ProviderOption } from "@/lib/types"

const provider: ProviderOption = {
  id: 1,
  user_id: 1,
  name: "OpenAI",
  type: 0,
  status: 1,
  models: [],
}

function model(
  item: Partial<ModelItem> & Pick<ModelItem, "model_id">
): ModelItem {
  return {
    id: 1,
    provider_id: 1,
    name: item.model_id,
    kind: "chat",
    capabilities: [],
    input_modalities: null,
    thinking_policy: null,
    context_window: null,
    max_output_tokens: null,
    sort: 0,
    status: 1,
    remark: null,
    created_time: "2026-10-26T00:00:00Z",
    updated_time: null,
    ...item,
  }
}

describe("buildModelOption", () => {
  it("uses the backend model name with policy-backed capabilities", () => {
    const option = buildModelOption(
      provider,
      model({
        model_id: "gpt-5.2",
        capabilities: ["thinking"],
        thinking_policy: {
          levels: ["low", "medium", "high"],
          default_level: "medium",
          can_disable: true,
        },
      })
    )
    expect(option.efforts).toBeUndefined()
    expect(option.name).toBe("gpt-5.2")
    expect(option.capabilities).toContain("thinking")
    expect(option.keywords).toContain("gpt-5.2")
    expect(option.keywords).toContain("思考")
  })

  it("omits capabilities the backend does not configure", () => {
    const option = buildModelOption(provider, model({ model_id: "gpt-4o" }))
    expect(option.name).toBe("gpt-4o")
    expect(option.capabilities).toBeUndefined()
  })

  it("prefers backend name, context window, and capabilities", () => {
    const option = buildModelOption(
      provider,
      model({
        model_id: "custom-chat",
        name: "内部对话模型",
        kind: "chat",
        capabilities: ["tools", "thinking"],
        input_modalities: ["text", "image"],
        context_window: 128_000,
      })
    )
    expect(option.name).toBe("内部对话模型")
    expect(option.context).toBe("128k")
    expect(option.capabilities).toEqual(
      expect.arrayContaining(["tools", "thinking", "vision"])
    )
  })

  it("keeps policy-backed thinking capability in model options", () => {
    const option = buildModelOption(
      provider,
      model({
        model_id: "custom-chat",
        capabilities: ["thinking"],
        input_modalities: ["text"],
        thinking_policy: {
          levels: ["low"],
          default_level: null,
          can_disable: false,
        },
      })
    )
    expect(option.capabilities).toContain("thinking")
  })

  it("uses input modalities for vision, audio, video, and PDF even without behavior flags", () => {
    const option = buildModelOption(
      provider,
      model({
        model_id: "custom-chat",
        kind: "chat",
        capabilities: [],
        input_modalities: ["text", "image", "audio", "video", "pdf"],
        thinking_policy: null,
      })
    )
    expect(option.capabilities).toEqual(["vision", "audio", "video", "pdf"])
  })

  it("does not infer unconfigured backend modalities from the catalog", () => {
    const option = buildModelOption(
      provider,
      model({
        model_id: "gpt-4o",
        kind: "chat",
        capabilities: [],
        input_modalities: null,
        thinking_policy: null,
      })
    )
    expect(option.capabilities ?? []).not.toContain("vision")
    expect(option.capabilities ?? []).not.toContain("tools")
  })

  it("hides thinking when backend capabilities omit it", () => {
    const option = buildModelOption(
      provider,
      model({
        model_id: "gpt-5.2",
        capabilities: ["tools"],
        input_modalities: ["text"],
      })
    )
    expect(option.capabilities ?? []).not.toContain("thinking")
  })

  it("parses composite selector ids", () => {
    expect(parseModelOptionId("12:gpt-5.6-luna")).toEqual({
      providerId: 12,
      modelId: "gpt-5.6-luna",
    })
    expect(parseModelOptionId("10:openai/gpt-5")).toEqual({
      providerId: 10,
      modelId: "openai/gpt-5",
    })
    expect(parseModelOptionId("gpt-5.6")).toBeNull()
  })

  it("filters options by provider id without prefix collisions", () => {
    const one = buildModelOption(provider, model({ model_id: "gpt-4o" }))
    const ten = buildModelOption(
      { ...provider, id: 10 },
      model({ model_id: "gpt-5.2" })
    )
    expect(modelsForProvider([one, ten], 1).map((item) => item.id)).toEqual([
      "1:gpt-4o",
    ])
    expect(modelsForProvider([one, ten], 10).map((item) => item.id)).toEqual([
      "10:gpt-5.2",
    ])
  })
})

describe("resolveChatDefaultModel", () => {
  const openai: ProviderOption = {
    id: 1,
    user_id: 1,
    name: "OpenAI",
    type: 0,
    status: 1,
    models: [
      model({ id: 1, provider_id: 1, model_id: "gpt-4o" }),
      model({ id: 2, provider_id: 1, model_id: "gpt-5.2" }),
    ],
  }
  const anthropic: ProviderOption = {
    id: 2,
    user_id: 1,
    name: "Anthropic",
    type: 1,
    status: 1,
    models: [model({ id: 3, provider_id: 2, model_id: "claude-sonnet-4.6" })],
  }

  function defaultModel(
    item: Partial<DefaultModel> & Pick<DefaultModel, "provider_id" | "model_id">
  ): DefaultModel {
    return {
      id: 1,
      kind: "chat",
      provider_name: "OpenAI",
      provider_type: 0,
      status: 1,
      created_time: "2026-10-26T00:00:00Z",
      updated_time: null,
      ...item,
    }
  }

  it("uses the backend default when it is in the chat list", () => {
    expect(
      resolveChatDefaultModel(
        [openai, anthropic],
        defaultModel({ provider_id: 2, model_id: "claude-sonnet-4.6" })
      )
    ).toEqual({ provider_id: 2, model_id: "claude-sonnet-4.6" })
  })

  it("falls back to the first chat model when the backend has no default", () => {
    expect(resolveChatDefaultModel([openai, anthropic], null)).toEqual({
      provider_id: 1,
      model_id: "gpt-4o",
    })
  })

  it("falls back to the first chat model when the default is missing from the list", () => {
    expect(
      resolveChatDefaultModel(
        [openai, anthropic],
        defaultModel({ provider_id: 9, model_id: "missing" })
      )
    ).toEqual({ provider_id: 1, model_id: "gpt-4o" })
  })

  it("returns null when there are no chat models", () => {
    expect(resolveChatDefaultModel([], null)).toBeNull()
  })
})
