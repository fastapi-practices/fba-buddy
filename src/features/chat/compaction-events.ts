import { lifecycleStatus, type LifecycleStatus } from "./rich-events"

export type CompactionSnapshot = {
  status: LifecycleStatus
  running: boolean
  failed: boolean
  tokensBefore?: number
  tokensAfter?: number
  messagesBefore?: number
  messagesAfter?: number
  // 折叠态显示的压缩量，例如 82k → 12k
  tokenDelta?: string
  // 展开态显示的完整数字，例如 82,000 → 12,000
  tokenRow?: string
  messageRow?: string
  // 压缩摘要，provider 的压缩事件只有这一项
  summary?: string
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function formatCompactCount(value: number): string {
  if (value < 1000) return String(value)
  const scaled = value / 1000
  return `${Number(scaled.toFixed(scaled >= 100 ? 0 : 1))}k`
}

function formatExactCount(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

function compactionText(value: Record<string, unknown>): string {
  const raw = value.summary ?? value.output ?? value.content ?? value.detail
  if (typeof raw === "string") return raw.trim()
  if (!raw || typeof raw !== "object") return ""
  const nested = (raw as Record<string, unknown>).content
  if (typeof nested === "string") return nested.trim()
  return JSON.stringify(raw, null, 2)
}

export function compactionSnapshot(
  value: Record<string, unknown>
): CompactionSnapshot {
  const status = lifecycleStatus({ name: "buddy.compaction", value })
  const tokensBefore = numberOrUndefined(value.tokens_before ?? value.tokensBefore)
  const tokensAfter = numberOrUndefined(value.tokens_after ?? value.tokensAfter)
  const messagesBefore = numberOrUndefined(
    value.messages_before ?? value.messagesBefore
  )
  const messagesAfter = numberOrUndefined(
    value.messages_after ?? value.messagesAfter
  )
  const summary = compactionText(value)
  const hasTokens = tokensBefore !== undefined && tokensAfter !== undefined
  const hasMessages = messagesBefore !== undefined && messagesAfter !== undefined
  return {
    status,
    running: status === "running" || status === "queued",
    failed: status === "failed" || status === "cancelled",
    ...(tokensBefore !== undefined ? { tokensBefore } : {}),
    ...(tokensAfter !== undefined ? { tokensAfter } : {}),
    ...(messagesBefore !== undefined ? { messagesBefore } : {}),
    ...(messagesAfter !== undefined ? { messagesAfter } : {}),
    ...(hasTokens
      ? {
          tokenDelta: `${formatCompactCount(tokensBefore)} → ${formatCompactCount(tokensAfter)}`,
          tokenRow: `${formatExactCount(tokensBefore)} → ${formatExactCount(tokensAfter)}`,
        }
      : {}),
    ...(hasMessages ? { messageRow: `${messagesBefore} → ${messagesAfter}` } : {}),
    ...(summary ? { summary } : {}),
  }
}
