import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import type { Model } from "modelpedia"

import { queryKeys } from "@/api/query-keys"
import { normalizeModelId } from "@/features/chat/model-meta"

const MODELPEEDIA_MODELS_URL = "https://api.modelpedia.dev/v1/models"

const OFFICIAL_PROVIDERS = new Set([
  "openai",
  "anthropic",
  "google",
  "xai",
  "azure",
])

const LOW_QUALITY_PROVIDERS = new Set([
  "cloudflare-ai-gateway",
  "cloudflare-workers-ai",
])

type CatalogModel = Model & {
  capabilities?: {
    vision?: boolean
    tool_call?: boolean
    reasoning?: boolean
    streaming?: boolean
  }
  reasoning_tokens?: boolean
}

export function isExactCatalogId(catalogId: string, modelId: string): boolean {
  const want = modelId.trim().toLowerCase()
  const bare = normalizeModelId(want)
  const got = catalogId.trim().toLowerCase()
  return (
    got === want ||
    got === bare ||
    got.endsWith(`/${bare}`) ||
    got.endsWith(`.${bare}`)
  )
}

function catalogQuality(model: CatalogModel): number {
  let score = 0
  if (OFFICIAL_PROVIDERS.has(model.provider)) {
    score += 80
  }
  if (LOW_QUALITY_PROVIDERS.has(model.provider)) {
    score -= 100
  }
  if (model.context_window) {
    score += 40
  }
  if (model.pricing?.input != null || model.pricing?.output != null) {
    score += 30
  }
  if (model.capabilities?.reasoning || model.reasoning_tokens) {
    score += 30
  }
  if (model.capabilities?.vision || model.capabilities?.tool_call) {
    score += 20
  }
  return score
}

export function pickExactCatalogModel(
  models: CatalogModel[],
  modelId: string
): CatalogModel | undefined {
  const exact = models.filter((model) => isExactCatalogId(model.id, modelId))
  if (exact.length === 0) {
    return undefined
  }
  return exact.reduce((best, model) =>
    catalogQuality(model) > catalogQuality(best) ? model : best
  )
}

async function fetchExactCatalogModel(
  modelId: string
): Promise<CatalogModel | undefined> {
  const query = encodeURIComponent(modelId.trim())
  const response = await fetch(`${MODELPEEDIA_MODELS_URL}?q=${query}`)
  if (!response.ok) {
    return undefined
  }
  const payload = (await response.json()) as { data?: CatalogModel[] }
  return pickExactCatalogModel(payload.data ?? [], modelId)
}

async function fetchExactCatalogModels(
  modelIds: readonly string[]
): Promise<Map<string, CatalogModel>> {
  const unique = [...new Set(modelIds.map((id) => id.trim()).filter(Boolean))]
  const entries = await Promise.all(
    unique.map(async (modelId) => {
      const model = await fetchExactCatalogModel(modelId)
      return [normalizeModelId(modelId), model] as const
    })
  )
  return new Map(
    entries.filter((entry): entry is [string, CatalogModel] => entry[1] != null)
  )
}

export function useModelCatalog(modelIds: readonly string[]) {
  const idsKey = [...new Set(modelIds.map((id) => id.trim()).filter(Boolean))]
    .sort()
    .join("\n")
  const ids = useMemo(
    () => (idsKey.length > 0 ? idsKey.split("\n") : []),
    [idsKey]
  )
  return useQuery({
    queryKey: queryKeys.modelpediaExact(ids),
    queryFn: () => fetchExactCatalogModels(ids),
    enabled: ids.length > 0,
    staleTime: 6 * 60 * 60 * 1000,
  })
}

export type { CatalogModel }
