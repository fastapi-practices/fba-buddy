import { describe, expect, it } from "vitest"

import { toImageCompletionBody, toImageForwardedPropsApi } from "@/api/image"

describe("toImageForwardedPropsApi", () => {
  it("maps image fields to the dedicated generations contract", () => {
    const payload = toImageForwardedPropsApi({
      provider_id: 5,
      model_id: "gpt-image-2",
      generation_type: "image",
      image_size: "1024x1024",
      image_quality: "high",
      image_aspect_ratio: "1:1",
      image_background: "opaque",
      image_input_fidelity: "high",
      image_moderation: "low",
      image_output_format: "png",
      image_output_compression: 80,
      mcp_ids: [1],
      thinking: true,
    })
    expect(payload).toEqual({
      providerId: 5,
      modelId: "gpt-image-2",
      generationType: "image",
      background: "opaque",
      inputFidelity: "high",
      moderation: "low",
      outputCompression: 80,
      outputFormat: "png",
      quality: "high",
      size: "1024x1024",
      aspectRatio: "1:1",
    })
    expect(payload).not.toHaveProperty("imageSize")
    expect(payload).not.toHaveProperty("mcpIds")
    expect(payload).not.toHaveProperty("thinking")
  })
})

describe("toImageCompletionBody", () => {
  it("posts native RunAgentInput with image forwardedProps", () => {
    const body = toImageCompletionBody({
      conversation_id: "img-1",
      messages: [{ id: "m1", role: "user", content: "一只猫" }],
      forwarded_props: {
        provider_id: 2,
        model_id: "gemini-3-pro-image",
        generation_type: "image",
        image_size: "1K",
        image_aspect_ratio: "16:9",
      },
    })
    expect(body).toMatchObject({
      threadId: "img-1",
      messages: [{ id: "m1", role: "user", content: "一只猫" }],
      tools: [],
      context: [],
      state: {},
      forwardedProps: {
        providerId: 2,
        modelId: "gemini-3-pro-image",
        generationType: "image",
        size: "1K",
        aspectRatio: "16:9",
      },
    })
    expect(typeof body.runId).toBe("string")
    expect(body).not.toHaveProperty("conversationId")
    expect(body).not.toHaveProperty("conversation_id")
    expect(body).not.toHaveProperty("resume")
  })
})
