import type { AGUIEvent } from "@ag-ui/core"

import { parseApiError, throwApiError } from "@/api/http"
import { parseAgUiEvent } from "@/api/ag-ui"
import { translateCurrent } from "@/lib/i18n"

export type SseEvent = {
  id: string | null
  event: AGUIEvent
}

export async function throwIfStreamFailed(
  response: Response,
  fallback: string,
  silent = false
) {
  const contentType = response.headers.get("content-type") || ""
  if (response.ok && contentType.includes("text/event-stream")) {
    return
  }

  const payload: unknown = await response.json().catch(() => null)

  const parsed = parseApiError(
    payload,
    response.status,
    response.statusText,
    fallback
  )
  throwApiError(
    response.ok && parsed.code === 200 ? 502 : parsed.code,
    response.ok && parsed.code === 200 ? fallback : parsed.message || fallback,
    silent
  )
}

export async function* readSseEvents(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<SseEvent> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let completed = false

  try {
    while (true) {
      const { done, value } = await reader.read()
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done })
      buffer = buffer.replaceAll("\r\n", "\n")

      let separator = buffer.indexOf("\n\n")
      while (separator >= 0) {
        const raw = buffer.slice(0, separator)
        buffer = buffer.slice(separator + 2)
        const parsed = parseSseBlock(raw)
        if (parsed) {
          const event = parseAgUiEvent(parsed.data)
          yield { id: parsed.id, event }
        }
        separator = buffer.indexOf("\n\n")
      }

      if (done) {
        completed = true
        const trailing = parseSseBlock(buffer)
        if (trailing) {
          const event = parseAgUiEvent(trailing.data)
          yield { id: trailing.id, event }
        }
        return
      }
    }
  } finally {
    if (!completed) await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}

export async function* readAgUiRunEvents(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<AGUIEvent> {
  for await (const { event } of readSseEvents(body)) {
    yield event
    if (event.type === "RUN_FINISHED" || event.type === "RUN_ERROR") return
  }
  throw new Error(translateCurrent("common.generationFailed"))
}

function parseSseBlock(
  block: string
): { id: string | null; data: unknown } | null {
  const dataLines: string[] = []
  let id: string | null = null
  for (const line of block.split("\n")) {
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart())
    } else if (line.startsWith("id:")) {
      const value = line.slice(3).trim()
      id = /^\d+-\d+$/.test(value) ? value : null
    }
  }
  const data = dataLines.join("\n")
  if (!data || data === "[DONE]") {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(data)
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { id, data: parsed }
    }
  } catch (error) {
    throw new Error("Invalid AG-UI SSE frame", { cause: error })
  }
  throw new Error("Invalid AG-UI SSE frame")
}
