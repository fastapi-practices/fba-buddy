"use client"

import { useEffect, useState, type ComponentProps } from "react"
import { CloudOffIcon, Loader2Icon } from "lucide-react"

import { useT } from "@/hooks/use-t"
import { cn } from "@/lib/utils"

import { mono, paper } from "./surfaces"

export type ConnectionPhase = "online" | "dropped" | "reconnecting" | "resumed"

export function ConnectionState({
  phase,
  attempt,
  onRetry,
  className,
  ...props
}: Omit<ComponentProps<"div">, "children" | "phase" | "attempt" | "onRetry"> & {
  phase: ConnectionPhase
  attempt?: number
  onRetry?: () => void
}) {
  const t = useT()
  const outage = phase === "dropped" || phase === "reconnecting"
  const [notice, setNotice] = useState({ outage, visible: false })
  if (notice.outage !== outage) setNotice({ outage, visible: false })
  useEffect(() => {
    if (!outage) return
    const timer = window.setTimeout(
      () => setNotice({ outage, visible: true }),
      1500
    )
    return () => window.clearTimeout(timer)
  }, [outage])
  if (!outage || !notice.visible) return null

  return (
    <div
      data-slot="connection-state"
      className={cn(
        paper,
        "flex w-full max-w-sm animate-in items-center gap-2.5 rounded-2xl px-3.5 py-2.5 duration-300 fade-in slide-in-from-top-1",
        className
      )}
      {...props}
    >
      {phase === "dropped" ? (
        <>
          <CloudOffIcon className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <span className="min-w-0 flex-1 text-[13px]">
            {t("hints.connectionLostTheRunKeptGoingOnTheServer")}
          </span>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium text-foreground/70 transition-[background-color,color,scale] duration-150 hover:bg-foreground/[0.06] hover:text-foreground/95 active:scale-[0.96]"
            >
              {t("common.reconnect")}
            </button>
          ) : null}
        </>
      ) : null}

      {phase === "reconnecting" ? (
        <>
          <Loader2Icon className="size-3.5 shrink-0 animate-spin text-foreground/40 motion-reduce:animate-none" />
          <span className="min-w-0 flex-1 text-[13px]">
            {t("common.reconnecting")}
          </span>
          {attempt !== undefined ? (
            <span
              className={cn(mono, "shrink-0 text-foreground/30 tabular-nums")}
            >
              {t("common.attemptN", { n: attempt })}
            </span>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
