import { researchSources } from "./research-sources"
import type { ChatMessage } from "@/lib/types"

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

export function snapshotMessageMetadata(
  value: unknown
): Pick<
  ChatMessage,
  "createdAt" | "origin" | "inputIntent" | "createdBy" | "attempt" | "sources"
> {
  const source = record(value)
  const metadata = record(source.metadata)
  const custom = record(metadata.custom)
  const context = record(source.turnContext)
  const fields = { ...context, ...custom, ...metadata, ...source }
  const rawDate =
    fields.createdTime ??
    fields.createdAt ??
    fields.created_time ??
    fields.created_at
  const date =
    typeof rawDate === "string" || typeof rawDate === "number"
      ? new Date(rawDate)
      : null
  const rawAttempt = record(fields.attempt)
  const attemptId = rawAttempt.id ?? fields.attemptId ?? fields.attempt_id
  const attemptStatus =
    rawAttempt.status ?? fields.attemptStatus ?? fields.attempt_status
  const intent = fields.inputIntent ?? fields.input_intent
  const createdBy = fields.createdBy ?? fields.created_by
  const sources = researchSources(fields.sources)
  return {
    ...(sources.length ? { sources } : {}),
    ...(date && Number.isFinite(date.getTime())
      ? { createdAt: date.toISOString() }
      : {}),
    ...(fields.origin != null ? { origin: fields.origin } : {}),
    ...(typeof intent === "string" ? { inputIntent: intent } : {}),
    ...(createdBy != null ? { createdBy } : {}),
    ...(typeof attemptId === "string" || typeof attemptId === "number"
      ? {
          attempt: {
            id: String(attemptId),
            ...(typeof attemptStatus === "string"
              ? { status: attemptStatus }
              : {}),
            ...(typeof rawAttempt.number === "number"
              ? { number: rawAttempt.number }
              : {}),
          },
        }
      : {}),
  }
}
