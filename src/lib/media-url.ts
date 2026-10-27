import { API_ORIGIN } from "@/lib/config"

export function resolveMediaUrl(
  value: string | null | undefined
): string | undefined {
  if (!value) {
    return undefined
  }
  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }
  if (
    /^(https?:|data:|blob:)/i.test(trimmed) ||
    trimmed.startsWith("//")
  ) {
    return trimmed
  }
  if (trimmed.startsWith("/")) {
    return API_ORIGIN ? `${API_ORIGIN}${trimmed}` : trimmed
  }
  return trimmed
}
