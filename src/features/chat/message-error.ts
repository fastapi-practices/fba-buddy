import { translateCurrent } from "@/lib/i18n"
import { codingRuntimeInstallHint } from "@/lib/execution-runtime"
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function errorTextFromMessage(message: {
  error?: string
  content?: string
}): string {
  const text =
    message.error ||
    message.content ||
    translateCurrent("common.generationFailed")
  return codingRuntimeInstallHint(text) ?? text
}

export function visibleAssistantContent(message: {
  status?: string
  error?: string
  content: string
}): string {
  if (message.status !== "error") {
    return message.content
  }
  const errorText = errorTextFromMessage(message)
  return message.content &&
    message.content !== message.error &&
    message.content !== errorText
    ? message.content
    : ""
}

export function threadErrorPayload(message: {
  error?: string
  content?: string
  errorDetail?: Record<string, unknown>
}): string | Record<string, unknown> {
  const text = errorTextFromMessage(message)
  if (!message.errorDetail) {
    return text
  }
  return { ...message.errorDetail, message: text }
}

export function errorMessageFromStatus(error: unknown): string {
  if (typeof error === "string" && error.trim()) {
    return codingRuntimeInstallHint(error) ?? error
  }
  if (
    isRecord(error) &&
    typeof error.message === "string" &&
    error.message.trim()
  ) {
    return codingRuntimeInstallHint(error.message) ?? error.message
  }
  return translateCurrent("common.generationFailed")
}

function errorDetailRecord(
  error: unknown
): Record<string, unknown> | null {
  return isRecord(error) ? error : null
}

export function hasErrorDetail(error: unknown): boolean {
  const record = errorDetailRecord(error)
  if (!record) {
    return false
  }
  return Object.keys(record).some((key) => key !== "message")
}

export function formatErrorDetail(error: unknown): string | null {
  const record = errorDetailRecord(error)
  if (!record) {
    return null
  }
  const rest = { ...record }
  delete rest.message
  const payload = Object.keys(rest).length > 0 ? rest : record
  try {
    return JSON.stringify(payload, null, 2)
  } catch {
    return null
  }
}
