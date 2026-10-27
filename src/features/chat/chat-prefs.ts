export function parseOptionalLimit(value: unknown): number | undefined {
  if (value == null || value === "") {
    return undefined
  }
  const parsed = typeof value === "number" ? value : Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) {
    return undefined
  }
  return parsed
}

export function parseOptionalNumber(value: unknown): number | undefined {
  if (value == null || value === "") {
    return undefined
  }
  const parsed = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(parsed)) {
    return undefined
  }
  return parsed
}

export function parseOptionalBoundedNumber(
  value: unknown,
  min: number,
  max: number
): number | undefined {
  const parsed = parseOptionalNumber(value)
  if (parsed == null) {
    return undefined
  }
  if (parsed < min || parsed > max) {
    return undefined
  }
  return parsed
}

export function parseStopSequences(value: unknown): string[] | undefined {
  if (value == null) {
    return undefined
  }
  const items = Array.isArray(value)
    ? value.map((item) => String(item))
    : String(value).split(/\n|,/)
  const sequences = items.map((item) => item.trim()).filter(Boolean)
  return sequences.length > 0 ? sequences : undefined
}

export function parseExtraBody(
  value: unknown
): Record<string, unknown> | undefined {
  if (value == null || value === "") {
    return undefined
  }
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value)
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const record = parsed as Record<string, unknown>
        return Object.keys(record).length > 0 ? record : undefined
      }
    } catch {
      return undefined
    }
    return undefined
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>
    return Object.keys(record).length > 0 ? record : undefined
  }
  return undefined
}

export function parseAdvisorModel(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

export function parseLogitBias(
  value: unknown
): Record<string, number> | undefined {
  if (value == null || value === "") {
    return undefined
  }
  let record: Record<string, unknown> | undefined
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value)
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        record = parsed as Record<string, unknown>
      }
    } catch {
      return undefined
    }
  } else if (typeof value === "object" && !Array.isArray(value)) {
    record = value as Record<string, unknown>
  }
  if (!record) {
    return undefined
  }
  const result: Record<string, number> = {}
  for (const [key, item] of Object.entries(record)) {
    const token = key.trim()
    const parsed = typeof item === "number" ? item : Number(item)
    if (!token || !Number.isInteger(parsed)) {
      return undefined
    }
    result[token] = parsed
  }
  return Object.keys(result).length > 0 ? result : undefined
}

export const ADVISOR_OFF = "__off__"
export const ADVISOR_INHERIT = "__inherit__"

export function advisorModelChoices(
  providers: Array<{
    name: string
    models: Array<{
      model_id: string
      name?: string
      kind?: "chat" | "embedding" | "image"
    }>
  }>
): Array<{ value: string; label: string }> {
  const seen = new Set<string>()
  const items: Array<{ value: string; label: string }> = []
  for (const provider of providers) {
    for (const model of provider.models) {
      if (
        !model.model_id ||
        seen.has(model.model_id) ||
        model.kind === "embedding" ||
        model.kind === "image"
      ) {
        continue
      }
      seen.add(model.model_id)
      items.push({
        value: model.model_id,
        label: `${provider.name} · ${model.name?.trim() || model.model_id}`,
      })
    }
  }
  return items
}
