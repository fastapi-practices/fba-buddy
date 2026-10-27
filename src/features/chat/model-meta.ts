import type { TranslationKey } from "@/lib/i18n"
import { allModels, getModel, type Model } from "modelpedia"

import type {
  BackendModelCapability,
  ModelThinking,
  ThinkingPolicy,
  ThinkingEffort,
} from "@/lib/types"

export type ModelCapability =
  | "vision"
  | "thinking"
  | "tools"
  | "audio"
  | "video"
  | "pdf"
  | "search"
  | "free"

export const MODEL_CAPABILITY_LABELS: Record<ModelCapability, TranslationKey> =
  {
    vision: "common.vision",
    thinking: "common.thinking",
    tools: "common.tools",
    audio: "common.audio",
    video: "common.video",
    pdf: "common.pdfDocument",
    search: "common.search",
    free: "common.free",
  }

export type ModelMeta = {
  name?: string
  context?: string
  price?: string
  capabilities?: ModelCapability[]
}

export type ModelLogoKind = "openai" | "claude" | "gemini" | "xai"

const PROVIDER_SLUGS = [
  "openai",
  "anthropic",
  "google",
  "xai",
  "openrouter",
  "openai",
] as const

const CREATOR_SLUGS: Record<string, string> = {
  anthropic: "anthropic",
  google: "google",
  gemini: "google",
  openai: "openai",
  "x-ai": "xai",
  xai: "xai",
}

const lookupCache = new Map<string, Model | undefined>()

const DEFAULT_EFFORTS: readonly ThinkingEffort[] = [
  "none",
  "low",
  "medium",
  "high",
]

function thinkingSpec(
  efforts: readonly ThinkingEffort[],
  fallback: ThinkingEffort,
  mandatory = !efforts.includes("none") && !efforts.includes("minimal")
): ModelThinking {
  return {
    supported: true,
    efforts: [...efforts],
    default: fallback,
    mandatory,
  }
}

export function normalizeModelId(modelId: string): string {
  const trimmed = modelId.trim()
  const slash = trimmed.lastIndexOf("/")
  return (slash >= 0 ? trimmed.slice(slash + 1) : trimmed).toLowerCase()
}

export function formatContextLength(tokens: number): string {
  if (tokens >= 1_000_000) {
    const millions = tokens / 1_000_000
    return `${Number.isInteger(millions) ? millions : Number(millions.toFixed(1))}M`
  }
  if (tokens >= 1000) {
    return `${Math.round(tokens / 1000)}k`
  }
  return String(tokens)
}

export function formatInputPrice(inputPerMillion: number): string {
  if (inputPerMillion === 0) {
    return "Free"
  }
  return `$${inputPerMillion} / 1M`
}

function formatDollar(value: number): string {
  if (value === 0) {
    return "$0"
  }
  return `$${value}`
}

export function formatModelPrice(
  input?: number | null,
  output?: number | null
): string | undefined {
  if (input == null && output == null) {
    return undefined
  }
  if (input != null && output != null) {
    return `${formatDollar(input)} / ${formatDollar(output)}`
  }
  return formatDollar(input ?? output ?? 0)
}

function providerSlug(providerType: number | undefined): string | undefined {
  if (providerType == null) {
    return undefined
  }
  return PROVIDER_SLUGS[providerType]
}

function exactIds(modelId: string): string[] {
  const trimmed = modelId.trim()
  const normalized = normalizeModelId(trimmed)
  return [...new Set([trimmed, normalized].filter(Boolean))]
}

function candidateProviders(
  modelId: string,
  providerType: number | undefined
): string[] {
  const slugs: string[] = []
  const mapped = providerSlug(providerType)
  if (mapped) {
    slugs.push(mapped)
  }
  const slash = modelId.trim().indexOf("/")
  if (slash > 0) {
    const creator = modelId.trim().slice(0, slash).toLowerCase()
    const mappedCreator = CREATOR_SLUGS[creator] ?? creator
    slugs.push(mappedCreator, "openrouter")
  }
  slugs.push("openai", "anthropic", "google", "xai")
  return [...new Set(slugs)]
}

function catalogSupportsThinking(model: Model): boolean {
  if (model.reasoning_tokens || model.model_type === "reasoning") {
    return true
  }
  if (model.capabilities?.reasoning) {
    return true
  }
  const extra = model as Model & {
    extended_thinking?: boolean
    adaptive_thinking?: boolean
  }
  return Boolean(extra.extended_thinking || extra.adaptive_thinking)
}

function gpt5Minor(id: string): number | null {
  const match = id.match(/gpt-5(?:\.(\d+))?/)
  if (!match) {
    return null
  }
  return match[1] ? Number(match[1]) : 0
}

function isGpt5Pro(id: string): boolean {
  return /(?:^|[-.])pro(?:[-.]|$)/.test(id)
}

