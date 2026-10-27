import type { ModelItem, ProviderOption } from "@/lib/types"

const OPENAI_UNSUPPORTED_IMAGE_PREFIXES = ["dall-e-"] as const

function isUnsupportedOpenAiImageModel(modelId: string): boolean {
  const name = modelId.trim().toLowerCase()
  return OPENAI_UNSUPPORTED_IMAGE_PREFIXES.some((prefix) =>
    name.startsWith(prefix)
  )
}

function filterProviders(
  providers: readonly ProviderOption[],
  keep: (model: ModelItem) => boolean
): ProviderOption[] {
  return providers
    .map((provider) => ({
      ...provider,
      models: provider.models.filter(keep),
    }))
    .filter((provider) => provider.models.length > 0)
}

export function isImagePickerModel(
  model: Pick<ModelItem, "kind" | "model_id">
): boolean {
  return (
    model.kind === "image" && !isUnsupportedOpenAiImageModel(model.model_id)
  )
}

export function isChatPickerModel(
  model: Pick<ModelItem, "kind">
): boolean {
  return model.kind === "chat"
}

export function filterImageGenerationProviders(
  providers: readonly ProviderOption[]
): ProviderOption[] {
  return filterProviders(providers, isImagePickerModel)
}

export function filterChatProviders(
  providers: readonly ProviderOption[]
): ProviderOption[] {
  return filterProviders(providers, isChatPickerModel)
}
