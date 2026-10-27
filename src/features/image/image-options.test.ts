import { describe, expect, it } from "vitest"

import {
  extractImageUrls,
  imageAspectOptionsForProvider,
  imageSizeOptionsForProvider,
  isImageAspectRatio,
  isImageInputFidelity,
  isImageSize,
  parseImageCompression,
  sanitizeImageForwardedProps,
} from "@/features/image/image-options"
import { AI_PROVIDER_TYPE } from "@/lib/types"

describe("extractImageUrls", () => {
  it("collects markdown, html, data and bare image urls without duplicates", () => {
    const urls = extractImageUrls(
      [
        "先看 ![猫](https://cdn.example/a.png)",
        '<img src="https://cdn.example/a.png" alt="same">',
        "还有 https://cdn.example/b.webp?w=1",
        "data:image/png;base64,abc123",
      ].join("\n")
    )

    expect(urls).toEqual([
      "https://cdn.example/a.png",
      "data:image/png;base64,abc123",
      "https://cdn.example/b.webp?w=1",
    ])
  })

  it("returns an empty list when the reply has no images", () => {
    expect(extractImageUrls("生成失败，请换一个描述")).toEqual([])
  })
})

describe("image option guards", () => {
  it("accepts known size and aspect values", () => {
    expect(isImageSize("1K")).toBe(true)
    expect(isImageSize("8K")).toBe(false)
    expect(isImageAspectRatio("16:9")).toBe(true)
    expect(isImageAspectRatio("21:9")).toBe(true)
    expect(isImageSize("512")).toBe(true)
    expect(isImageAspectRatio("7:3")).toBe(false)
    expect(isImageInputFidelity("high")).toBe(true)
    expect(parseImageCompression(80)).toBe(80)
    expect(parseImageCompression(0)).toBe(0)
    expect(parseImageCompression(101)).toBeUndefined()
    expect(parseImageCompression(12.5)).toBeUndefined()
  })

  it("limits size and aspect options by provider", () => {
    expect(
      imageSizeOptionsForProvider(AI_PROVIDER_TYPE.google).map(
        (item) => item.value
      )
    ).toEqual(["512", "1K", "2K", "4K"])
    expect(
      imageSizeOptionsForProvider(AI_PROVIDER_TYPE.openai_responses).map(
        (item) => item.value
      )
    ).toEqual(["auto", "1024x1024", "1024x1536", "1536x1024"])
    expect(
      imageSizeOptionsForProvider(AI_PROVIDER_TYPE.xai).map((item) => item.value)
    ).toEqual(["1K", "2K"])
    expect(
      imageAspectOptionsForProvider(AI_PROVIDER_TYPE.openai_responses).map(
        (item) => item.value
      )
    ).toEqual(["1:1", "3:2", "2:3"])
    expect(
      imageAspectOptionsForProvider(AI_PROVIDER_TYPE.openai).map(
        (item) => item.value
      )
    ).toEqual(["1:1", "3:2", "2:3"])
  })
})

describe("sanitizeImageForwardedProps", () => {
  it("drops OpenAI-only fields and pixel sizes for Google", () => {
    const payload = sanitizeImageForwardedProps(
      {
        provider_id: 2,
        model_id: "gemini-3-pro-image",
        generation_type: "image",
        image_size: "1024x1024",
        image_aspect_ratio: "16:9",
        image_quality: "high",
        image_output_format: "jpeg",
        image_output_compression: 75,
        image_input_fidelity: "high",
      },
      AI_PROVIDER_TYPE.google
    )
    expect(payload.image_size).toBeUndefined()
    expect(payload.image_aspect_ratio).toBe("16:9")
    expect(payload.image_quality).toBeUndefined()
    expect(payload.image_input_fidelity).toBeUndefined()
    expect(payload.image_output_format).toBeUndefined()
    expect(payload.image_output_compression).toBeUndefined()
  })

  it("keeps OpenAI image options and drops Google sizes", () => {
    const payload = sanitizeImageForwardedProps(
      {
        provider_id: 5,
        model_id: "gpt-image-2",
        generation_type: "image",
        image_size: "1K",
        image_aspect_ratio: "16:9",
        image_quality: "high",
      },
      AI_PROVIDER_TYPE.openai_responses
    )
    expect(payload.image_size).toBeUndefined()
    expect(payload.image_aspect_ratio).toBeUndefined()
    expect(payload.image_quality).toBe("high")
  })

  it("keeps OpenAI generate fields and rewrites transparent jpeg to png", () => {
    const payload = sanitizeImageForwardedProps(
      {
        provider_id: 5,
        model_id: "gpt-image-2",
        generation_type: "image",
        image_background: "transparent",
        image_input_fidelity: "high",
        image_moderation: "low",
        image_output_format: "jpeg",
        image_output_compression: 40,
      },
      AI_PROVIDER_TYPE.openai_responses
    )
    expect(payload.image_background).toBe("transparent")
    expect(payload.image_input_fidelity).toBe("high")
    expect(payload.image_moderation).toBe("low")
    expect(payload.image_output_format).toBe("png")
    expect(payload.image_output_compression).toBe(40)
  })
})
