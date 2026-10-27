import { describe, expect, it } from "vitest"

import {
  allowedModelModalities,
  createModelWriteBody,
  createProviderWriteBody,
  createRemoteModelWriteBody,
  isProviderDefaultHost,
  normalizeModelModalities,
  pickActiveProviderId,
  resolveProviderApiHost,
  supportsModelKind,
  validateModelForm,
  type ModelFormValues,
} from "@/features/settings/model-settings-params"
import {
  AI_PROVIDER_TYPE,
  type ProviderModelItem,
} from "@/lib/types"

const chatModel = (patch: Partial<ModelFormValues> = {}): ModelFormValues => ({
  model_id: "gpt-test",
  name: null,
  kind: "chat",
  capabilities: [],
  input_modalities: ["text"],
  thinking_policy: null,
  context_window: null,
  max_output_tokens: null,
  sort: 0,
  status: 1,
  remark: null,
  ...patch,
})

describe("pickActiveProviderId", () => {
  it("returns undefined for an empty list", () => {
    expect(pickActiveProviderId([])).toBeUndefined()
    expect(pickActiveProviderId([], 9)).toBeUndefined()
  })

  it("keeps an existing selection and otherwise falls back to the first", () => {
    const providers = [{ id: 3 }, { id: 5 }]
    expect(pickActiveProviderId(providers, 5)).toBe(5)
    expect(pickActiveProviderId(providers, 9)).toBe(3)
    expect(pickActiveProviderId(providers)).toBe(3)
  })
})

describe("provider api host", () => {
  it("treats empty and catalog hosts as default", () => {
    expect(isProviderDefaultHost("")).toBe(true)
    expect(isProviderDefaultHost(" https://api.x.ai/ ")).toBe(true)
    expect(isProviderDefaultHost("https://example.com")).toBe(false)
  })

  it("falls back to the type default and trims a trailing slash", () => {
    expect(resolveProviderApiHost(AI_PROVIDER_TYPE.google, "  ")).toBe(
      "https://generativelanguage.googleapis.com"
    )
    expect(
      resolveProviderApiHost(
        AI_PROVIDER_TYPE.openai,
        " https://custom.example/ "
      )
    ).toBe("https://custom.example")
  })
})

describe("createProviderWriteBody", () => {
  it("trims fields and blanks a custom host back to the default", () => {
    expect(
      createProviderWriteBody({
        name: "  OpenAI  ",
        type: AI_PROVIDER_TYPE.openai,
        api_key: "  sk-test  ",
        api_host: "",
        status: 1,
        remark: "  ",
      })
    ).toEqual({
      name: "OpenAI",
      type: AI_PROVIDER_TYPE.openai,
      api_key: "sk-test",
      api_host: "https://api.openai.com",
      status: 1,
      remark: null,
    })
  })

  it("keeps a custom host", () => {
    expect(
      createProviderWriteBody({
        name: "Self",
        type: AI_PROVIDER_TYPE.openai,
        api_key: "sk",
        api_host: " https://custom.example/ ",
        status: 2,
        remark: "note",
      })
    ).toMatchObject({
      api_host: "https://custom.example",
      status: 2,
      remark: "note",
    })
  })
})

describe("model kind and modality constraints", () => {
  it("limits embedding and image kinds by provider type", () => {
    expect(supportsModelKind(AI_PROVIDER_TYPE.openai, "embedding")).toBe(true)
    expect(supportsModelKind(AI_PROVIDER_TYPE.openrouter, "embedding")).toBe(
      true
    )
    expect(supportsModelKind(AI_PROVIDER_TYPE.anthropic, "embedding")).toBe(
      false
    )
    expect(supportsModelKind(AI_PROVIDER_TYPE.google, "image")).toBe(true)
    expect(supportsModelKind(AI_PROVIDER_TYPE.xai, "image")).toBe(true)
    expect(supportsModelKind(AI_PROVIDER_TYPE.anthropic, "image")).toBe(false)
    expect(supportsModelKind(AI_PROVIDER_TYPE.anthropic, "chat")).toBe(true)
  })

  it("reports allowed modalities per kind", () => {
    expect(allowedModelModalities("embedding")).toEqual(["text"])
    expect(allowedModelModalities("image")).toEqual(["text", "image"])
    expect(allowedModelModalities("chat")).toContain("pdf")
  })

  it("drops unsupported and duplicate modalities", () => {
    expect(
      normalizeModelModalities("image", ["text", "video", "text", "image"])
    ).toEqual(["text", "image"])
  })
})

