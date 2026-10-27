import { describe, expect, it } from "vitest"

import {
  filterChatProviders,
  filterImageGenerationProviders,
  isChatPickerModel,
  isImagePickerModel,
} from "@/features/image/image-models"
import { AI_PROVIDER_TYPE, type ProviderOption } from "@/lib/types"

describe("picker model kinds", () => {
  it("routes chat, image, and embedding kinds to only their supported pickers", () => {
    expect(isChatPickerModel({ kind: "chat" })).toBe(true)
    expect(isImagePickerModel({ kind: "chat", model_id: "gpt-5" })).toBe(false)
    expect(isImagePickerModel({ kind: "image", model_id: "gpt-image-2" })).toBe(
      true
    )
    expect(isChatPickerModel({ kind: "image" })).toBe(false)
    expect(isChatPickerModel({ kind: "embedding" })).toBe(false)
    expect(
      isImagePickerModel({
        kind: "embedding",
        model_id: "text-embedding-3-small",
      })
    ).toBe(false)
  })
})

describe("provider filters", () => {
  it("keeps only image models supported by the image generator", () => {
    const providers: ProviderOption[] = [
      {
        id: 1,
        user_id: 1,
        name: "OpenAI",
        type: AI_PROVIDER_TYPE.openai,
        status: 1,
        models: (
          [
            { model_id: "gpt-5", kind: "chat" },
            { model_id: "dall-e-3", kind: "image" },
            { model_id: "gpt-image-2", kind: "image" },
            { model_id: "text-embedding-3-small", kind: "embedding" },
          ] satisfies {
            model_id: string
            kind: "chat" | "image" | "embedding"
          }[]
        ).map((model, index) => ({
          ...model,
          id: index + 1,
          provider_id: 1,
          name: model.model_id,
          capabilities: [],
          input_modalities: null,
          thinking_policy: null,
          context_window: null,
          max_output_tokens: null,
          sort: index,
          status: 1,
          remark: null,
          created_time: "2026-10-26T00:00:00Z",
          updated_time: null,
        })),
      },
    ]
    expect(
      filterImageGenerationProviders(providers)[0]?.models.map(
        (model) => model.model_id
      )
    ).toEqual(["gpt-image-2"])
  })

  it("keeps only chat models for chat pickers", () => {
    const providers: ProviderOption[] = [
      {
        id: 1,
        user_id: 1,
        name: "OpenAI",
        type: AI_PROVIDER_TYPE.openai,
        status: 1,
        models: (
          [
            { model_id: "gpt-5", kind: "chat" },
            { model_id: "gpt-image-2", kind: "image" },
            { model_id: "text-embedding-3-small", kind: "embedding" },
          ] satisfies {
            model_id: string
            kind: "chat" | "image" | "embedding"
          }[]
        ).map((model, index) => ({
          ...model,
          id: index + 1,
          provider_id: 1,
          name: model.model_id,
          capabilities: [],
          input_modalities: null,
          thinking_policy: null,
          context_window: null,
          max_output_tokens: null,
          sort: index,
          status: 1,
          remark: null,
          created_time: "2026-10-26T00:00:00Z",
          updated_time: null,
        })),
      },
    ]
    expect(
      filterChatProviders(providers)[0]?.models.map((model) => model.model_id)
    ).toEqual(["gpt-5"])
  })
})
