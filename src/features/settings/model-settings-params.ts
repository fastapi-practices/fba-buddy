import type { TranslationKey } from "@/lib/i18n"
import {
  AI_PROVIDER_DEFAULT_HOST,
  AI_PROVIDER_TYPE,
  type AIProviderType,
  type BackendModelCapability,
  type ModelKind,
  type ModelModality,
  type ModelWriteBody,
  type MyModelItem,
  type ProviderModelItem,
  type ProviderWriteBody,
  type ThinkingPolicy,
} from "@/lib/types"

const MODEL_KIND_ITEMS: { value: ModelKind; label: TranslationKey }[] = [
  { value: "chat", label: "common.chat" },
  { value: "embedding", label: "common.embedding" },
  { value: "image", label: "common.draw" },
]

export const MODEL_CAPABILITY_ITEMS: {
  value: BackendModelCapability
  label: TranslationKey
}[] = [
  { value: "tools", label: "common.tools" },
  { value: "thinking", label: "common.thinking" },
]

export const MODEL_MODALITY_ITEMS: {
  value: ModelModality
  label: TranslationKey
}[] = [
  { value: "text", label: "common.text" },
  { value: "image", label: "common.image" },
  { value: "audio", label: "common.audio" },
  { value: "video", label: "common.video" },
  { value: "pdf", label: "common.pdfDocument" },
]

export const THINKING_LEVELS: ThinkingPolicy["levels"] = [
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]

const EMBEDDING_PROVIDER_TYPES = new Set<AIProviderType>([
  AI_PROVIDER_TYPE.openai,
  AI_PROVIDER_TYPE.openai_responses,
  AI_PROVIDER_TYPE.openrouter,
])

const IMAGE_PROVIDER_TYPES = new Set<AIProviderType>([
  AI_PROVIDER_TYPE.google,
  AI_PROVIDER_TYPE.openai,
  AI_PROVIDER_TYPE.openai_responses,
  AI_PROVIDER_TYPE.xai,
])

export type ProviderFormValues = {
  name: string
  type: AIProviderType
  api_key: string
  api_host: string
  status: number
  remark: string | null
}

export type ModelFormValues = {
  model_id: string
  name: string | null
  kind: ModelKind
  capabilities: BackendModelCapability[]
  input_modalities: ModelModality[] | null
  thinking_policy: ThinkingPolicy | null
  context_window: number | null
  max_output_tokens: number | null
  sort: number
  status: number
  remark: string | null
}

export function pickActiveProviderId(
  providers: { id: number }[],
  currentId?: number | null
) {
  if (providers.length === 0) return undefined
  if (currentId != null && providers.some((item) => item.id === currentId)) {
    return currentId
  }
  return providers[0]?.id
}

export function getProviderDefaultHost(type: AIProviderType) {
  return AI_PROVIDER_DEFAULT_HOST[type] ?? AI_PROVIDER_DEFAULT_HOST[0]
}

function normalizeProviderApiHost(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\/+$/, "")
}

export function isProviderDefaultHost(value: string | null | undefined) {
  const host = normalizeProviderApiHost(value)
  if (!host) return true
  return Object.values(AI_PROVIDER_DEFAULT_HOST).includes(host)
}

export function resolveProviderApiHost(
  type: AIProviderType,
  value: string | null | undefined
) {
  const host = normalizeProviderApiHost(value)
  return host || getProviderDefaultHost(type)
}

export function createProviderWriteBody(
  values: ProviderFormValues
): ProviderWriteBody {
  return {
    name: values.name.trim(),
    type: values.type,
    api_key: values.api_key.trim(),
    api_host: resolveProviderApiHost(values.type, values.api_host),
    status: values.status,
    remark: values.remark?.trim() || null,
  }
}

export function supportsModelKind(providerType: AIProviderType, kind: ModelKind) {
  if (kind === "embedding") return EMBEDDING_PROVIDER_TYPES.has(providerType)
  if (kind === "image") return IMAGE_PROVIDER_TYPES.has(providerType)
  return true
}

export function modelKindItems(providerType: AIProviderType) {
  return MODEL_KIND_ITEMS.filter((item) =>
    supportsModelKind(providerType, item.value)
  )
}

