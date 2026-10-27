function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}
export function quotaReset(
  error: unknown,
  observedAt: number
): { resetAt: number | null } | null {
  const outer = record(error)
  const data = {
    ...record(outer.error),
    ...record(outer.details),
    ...record(outer.detail),
    ...outer,
  }
  const code = String(data.code ?? data.error_code ?? "").toLowerCase()
  const message = typeof error === "string" ? error : String(data.message ?? "")
  if (
    Number(data.status ?? data.status_code) !== 429 &&
    !/rate.?limit|quota|usage.?limit/.test(code) &&
    !/rate limit|quota exceeded|usage limit|限额|额度已用|请求过于频繁/i.test(
      message
    )
  )
    return null
  const raw =
    data.reset_at ??
    data.resetAt ??
    data.resets_at ??
    data.resetsAt ??
    data.quota_reset_at
  let resetAt: number | null = null
  if (typeof raw === "number") resetAt = raw < 1e12 ? raw * 1000 : raw
  else if (typeof raw === "string")
    resetAt = /^\d+(\.\d+)?$/.test(raw)
      ? Number(raw) * (Number(raw) < 1e12 ? 1000 : 1)
      : Date.parse(raw)
  if (resetAt === null) {
    const retry =
      data.retry_after ?? data.retryAfter ?? record(data.headers)["retry-after"]
    if (
      typeof retry === "number" ||
      (typeof retry === "string" && /^\d+(\.\d+)?$/.test(retry))
    )
      resetAt = observedAt + Number(retry) * 1000
    else if (typeof retry === "string") resetAt = Date.parse(retry)
  }
  return {
    resetAt: resetAt !== null && Number.isFinite(resetAt) ? resetAt : null,
  }
}