function openaiThinking(id: string): ModelThinking | undefined {
  if (/^o[1-4](-|$)/.test(id)) {
    return thinkingSpec(["low", "medium", "high"], "medium")
  }
  const minor = gpt5Minor(id)
  if (minor == null) {
    return undefined
  }
  const isCodex = id.includes("codex")
  const isPro = isGpt5Pro(id)
  if (minor >= 6) {
    if (isCodex) {
      return thinkingSpec(["low", "medium", "high", "xhigh", "max"], "low")
    }
    return thinkingSpec(
      ["none", "low", "medium", "high", "xhigh", "max"],
      "medium"
    )
  }
  if (minor >= 2) {
    if (isPro) {
      return thinkingSpec(["medium", "high", "xhigh"], "medium")
    }
    if (isCodex) {
      return thinkingSpec(["low", "medium", "high", "xhigh"], "low")
    }
    return thinkingSpec(
      ["none", "low", "medium", "high", "xhigh"],
      minor >= 5 ? "medium" : "none"
    )
  }
  if (minor === 1) {
    if (id.includes("codex-max")) {
      return thinkingSpec(["low", "medium", "high", "xhigh"], "low")
    }
    if (isCodex) {
      return thinkingSpec(["low", "medium", "high"], "low")
    }
    return thinkingSpec(["none", "low", "medium", "high"], "none")
  }
  if (isPro) {
    return thinkingSpec(["high"], "high")
  }
  if (isCodex) {
    return thinkingSpec(["low", "medium", "high"], "low")
  }
  return thinkingSpec(["minimal", "low", "medium", "high"], "medium")
}

function anthropicThinking(id: string): ModelThinking | undefined {
  if (!id.includes("claude")) {
    return undefined
  }
  if (
    /claude-(fable|mythos)-5-1/.test(id) ||
    /claude-(fable|mythos)-5([.-]|$)/.test(id) ||
    /claude-opus-5([.-]|$)/.test(id) ||
    /claude-opus-4-[78]/.test(id) ||
    /claude-sonnet-5([.-]|$)/.test(id)
  ) {
    return thinkingSpec(["low", "medium", "high", "xhigh", "max"], "high")
  }
  if (/claude-mythos-preview/.test(id)) {
    return thinkingSpec(["low", "medium", "high", "max"], "high")
  }
  if (/claude-(opus|sonnet)-4-6/.test(id)) {
    return thinkingSpec(["low", "medium", "high", "max"], "high")
  }
  if (/claude-opus-4-5/.test(id)) {
    return thinkingSpec(["low", "medium", "high"], "high")
  }
  if (/claude-haiku-4/.test(id)) {
    return thinkingSpec(["none", "high"], "none")
  }
  if (
    /claude-(opus|sonnet)-4/.test(id) ||
    /claude-(opus|sonnet|haiku)-3/.test(id)
  ) {
    return thinkingSpec(["none", "high"], "none")
  }
  return undefined
}

function googleThinking(id: string): ModelThinking | undefined {
  if (!id.includes("gemini")) {
    return undefined
  }
  if (/gemini-3(\.1)?-flash-lite-image|nano-banana-2-lite/.test(id)) {
    return thinkingSpec(["minimal", "high"], "minimal")
  }
  if (/gemini-3(\.1)?-flash-image|nano-banana/.test(id)) {
    return thinkingSpec(["minimal", "high"], "minimal")
  }
  if (/gemini-3-pro-image/.test(id)) {
    return thinkingSpec(["high"], "high")
  }
  if (/gemini-3\.[87]-flash/.test(id)) {
    return thinkingSpec(["low", "medium", "high"], "medium")
  }
  if (
    /gemini-3\.[65]-flash-lite/.test(id) ||
    /gemini-3\.1-flash-lite/.test(id)
  ) {
    return thinkingSpec(["minimal", "low", "medium", "high"], "minimal")
  }
  if (/gemini-3\.[65]-flash/.test(id)) {
    return thinkingSpec(["minimal", "low", "medium", "high"], "medium")
  }
  if (/gemini-3\.1-pro/.test(id)) {
    return thinkingSpec(["low", "medium", "high"], "high")
  }
  if (/gemini-3-flash/.test(id)) {
    return thinkingSpec(["minimal", "low", "medium", "high"], "high")
  }
  if (/gemini-3-pro/.test(id)) {
    return thinkingSpec(["low", "high"], "high")
  }
  if (/gemini-2\.5-pro/.test(id)) {
    return thinkingSpec(["low", "medium", "high"], "high")
  }
  if (/gemini-2\.5-flash-lite/.test(id)) {
    return thinkingSpec(["none", "low", "medium", "high"], "none")
  }
  if (/gemini-2\.5-flash/.test(id)) {
    return thinkingSpec(["none", "low", "medium", "high"], "high")
  }
  return undefined
}