export function allowedModelModalities(kind: ModelKind): ModelModality[] {
  if (kind === "embedding") return ["text"]
  if (kind === "image") return ["text", "image"]
  return ["text", "image", "audio", "video", "pdf"]
}

export function normalizeModelModalities(
  kind: ModelKind,
  modalities: ModelModality[]
): ModelModality[] {
  const allowed = new Set(allowedModelModalities(kind))
  return [...new Set(modalities.filter((item) => allowed.has(item)))]
}

export function canConfigureThinkingPolicy(values: {
  kind: ModelKind
  capabilities: BackendModelCapability[]
}) {
  return values.kind === "chat" && values.capabilities.includes("thinking")
}

export function modelFormValues(model?: MyModelItem | null): ModelFormValues {
  return {
    model_id: model?.model_id ?? "",
    name: model?.name ?? null,
    kind: model?.kind ?? "chat",
    capabilities: model?.capabilities ?? [],
    input_modalities: model?.input_modalities ?? ["text"],
    thinking_policy: model?.thinking_policy ?? null,
    context_window: model?.context_window ?? null,
    max_output_tokens: model?.max_output_tokens ?? null,
    sort: model?.sort ?? 0,
    status: model?.status ?? 1,
    remark: model?.remark ?? null,
  }
}

function toOptionalNumber(value: number | null) {
  return typeof value === "number" && value > 0 ? value : null
}

export function createModelWriteBody(
  providerId: number,
  values: ModelFormValues
): ModelWriteBody {
  const policy =
    canConfigureThinkingPolicy(values) && values.thinking_policy
      ? {
          levels: values.thinking_policy.levels,
          default_level: values.thinking_policy.default_level,
          can_disable: values.thinking_policy.can_disable,
        }
      : null

  return {
    provider_id: providerId,
    model_id: values.model_id.trim(),
    name: values.name?.trim() || null,
    kind: values.kind,
    capabilities: values.kind === "chat" ? values.capabilities : [],
    input_modalities: values.input_modalities?.length
      ? values.input_modalities
      : null,
    thinking_policy: policy,
    context_window: toOptionalNumber(values.context_window),
    max_output_tokens: toOptionalNumber(values.max_output_tokens),
    sort: values.sort,
    status: values.status,
    remark: values.remark?.trim() || null,
  }
}

export function createRemoteModelWriteBody(
  providerId: number,
  model: ProviderModelItem
): ModelWriteBody {
  const modalities = model.input_modalities.includes("text")
    ? normalizeModelModalities(model.kind, model.input_modalities)
    : null

  return {
    provider_id: providerId,
    model_id: model.id,
    name: model.display_name?.trim() || null,
    kind: model.kind,
    capabilities: model.kind === "chat" ? model.capabilities : [],
    input_modalities: modalities,
    thinking_policy: null,
    context_window: model.context_window ?? null,
    max_output_tokens: model.max_output_tokens ?? null,
    sort: 0,
    status: 1,
    remark: null,
  }
}

export function validateModelForm(
  providerType: AIProviderType,
  values: ModelFormValues
): TranslationKey | null {
  if (!values.model_id.trim()) return "models.invalidModel"
  if (
    providerType === AI_PROVIDER_TYPE.openrouter &&
    !values.model_id.includes("/")
  ) {
    return "models.openRouterModelIdRequiresPrefix"
  }
  const modalities = values.input_modalities
  if (modalities && modalities.length > 0) {
    if (!modalities.includes("text")) return "models.invalidModalities"
    if (
      normalizeModelModalities(values.kind, modalities).length !==
      modalities.length
    ) {
      return "models.invalidModalitiesForKind"
    }
  }
  const invalidNumber = (value: number | null) =>
    value != null && (!Number.isInteger(value) || value < 1)
  if (
    invalidNumber(values.context_window) ||
    invalidNumber(values.max_output_tokens) ||
    !Number.isInteger(values.sort)
  ) {
    return "models.invalidNumbers"
  }
  if (values.thinking_policy) {
    if (!canConfigureThinkingPolicy(values)) {
      return "models.invalidThinkingPolicy"
    }
    const defaultLevel = values.thinking_policy.default_level
    if (defaultLevel && !values.thinking_policy.levels.includes(defaultLevel)) {
      return "models.invalidThinkingDefaultLevel"
    }
  }
  return null
}
