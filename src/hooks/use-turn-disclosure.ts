import { useEffect, useState, useSyncExternalStore } from "react"

const TURN_SETTLE_GRACE_MS = 180
const TURN_DISCLOSURE_DURATION_MS = 220
const TURN_DISCLOSURE_CLEANUP_MS = 40
export const TURN_DISCLOSURE_CLASS =
  "h-(--collapsible-panel-height) overflow-hidden transition-[height,opacity] duration-220 ease-out motion-reduce:transition-none data-ending-style:h-0 data-ending-style:opacity-0 data-starting-style:h-0 data-starting-style:opacity-0 data-open:data-ending-style:[height:var(--collapsible-panel-height)] data-open:data-ending-style:opacity-100"

type TurnPhase = "active" | "settling" | "closing" | "settled"
const motionQuery = "(prefers-reduced-motion: reduce)"
const subscribeMotion = (onChange: () => void) => {
  const media = window.matchMedia(motionQuery)
  media.addEventListener("change", onChange)
  return () => media.removeEventListener("change", onChange)
}
const reducedMotion = () => window.matchMedia(motionQuery).matches

export function useTurnDisclosure(
  active: boolean,
  collapseImmediately = false
): TurnPhase {
  const reduceMotion = useSyncExternalStore(
    subscribeMotion,
    reducedMotion,
    () => false
  )
  const [state, setState] = useState(() => ({
    active,
    phase: (active ? "active" : "settled") as TurnPhase,
  }))
  if (state.active !== active)
    setState({
      active,
      phase: active
        ? "active"
        : reduceMotion
          ? "settled"
          : collapseImmediately
            ? "closing"
            : "settling",
    })

  const phase = active ? "active" : reduceMotion ? "settled" : state.phase
  useEffect(() => {
    if (phase !== "settling" && phase !== "closing") return
    const timer = setTimeout(
      () =>
        setState((current) => ({
          ...current,
          phase: phase === "settling" ? "closing" : "settled",
        })),
      phase === "settling"
        ? TURN_SETTLE_GRACE_MS
        : TURN_DISCLOSURE_DURATION_MS + TURN_DISCLOSURE_CLEANUP_MS
    )
    return () => clearTimeout(timer)
  }, [phase])
  return phase
}
