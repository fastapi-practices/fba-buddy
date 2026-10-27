import type { TranslationKey } from "@/lib/i18n"
import { AI_PROVIDER_TYPE, type ForwardedProps } from "@/lib/types"

export type ImageSize = NonNullable<ForwardedProps["image_size"]>
export type ImageQuality = NonNullable<ForwardedProps["image_quality"]>
export type ImageAspectRatio = NonNullable<ForwardedProps["image_aspect_ratio"]>

export const IMAGE_SIZE_OPTIONS: ReadonlyArray<{
  value: ImageSize
  label: TranslationKey
}> = [
  { value: "auto", label: "common.auto" },
  { value: "1024x1024", label: "image.option1024x1024" },
  { value: "1024x1536", label: "image.option1024x1536" },
  { value: "1536x1024", label: "image.option1536x1024" },
  { value: "512", label: "image.option512" },
  { value: "1K", label: "image.option1k" },
  { value: "2K", label: "image.option2k" },
  { value: "4K", label: "image.option4k" },
]

export const IMAGE_QUALITY_OPTIONS: ReadonlyArray<{
  value: ImageQuality
  label: TranslationKey
}> = [
  { value: "auto", label: "common.auto" },
  { value: "low", label: "common.low" },
  { value: "medium", label: "thinking.medium" },
  { value: "high", label: "common.high" },
]

const IMAGE_ASPECT_OPTIONS: ReadonlyArray<{
  value: ImageAspectRatio
  label: TranslationKey
}> = [
  { value: "1:1", label: "image.ratio1x1" },
  { value: "4:3", label: "image.ratio4x3" },
  { value: "3:4", label: "image.ratio3x4" },
  { value: "3:2", label: "image.ratio3x2" },
  { value: "2:3", label: "image.ratio2x3" },
  { value: "16:9", label: "image.ratio16x9" },
  { value: "9:16", label: "image.ratio9x16" },
  { value: "5:4", label: "image.ratio5x4" },
  { value: "4:5", label: "image.ratio4x5" },
  { value: "21:9", label: "image.ratio21x9" },
]

export function isImageSize(value: string): value is ImageSize {
  return IMAGE_SIZE_OPTIONS.some((item) => item.value === value)
}

export function isImageQuality(value: string): value is ImageQuality {
  return IMAGE_QUALITY_OPTIONS.some((item) => item.value === value)
}

export function isImageAspectRatio(value: string): value is ImageAspectRatio {
  return IMAGE_ASPECT_OPTIONS.some((item) => item.value === value)
}

export type ImageBackground = NonNullable<ForwardedProps["image_background"]>
export type ImageOutputFormat = NonNullable<
  ForwardedProps["image_output_format"]
>
export type ImageInputFidelity = NonNullable<
  ForwardedProps["image_input_fidelity"]
>
export type ImageModeration = NonNullable<ForwardedProps["image_moderation"]>

export const DEFAULT_IMAGE_OPTION = "default"

export const IMAGE_BACKGROUND_OPTIONS: ReadonlyArray<{
  value: ImageBackground
  label: TranslationKey
}> = [
  { value: "auto", label: "common.auto" },
  { value: "opaque", label: "common.opaque" },
  { value: "transparent", label: "common.transparent" },
]

export const IMAGE_FORMAT_OPTIONS: ReadonlyArray<{
  value: ImageOutputFormat
  label: TranslationKey
}> = [
  { value: "png", label: "image.optionpng" },
  { value: "webp", label: "image.optionwebp" },
  { value: "jpeg", label: "image.optionjpeg" },
]

export const IMAGE_FIDELITY_OPTIONS: ReadonlyArray<{
  value: ImageInputFidelity
  label: TranslationKey
}> = [
  { value: "low", label: "common.low" },
  { value: "high", label: "common.high" },
]

export const IMAGE_MODERATION_OPTIONS: ReadonlyArray<{
  value: ImageModeration
  label: TranslationKey
}> = [
  { value: "auto", label: "common.auto" },
  { value: "low", label: "common.low" },
]

export function isImageBackground(value: string): value is ImageBackground {
  return IMAGE_BACKGROUND_OPTIONS.some((item) => item.value === value)
}

export function isImageOutputFormat(value: string): value is ImageOutputFormat {
  return IMAGE_FORMAT_OPTIONS.some((item) => item.value === value)
}

