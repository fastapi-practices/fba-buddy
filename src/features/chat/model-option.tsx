/* eslint-disable react-refresh/only-export-components */
import { translate } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { ReactNode } from "react"
import { BotIcon } from "lucide-react"

import {
  ClaudeLogo,
  GeminiLogo,
  OpenAILogo,
  XaiLogo,
} from "@/components/ai-elements/logos"
import {
  formatContextLength,
  getModelLogoKind,
  getModelMeta,
  getModelThinking,
  MODEL_CAPABILITY_LABELS,
  normalizeModelId,
  type ModelCapability,
} from "@/features/chat/model-meta"
import type { CatalogModel } from "@/features/chat/modelpedia-client"
import type {
  BackendModelCapability,
  DefaultModel,
  ModelItem,
  ModelModality,
  ProviderOption,
} from "@/lib/types"

/** 思考强度档位 */
export type ModelSelectorEffortOption = {
  id: string
  name: string
}

export const DEFAULT_EFFORT_OPTIONS: readonly ModelSelectorEffortOption[] = [
  { id: "low", name: "Low" },
  { id: "medium", name: "Med" },
  { id: "high", name: "High" },
]

/** 供应商色调，图标底盘共用 */
export type ModelTone = "emerald" | "orange" | "blue" | "violet" | "zinc"

const TONE_CLASS: Record<ModelTone, { disc: string }> = {
  emerald: {
    disc: "bg-emerald-500/12",
  },
  orange: {
    disc: "bg-orange-500/12",
  },
  blue: {
    disc: "bg-blue-500/12",
  },
  violet: {
    disc: "bg-violet-500/12",
  },
  zinc: {
    disc: "bg-zinc-500/12",
  },
}

/** 色调底盘，模型图标与卡片共用 */
export function modelToneSurface(tone: ModelTone | undefined) {
  return cn(
    "flex size-7 shrink-0 items-center justify-center rounded-full",
    TONE_CLASS[tone ?? "zinc"].disc
  )
}

export type ModelOption = {
  id: string
  name: string
  providerId?: string
  tone?: ModelTone
  description?: string
  icon?: ReactNode
  disabled?: boolean
  keywords?: readonly string[]
  efforts?: boolean | readonly ModelSelectorEffortOption[]
  context?: string
  price?: string
  capabilities?: readonly string[]
}

/** 供应商类型对应色调，图标底盘、选中态与色条共用 */
const PROVIDER_TONES: Record<number, ModelTone> = {
  0: "emerald",
  1: "orange",
  2: "blue",
  3: "zinc",
  4: "violet",
  5: "emerald",
}

export function providerTone(providerType: number | undefined): ModelTone {
  if (providerType == null) return "zinc"
  return PROVIDER_TONES[providerType] ?? "zinc"
}

function ModelLogo({
  providerType,
  modelId,
}: {
  providerType: number
  modelId: string
}): ReactNode {
  const kind = getModelLogoKind(providerType, modelId)
  if (kind === "claude") {
    return <ClaudeLogo className="size-4" />
  }
  if (kind === "gemini") {
    return <GeminiLogo className="size-4" />
  }
  if (kind === "xai") {
    return <XaiLogo className="size-4" />
  }
  if (kind === "openai") {
    return <OpenAILogo className="size-4" />
  }
  return <BotIcon className="size-4" />
}

export function modelOptionId(providerId: number, modelId: string): string {
  return `${providerId}:${modelId}`
}

export function parseModelOptionId(
  value: string
): { providerId: number; modelId: string } | null {
  const separator = value.indexOf(":")
  if (separator <= 0) {
    return null
  }
  const providerId = Number(value.slice(0, separator))
  if (!Number.isInteger(providerId)) {
    return null
  }
  return { providerId, modelId: value.slice(separator + 1) }
}

export function modelsForProvider(
  models: readonly ModelOption[],
  providerId: number
): ModelOption[] {
  return models.filter((model) => {
    const parsed = parseModelOptionId(model.id)
    return parsed?.providerId === providerId
  })
}