function xaiThinking(id: string): ModelThinking | undefined {
  if (!id.includes("grok")) {
    return undefined
  }
  if (/non-reasoning/.test(id)) {
    return undefined
  }
  if (/grok-4\.20-multi-agent/.test(id)) {
    return thinkingSpec(["low", "medium", "high", "xhigh"], "low")
  }
  if (/grok-4\.6/.test(id)) {
    return thinkingSpec(["low", "medium", "high", "xhigh"], "high")
  }
  if (/grok-4\.5/.test(id)) {
    return thinkingSpec(["low", "medium", "high"], "high")
  }
  if (/grok-4\.3/.test(id) || /grok-4\.20/.test(id)) {
    return thinkingSpec(["none", "low", "medium", "high"], "low")
  }
  if (/grok-3-mini/.test(id)) {
    return thinkingSpec(["low", "high"], "low")
  }
  if (/grok-4/.test(id)) {
    return thinkingSpec(["high"], "high")
  }
  return undefined
}

function deepseekThinking(id: string): ModelThinking | undefined {
  if (!id.includes("deepseek")) {
    return undefined
  }
  if (/deepseek-v4/.test(id)) {
    return thinkingSpec(["none", "low", "high", "max"], "high")
  }
  if (/deepseek-(r1|reasoner)/.test(id)) {
    return thinkingSpec(["high"], "high")
  }
  if (/deepseek-(v3|chat)/.test(id)) {
    return thinkingSpec(["none", "high"], "none")
  }
  return undefined
}

function minimaxThinking(id: string): ModelThinking | undefined {
  if (!/minimax/.test(id)) {
    return undefined
  }
  if (/minimax-m3\b|minimax-m-3/.test(id)) {
    return thinkingSpec(["none", "high"], "high")
  }
  if (/minimax-m2/.test(id)) {
    return thinkingSpec(["high"], "high")
  }
  return undefined
}

function qwenThinking(id: string): ModelThinking | undefined {
  if (/qwen3\.8|qwen3-8/.test(id)) {
    return thinkingSpec(["none", "low", "medium", "xhigh"], "xhigh")
  }
  if (/qwq|qwen3.*thinking|thinking-2507/.test(id)) {
    return thinkingSpec(["high"], "high")
  }
  if (/instruct-2507/.test(id)) {
    return undefined
  }
  if (
    /^qwen3([.-]|$)/.test(id) ||
    /^qwen-(plus|flash|turbo)([.-]|$)/.test(id)
  ) {
    return thinkingSpec(["none", "high"], "high")
  }
  return undefined
}

function mimoThinking(id: string): ModelThinking | undefined {
  if (!/mimo-v2/.test(id)) {
    return undefined
  }
  return thinkingSpec(["none", "high"], "high")
}

function thinkingFromNormalizedId(id: string): ModelThinking | undefined {
  return (
    openaiThinking(id) ??
    anthropicThinking(id) ??
    googleThinking(id) ??
    xaiThinking(id) ??
    deepseekThinking(id) ??
    minimaxThinking(id) ??
    qwenThinking(id) ??
    mimoThinking(id)
  )
}

function thinkingFromCatalog(model: Model): ModelThinking {
  return (
    thinkingFromNormalizedId(normalizeModelId(model.id)) ?? {
      supported: true,
      efforts: [...DEFAULT_EFFORTS],
      default: "none",
      mandatory: false,
    }
  )
}

function modelMatchesExactId(model: Model, id: string): boolean {
  const catalogId = model.id.toLowerCase()
  const alias = model.alias?.toLowerCase()
  const want = id.toLowerCase()
  return (
    catalogId === want ||
    catalogId.endsWith(`/${want}`) ||
    catalogId.endsWith(`.${want}`) ||
    alias === want
  )
}

function findCatalogModel(
  modelId: string,
  providerType?: number,
  remote?: Model
): Model | undefined {
  if (remote) {
    return remote
  }
  const key = `${providerType ?? ""}:${modelId.trim().toLowerCase()}`
  if (lookupCache.has(key)) {
    return lookupCache.get(key)
  }

  const ids = exactIds(modelId)
  for (const provider of candidateProviders(modelId, providerType)) {
    for (const id of ids) {
      const match =
        getModel(provider, id) ?? getModel(provider, id.toLowerCase())
      if (match && modelMatchesExactId(match, normalizeModelId(modelId))) {
        lookupCache.set(key, match)
        return match
      }
    }
  }

  const needles = new Set(ids.map((id) => id.toLowerCase()))
  const match = allModels.find((model) =>
    [...needles].some((id) => modelMatchesExactId(model, id))
  )
  lookupCache.set(key, match)
  return match
}

