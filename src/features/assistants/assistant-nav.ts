export type AssistantsSection = "assistant" | "expert"

export function normalizeAssistantsSection(value: unknown): AssistantsSection {
  return value === "expert" ? "expert" : "assistant"
}