export function isImageInputFidelity(
  value: string
): value is ImageInputFidelity {
  return IMAGE_FIDELITY_OPTIONS.some((item) => item.value === value)
}

export function isImageModeration(value: string): value is ImageModeration {
  return IMAGE_MODERATION_OPTIONS.some((item) => item.value === value)
}

export function parseImageCompression(value: unknown): number | undefined {
  if (value == null || value === "") {
    return undefined
  }
  const parsed = typeof value === "number" ? value : Number(value)
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100) {
    return undefined
  }
  return parsed
}

const OPENAI_IMAGE_SIZES = new Set<ImageSize>([
  "auto",
  "1024x1024",
  "1024x1536",
  "1536x1024",
])

const GOOGLE_IMAGE_SIZES = new Set<ImageSize>(["512", "1K", "2K", "4K"])

const XAI_IMAGE_SIZES = new Set<ImageSize>(["1K", "2K"])

const OPENAI_IMAGE_ASPECTS = new Set<ImageAspectRatio>(["1:1", "2:3", "3:2"])

export function imageSizeOptionsForProvider(providerType: number | undefined) {
  if (providerType === AI_PROVIDER_TYPE.google) {
    return IMAGE_SIZE_OPTIONS.filter((item) =>
      GOOGLE_IMAGE_SIZES.has(item.value)
    )
  }
  if (providerType === AI_PROVIDER_TYPE.xai) {
    return IMAGE_SIZE_OPTIONS.filter((item) => XAI_IMAGE_SIZES.has(item.value))
  }
  return IMAGE_SIZE_OPTIONS.filter((item) => OPENAI_IMAGE_SIZES.has(item.value))
}

export function imageAspectOptionsForProvider(
  providerType: number | undefined
) {
  if (
    providerType === AI_PROVIDER_TYPE.openai ||
    providerType === AI_PROVIDER_TYPE.openai_responses
  ) {
    return IMAGE_ASPECT_OPTIONS.filter((item) =>
      OPENAI_IMAGE_ASPECTS.has(item.value)
    )
  }
  return IMAGE_ASPECT_OPTIONS
}

export function usesOpenAiImageOptions(providerType: number | undefined) {
  return (
    providerType == null ||
    providerType === AI_PROVIDER_TYPE.openai ||
    providerType === AI_PROVIDER_TYPE.openai_responses
  )
}

export function sanitizeImageForwardedProps(
  props: ForwardedProps,
  providerType: number | undefined
): ForwardedProps {
  if (providerType == null) {
    return props
  }
  const sizeOk = imageSizeOptionsForProvider(providerType).some(
    (item) => item.value === props.image_size
  )
  const aspectOk = imageAspectOptionsForProvider(providerType).some(
    (item) => item.value === props.image_aspect_ratio
  )
  const openai = usesOpenAiImageOptions(providerType)
  let format = openai ? props.image_output_format || undefined : undefined
  const background = openai ? props.image_background || undefined : undefined
  if (background === "transparent" && format === "jpeg") {
    format = "png"
  }
  return {
    ...props,
    image_size: sizeOk ? props.image_size : undefined,
    image_aspect_ratio: aspectOk ? props.image_aspect_ratio : undefined,
    image_quality: openai ? props.image_quality : undefined,
    image_background: background,
    image_input_fidelity: openai ? props.image_input_fidelity : undefined,
    image_moderation: openai ? props.image_moderation : undefined,
    image_output_format: format,
    image_output_compression: openai
      ? parseImageCompression(props.image_output_compression)
      : undefined,
  }
}

const MARKDOWN_IMAGE = /!\[[^\]]*]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g
const HTML_IMAGE = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi
const DATA_IMAGE = /data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g
const BARE_IMAGE =
  /https?:\/\/[^\s)"']+\.(?:png|jpe?g|gif|webp|svg)(?:\?[^\s)"']*)?/gi

export function extractImageUrls(content: string): string[] {
  const found: string[] = []
  const seen = new Set<string>()

  function push(url: string) {
    const trimmed = url.trim()
    if (!trimmed || seen.has(trimmed)) {
      return
    }
    seen.add(trimmed)
    found.push(trimmed)
  }

  for (const pattern of [MARKDOWN_IMAGE, HTML_IMAGE, DATA_IMAGE, BARE_IMAGE]) {
    pattern.lastIndex = 0
    let match = pattern.exec(content)
    while (match) {
      push(match[1] ?? match[0])
      match = pattern.exec(content)
    }
  }

  return found
}
