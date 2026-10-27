import type { ChatMessage, ChatWorkTiming, SnapshotMessage } from "@/lib/types"

export function startWorkTiming(
  runId: string,
  now = Date.now()
): ChatWorkTiming {
  return { runId, status: "running", startedAt: now }
}

export function settleWorkTiming(
  timing: ChatWorkTiming,
  status: ChatWorkTiming["status"],
  now = Date.now()
): ChatWorkTiming {
  if (timing.status === status && timing.status !== "running") return timing
  const elapsedMs =
    timing.startedAt != null
      ? Math.max(0, now - timing.startedAt)
      : timing.elapsedMs
  return {
    ...timing,
    status,
    ...(elapsedMs != null ? { elapsedMs } : {}),
    ...(status === "running" || status === "awaiting-approval"
      ? { endedAt: undefined }
      : { endedAt: timing.endedAt ?? now }),
  }
}

/**
 * 工具调用的实时计时条件：
 * 工具还没有返回结果，且整轮仍在运行。
 * 等待用户回答时消息文本可能已经结束，整轮运行状态依然有效
 */
export function liveToolTiming(input: {
  toolRunning: boolean
  messageRunning: boolean
  turnRunning: boolean
  waitingForUser?: boolean
}): boolean {
  if (!input.toolRunning) return false
  return (
    input.messageRunning ||
    input.turnRunning ||
    Boolean(input.waitingForUser)
  )
}

export function messageWorkStatus(
  message: ChatMessage
): ChatWorkTiming["status"] {
  if (message.status === "streaming") return "running"
  if (message.status === "awaiting-approval") return "awaiting-approval"
  if (message.status === "stopped" || message.status === "error")
    return message.status
  return "complete"
}

export function settleMessageWork(
  messages: ChatMessage[],
  status: ChatWorkTiming["status"],
  now = Date.now(),
  runId?: string
): ChatMessage[] {
  return messages.map((message) => {
    const timing = message.workTiming
    if (!timing || (runId && timing.runId !== runId)) return message
    if (timing.status !== "running" && timing.status !== "awaiting-approval")
      return message
    return { ...message, workTiming: settleWorkTiming(timing, status, now) }
  })
}

function timestamp(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0)
    return value
  if (typeof value === "string") {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

export function snapshotWorkTiming(
  message: SnapshotMessage,
  status: ChatWorkTiming["status"]
): ChatWorkTiming | undefined {
  const raw = message.work_timing ?? message.workTiming
  const startedAt = timestamp(
    raw?.startedAt ??
      message.started_at ??
      message.startedAt ??
      message.timing?.streamStartTime
  )
  const endedAt = timestamp(
    raw?.endedAt ?? message.completed_at ?? message.completedAt
  )
  const duration =
    raw?.elapsedMs ??
    message.duration_ms ??
    message.durationMs ??
    message.timing?.totalStreamTime
  const elapsedMs =
    typeof duration === "number" && Number.isFinite(duration) && duration >= 0
      ? duration
      : startedAt != null && endedAt != null && endedAt >= startedAt
        ? endedAt - startedAt
        : undefined
  if (startedAt == null && elapsedMs == null) return undefined
  return {
    runId: raw?.runId ?? message.run_id ?? message.runId ?? message.id,
    status,
    ...(startedAt != null ? { startedAt } : {}),
    ...(endedAt != null ? { endedAt } : {}),
    ...(elapsedMs != null ? { elapsedMs } : {}),
  }
}