function looksLikeReasoningId(modelId: string): boolean {
  const id = normalizeModelId(modelId)
  if (/chat/.test(id) && !/mimo/.test(id)) {
    return false
  }
  if (/instruct-2507/.test(id) || /non-reasoning/.test(id)) {
    return false
  }
  return thinkingFromNormalizedId(id) != null
}

function thinkingFromModelId(modelId: string): ModelThinking {
  return thinkingFromCatalog({
    id: normalizeModelId(modelId),
    family: "",
    provider: "",
    created_by: "",
    source: "community",
    last_updated: "",
    name: modelId,
  })
}

function capabilitiesFromCatalog(model: Model): ModelCapability[] {
  const capabilities: ModelCapability[] = []
  const inputs = model.modalities?.input ?? []
  if (model.capabilities?.vision || inputs.includes("image")) {
    capabilities.push("vision")
  }
  if (inputs.includes("audio")) {
    capabilities.push("audio")
  }
  if (inputs.includes("video")) {
    capabilities.push("video")
  }
  if (catalogSupportsThinking(model)) {
    capabilities.push("thinking")
  }
  if (
    model.capabilities?.tool_call ||
    model.tools?.includes("function_calling")
  ) {
    capabilities.push("tools")
  }
  const extra = model as Model & { grounding?: boolean }
  if (model.tools?.includes("web_search") || extra.grounding) {
    capabilities.push("search")
  }
  if (model.pricing?.input === 0) {
    capabilities.push("free")
  }
  return capabilities
}

export function getModelMeta(
  modelId: string,
  providerType?: number,
  remote?: Model
): ModelMeta {
  const model = findCatalogModel(modelId, providerType, remote)
  if (!model) {
    const thinking = looksLikeReasoningId(modelId)
      ? thinkingFromModelId(modelId)
      : undefined
    return thinking?.supported ? { capabilities: ["thinking"] } : {}
  }

  const capabilities = capabilitiesFromCatalog(model)
  if (looksLikeReasoningId(modelId) && !capabilities.includes("thinking")) {
    capabilities.push("thinking")
  }
  return {
    name: model.name || undefined,
    context:
      model.context_window == null
        ? undefined
        : formatContextLength(model.context_window),
    price: formatModelPrice(model.pricing?.input, model.pricing?.output),
    capabilities: capabilities.length > 0 ? capabilities : undefined,
  }
}

export function getModelContextWindow(
  modelId: string,
  providerType?: number,
  remote?: Model
): number | undefined {
  const contextWindow = findCatalogModel(
    modelId,
    providerType,
    remote
  )?.context_window
  return contextWindow == null || contextWindow <= 0 ? undefined : contextWindow
}

export function getModelThinking(
  modelId: string,
  providerType?: number,
  remote?: Model,
  backendCapabilities?: readonly BackendModelCapability[] | null,
  policy?: ThinkingPolicy | null
): ModelThinking | undefined {
  if (backendCapabilities != null || policy !== undefined) {
    if (!backendCapabilities?.includes("thinking") || !policy) {
      return undefined
    }
    const efforts: ThinkingEffort[] = [
      "none",
      ...policy.levels,
      ...(policy.can_disable ? (["off"] as const) : []),
    ]
    if (efforts.length === 1) {
      return undefined
    }
    return {
      supported: true,
      efforts,
      default: policy.default_level ?? "none",
      mandatory: !policy.can_disable,
    }
  }
  const catalogThinking = (() => {
    const model = findCatalogModel(modelId, providerType, remote)
    if (model && catalogSupportsThinking(model)) {
      return thinkingFromCatalog(model)
    }
    if (looksLikeReasoningId(modelId)) {
      return thinkingFromModelId(modelId)
    }
    return undefined
  })()
  return catalogThinking
}

export function getModelLogoKind(
  providerType: number,
  modelId: string
): ModelLogoKind | undefined {
  const id = modelId.trim().toLowerCase()
  const bare = normalizeModelId(id)
  if (id.startsWith("anthropic/") || id.includes("claude")) {
    return "claude"
  }
  if (
    id.startsWith("google/") ||
    id.startsWith("gemini/") ||
    id.includes("gemini") ||
    id.includes("gemma")
  ) {
    return "gemini"
  }
  if (id.startsWith("x-ai/") || id.startsWith("xai/") || id.includes("grok")) {
    return "xai"
  }
  if (
    id.startsWith("openai/") ||
    id.includes("gpt-") ||
    /^o[1-4](-|$)/.test(bare)
  ) {
    return "openai"
  }
  if (providerType === 1) {
    return "claude"
  }
  if (providerType === 2) {
    return "gemini"
  }
  if (providerType === 3) {
    return "xai"
  }
  if (providerType === 0 || providerType === 5) {
    return "openai"
  }
  return undefined
}