describe("createModelWriteBody", () => {
  it("trims fields and keeps chat metadata", () => {
    expect(
      createModelWriteBody(
        7,
        chatModel({
          model_id: "  gpt-test  ",
          name: "  GPT Test  ",
          capabilities: ["tools", "thinking"],
          input_modalities: ["text", "image"],
          thinking_policy: {
            levels: ["low", "high"],
            default_level: "low",
            can_disable: false,
          },
          context_window: 128_000,
          max_output_tokens: 0,
          sort: 3,
          remark: "  ",
        })
      )
    ).toEqual({
      provider_id: 7,
      model_id: "gpt-test",
      name: "GPT Test",
      kind: "chat",
      capabilities: ["tools", "thinking"],
      input_modalities: ["text", "image"],
      thinking_policy: {
        levels: ["low", "high"],
        default_level: "low",
        can_disable: false,
      },
      context_window: 128_000,
      max_output_tokens: null,
      sort: 3,
      status: 1,
      remark: null,
    })
  })

  it("clears chat-only fields and empty modalities for non-chat kinds", () => {
    const body = createModelWriteBody(
      7,
      chatModel({
        kind: "embedding",
        capabilities: ["tools"],
        input_modalities: [],
        thinking_policy: {
          levels: ["low"],
          default_level: null,
          can_disable: true,
        },
      })
    )
    expect(body.capabilities).toEqual([])
    expect(body.input_modalities).toBeNull()
    expect(body.thinking_policy).toBeNull()
  })
})

describe("createRemoteModelWriteBody", () => {
  it("maps catalog metadata and trims the display name", () => {
    const remote: ProviderModelItem = {
      id: "reasoner",
      object: null,
      created: null,
      display_name: "  Reasoner  ",
      kind: "chat",
      capabilities: ["thinking"],
      input_modalities: ["text", "image", "pdf"],
      context_window: 100_000,
      max_output_tokens: 4096,
    }
    expect(createRemoteModelWriteBody(7, remote)).toEqual({
      provider_id: 7,
      model_id: "reasoner",
      name: "Reasoner",
      kind: "chat",
      capabilities: ["thinking"],
      input_modalities: ["text", "image", "pdf"],
      thinking_policy: null,
      context_window: 100_000,
      max_output_tokens: 4096,
      sort: 0,
      status: 1,
      remark: null,
    })
  })

  it("drops modalities when the catalog entry has no text input", () => {
    const remote: ProviderModelItem = {
      id: "image-v1",
      object: null,
      created: null,
      display_name: null,
      kind: "image",
      capabilities: ["tools"],
      input_modalities: [],
      context_window: null,
      max_output_tokens: null,
    }
    const body = createRemoteModelWriteBody(7, remote)
    expect(body.name).toBeNull()
    expect(body.capabilities).toEqual([])
    expect(body.input_modalities).toBeNull()
  })
})

describe("validateModelForm", () => {
  it("requires a model id and an OpenRouter namespace prefix", () => {
    expect(
      validateModelForm(AI_PROVIDER_TYPE.openai, chatModel({ model_id: "  " }))
    ).toBe("models.invalidModel")
    expect(
      validateModelForm(
        AI_PROVIDER_TYPE.openrouter,
        chatModel({ model_id: "gpt-test" })
      )
    ).toBe("models.openRouterModelIdRequiresPrefix")
    expect(
      validateModelForm(
        AI_PROVIDER_TYPE.openrouter,
        chatModel({ model_id: "openai/gpt-test" })
      )
    ).toBeNull()
  })

  it("requires text and kind-compatible modalities when specified", () => {
    expect(
      validateModelForm(
        AI_PROVIDER_TYPE.openai,
        chatModel({ input_modalities: ["image"] })
      )
    ).toBe("models.invalidModalities")
    expect(
      validateModelForm(
        AI_PROVIDER_TYPE.openai,
        chatModel({ kind: "embedding", input_modalities: ["text", "image"] })
      )
    ).toBe("models.invalidModalitiesForKind")
    expect(
      validateModelForm(
        AI_PROVIDER_TYPE.openai,
        chatModel({ input_modalities: null })
      )
    ).toBeNull()
  })

  it("rejects non-positive or non-integer numbers", () => {
    expect(
      validateModelForm(
        AI_PROVIDER_TYPE.openai,
        chatModel({ context_window: 0 })
      )
    ).toBe("models.invalidNumbers")
    expect(
      validateModelForm(AI_PROVIDER_TYPE.openai, chatModel({ sort: 1.5 }))
    ).toBe("models.invalidNumbers")
  })

  it("keeps the thinking policy on chat thinking models only", () => {
    expect(
      validateModelForm(
        AI_PROVIDER_TYPE.openai,
        chatModel({
          kind: "embedding",
          thinking_policy: {
            levels: ["low"],
            default_level: null,
            can_disable: true,
          },
        })
      )
    ).toBe("models.invalidThinkingPolicy")
  })

  it("requires the default thinking level to be enabled", () => {
    expect(
      validateModelForm(
        AI_PROVIDER_TYPE.openai,
        chatModel({
          capabilities: ["thinking"],
          thinking_policy: {
            levels: ["low", "high"],
            default_level: "medium",
            can_disable: false,
          },
        })
      )
    ).toBe("models.invalidThinkingDefaultLevel")
    expect(
      validateModelForm(
        AI_PROVIDER_TYPE.openai,
        chatModel({
          capabilities: ["thinking"],
          thinking_policy: {
            levels: ["low", "high"],
            default_level: "high",
            can_disable: false,
          },
        })
      )
    ).toBeNull()
  })
})
