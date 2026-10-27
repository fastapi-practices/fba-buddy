/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState } from "react"

export function formatLiveDuration(elapsedMs: number, running = false): string {
  if (!running && elapsedMs < 1000)
    return `${Math.max(1, Math.round(elapsedMs))}ms`
  const seconds = running
    ? Math.floor(elapsedMs / 1000)
    : Math.round(elapsedMs / 1000)
  if (seconds >= 3600)
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
  if (seconds >= 60) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  return `${!running && elapsedMs < 10000 ? Number((elapsedMs / 1000).toFixed(1)) : seconds}s`
}

export function useLiveElapsed(
  active: boolean,
  startedAt?: number,
  completedAt?: number
): number | undefined {
  const [observedStart, setObservedStart] = useState<number | undefined>(
    startedAt
  )
  const [now, setNow] = useState<number | undefined>(completedAt)

  useEffect(() => {
    const current = Date.now()
    const nextStart = startedAt ?? (active ? current : observedStart)
    if (nextStart !== observedStart) {
      setObservedStart(nextStart)
    }
    if (!active || nextStart === undefined) {
      setNow(completedAt ?? current)
      return
    }
    setNow(current)
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [active, completedAt, observedStart, startedAt])

  const start = startedAt ?? observedStart
  if (start === undefined) return undefined
  const end = active ? now : (completedAt ?? now)
  return end === undefined ? undefined : Math.max(0, end - start)
}
