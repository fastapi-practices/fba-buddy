import { sourceStorageKey } from "@/lib/account-source"

export { quoteAnchor, type TranscriptQuoteAnchor } from "@/shared/inline-quotes"

export type TranscriptLocation = {
  messageId: string
  text?: string
  occurrence?: number
  start?: number
  end?: number
  prefix?: string
  suffix?: string
}

export type TranscriptViewState = {
  expanded: Record<string, boolean>
}

export const TRANSCRIPT_NAVIGATE = "fba:transcript-navigate"
export const TRANSCRIPT_MOUNTED = "fba:transcript-mounted"

export function navigateTranscript(
  root: HTMLElement,
  location: TranscriptLocation
) {
  const scope = root.closest<HTMLElement>(".thread-root") ?? root
  return !scope.dispatchEvent(
    new CustomEvent(TRANSCRIPT_NAVIGATE, {
      detail: location,
      cancelable: true,
    })
  )
}

export function transcriptViewKey(conversationId: string) {
  return sourceStorageKey(
    `fba.transcript.v1:${encodeURIComponent(conversationId)}`
  )
}

export function parseTranscriptView(value: string | null): TranscriptViewState {
  const result: TranscriptViewState = { expanded: {} }
  if (!value) return result
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== "object") return result
    const state = parsed as Record<string, unknown>
    if (state.expanded && typeof state.expanded === "object") {
      for (const [id, open] of Object.entries(state.expanded)) {
        if (typeof open === "boolean") result.expanded[id] = open
      }
    }
  } catch {
    // 无效的阅读记录不影响会话渲染
  }
  return result
}

export function readTranscriptView(
  conversationId?: string | null
): TranscriptViewState {
  if (!conversationId || typeof localStorage === "undefined")
    return { expanded: {} }
  try {
    return parseTranscriptView(
      localStorage.getItem(transcriptViewKey(conversationId))
    )
  } catch {
    return { expanded: {} }
  }
}

export function writeTranscriptView(
  conversationId: string | null | undefined,
  state: TranscriptViewState
) {
  if (!conversationId || typeof localStorage === "undefined") return
  try {
    localStorage.setItem(
      transcriptViewKey(conversationId),
      JSON.stringify(state)
    )
  } catch {
    // 禁用存储或空间不足时仍保持本次会话的阅读状态
  }
}