export function resolveChatDefaultModel(
  chatProviders: readonly ProviderOption[],
  defaultModel?: DefaultModel | null
): { provider_id: number; model_id: string } | null {
  if (
    defaultModel &&
    chatProviders.some(
      (provider) =>
        provider.id === defaultModel.provider_id &&
        provider.models.some(
          (model) => model.model_id === defaultModel.model_id
        )
    )
  ) {
    return {
      provider_id: defaultModel.provider_id,
      model_id: defaultModel.model_id,
    }
  }
  const first = chatProviders[0]?.models[0]
  if (!first) {
    return null
  }
  return { provider_id: first.provider_id, model_id: first.model_id }
}

const BACKEND_CAPABILITY_MAP: Record<BackendModelCapability, ModelCapability> =
  {
    thinking: "thinking",
    tools: "tools",
  }

const INPUT_MODALITY_MAP: Partial<Record<ModelModality, ModelCapability>> = {
  image: "vision",
  audio: "audio",
  video: "video",
  pdf: "pdf",
}

function capabilitiesFromBackend(
  values: readonly BackendModelCapability[] | undefined,
  modalities: readonly ModelModality[] | null | undefined
): ModelCapability[] {
  const capabilities: ModelCapability[] = []
  for (const item of values ?? []) {
    const mapped = BACKEND_CAPABILITY_MAP[item]
    if (mapped && !capabilities.includes(mapped)) {
      capabilities.push(mapped)
    }
  }
  for (const item of modalities ?? []) {
    const mapped = INPUT_MODALITY_MAP[item]
    if (mapped && !capabilities.includes(mapped)) {
      capabilities.push(mapped)
    }
  }
  return capabilities
}

export function buildModelOption(
  provider: ProviderOption,
  model: ModelItem,
  extra?: Partial<ModelOption>,
  catalog?: Map<string, CatalogModel>
): ModelOption {
  const remote = catalog?.get(normalizeModelId(model.model_id))
  const meta = getModelMeta(model.model_id, provider.type, remote)
  const thinking = getModelThinking(
    model.model_id,
    provider.type,
    remote,
    model.capabilities,
    model.thinking_policy
  )
  const catalogCapabilities = meta.capabilities ?? []
  const capabilities = [
    ...capabilitiesFromBackend(model.capabilities, model.input_modalities),
    ...catalogCapabilities.filter(
      (item) => item === "search" || item === "free"
    ),
  ].filter((item, index, list) => list.indexOf(item) === index)
  if (thinking?.supported && !capabilities.includes("thinking")) {
    capabilities.push("thinking")
  }
  const displayName = model.name.trim() || meta.name || model.model_id
  const context =
    model.context_window != null && model.context_window > 0
      ? formatContextLength(model.context_window)
      : meta.context
  const capabilityLabels = capabilities.flatMap((capability) => [
    translate("zh-CN", MODEL_CAPABILITY_LABELS[capability]),
    translate("en-US", MODEL_CAPABILITY_LABELS[capability]),
  ])
  return {
    id: modelOptionId(provider.id, model.model_id),
    providerId: String(provider.id),
    tone: providerTone(provider.type),
    name: displayName,
    icon: <ModelLogo providerType={provider.type} modelId={model.model_id} />,
    context,
    price: meta.price,
    capabilities: capabilities.length > 0 ? capabilities : undefined,
    keywords: [
      provider.name,
      model.model_id,
      displayName,
      ...capabilities,
      ...capabilityLabels,
    ],
    ...extra,
  }
}

export function buildProviderModelOptions(
  providers: ProviderOption[],
  extra?:
    | Partial<ModelOption>
    | ((provider: ProviderOption, model: ModelItem) => Partial<ModelOption>),
  catalog?: Map<string, CatalogModel>
): ModelOption[] {
  return providers.flatMap((provider) =>
    provider.models.map((model) =>
      buildModelOption(
        provider,
        model,
        typeof extra === "function" ? extra(provider, model) : extra,
        catalog
      )
    )
  )
}
