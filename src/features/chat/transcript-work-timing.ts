import type { ThreadMessage } from "@/features/chat/thread-types"

export type TranscriptWorkTiming = {
  startedAt?: number
  elapsedMs?: number
}

function validTime(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
}

export function transcriptWorkTiming(
  messages: readonly ThreadMessage[]
): TranscriptWorkTiming {
  let startedAt: number | undefined
  let endedAt: number | undefined
  let savedElapsed: number | undefined
  for (const message of messages) {
    const streamElapsed = message.metadata?.timing?.totalStreamTime
    if (validTime(streamElapsed))
      savedElapsed = Math.max(savedElapsed ?? streamElapsed, streamElapsed)
    const value = message.metadata?.custom?.workTiming
    if (!value || typeof value !== "object") continue
    const timing = value as Record<string, unknown>
    const start = validTime(timing.startedAt) ? timing.startedAt : undefined
    const elapsed = validTime(timing.elapsedMs) ? timing.elapsedMs : undefined
    const end = validTime(timing.endedAt)
      ? timing.endedAt
      : start !== undefined && elapsed !== undefined
        ? start + elapsed
        : undefined
    if (start !== undefined) startedAt = Math.min(startedAt ?? start, start)
    if (
      end !== undefined &&
      Number.isFinite(end) &&
      (start === undefined || end >= start)
    )
      endedAt = Math.max(endedAt ?? end, end)
    if (elapsed !== undefined)
      savedElapsed = Math.max(savedElapsed ?? elapsed, elapsed)
  }
  return {
    ...(startedAt !== undefined ? { startedAt } : {}),
    ...(startedAt !== undefined && endedAt !== undefined && endedAt >= startedAt
      ? { elapsedMs: endedAt - startedAt }
      : savedElapsed !== undefined
        ? { elapsedMs: savedElapsed }
        : {}),
  }
}

export function turnElapsedMs(
  timing: TranscriptWorkTiming,
  running: boolean,
  now: number,
  settled?: number
): number | undefined {
  if (running)
    return timing.startedAt !== undefined
      ? Math.max(0, now - timing.startedAt)
      : timing.elapsedMs
  return settled ?? timing.elapsedMs
}

// 回合结束时把总耗时定格下来，等待审批与后台任务的时间都算进总耗时
export function settleTurnElapsed(
  timing: TranscriptWorkTiming,
  now: number
): number | undefined {
  if (timing.startedAt === undefined) return undefined
  return Math.max(0, now - timing.startedAt)
}

export function formatTurnDuration(elapsedMs: number, running = false): string {
  if (!running && elapsedMs < 1000)
    return `${Math.max(1, Math.round(elapsedMs))}ms`
  const seconds = running
    ? Math.floor(elapsedMs / 1000)
    : Math.round(elapsedMs / 1000)
  if (seconds >= 86400)
    return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`
  if (seconds >= 3600)
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
  if (seconds >= 60) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  return `${!running && elapsedMs < 10000 ? Number((elapsedMs / 1000).toFixed(1)) : seconds}s`
}
