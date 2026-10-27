import type { ChatToolCall } from "@/lib/types"

export function toolOutcome(encryptedValue: unknown): Partial<ChatToolCall> {
  if (typeof encryptedValue !== "string") return {}
  try {
    const value = JSON.parse(encryptedValue) as {
      pydantic_ai?: { outcome?: unknown }
    } | null
    switch (value?.pydantic_ai?.outcome) {
      case "failed":
        return { isError: true, status: "error" }
      case "denied":
        return { isError: false, status: "declined" }
      case "interrupted":
        return { isError: false, status: "stopped" }
      default:
        return {}
    }
  } catch {
    return {}
  }
}
