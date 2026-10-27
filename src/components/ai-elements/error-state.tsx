"use client"

import type { ComponentProps, ReactNode } from "react"
import { RefreshCwIcon } from "lucide-react"

import { useT } from "@/hooks/use-t"
import { cn } from "@/lib/utils"
import { ShimmerLabel } from "./surfaces"

export interface ErrorStateProps extends Omit<
  ComponentProps<"div">,
  "children" | "role" | "title"
> {
  title: ReactNode
  detail?: string
  retrying?: boolean
  action?: ReactNode
  retry?: ReactNode
  onRetry?: () => void
}

export function ErrorState({
  title,
  detail,
  retrying = false,
  action,
  retry,
  onRetry,
  className,
  ...props
}: ErrorStateProps) {
  const t = useT()
  if (retrying) {
    return (
      <div
        data-slot="error-state"
        key="retrying"
        role="status"
        className={cn(
          "flex w-full animate-in items-center gap-2.5 text-sm duration-300 fade-in motion-reduce:animate-none",
          className
        )}
        {...props}
      >
        <RefreshCwIcon className="size-3.5 shrink-0 animate-spin text-foreground/45 motion-reduce:animate-none" />
        <ShimmerLabel className="relative inline-block text-foreground/55">
          {t("common.retrying")}
        </ShimmerLabel>
      </div>
    )
  }

  const retryControl =
    retry ??
    (onRetry ? (
      <button
        type="button"
        onClick={onRetry}
        className="ms-auto flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-500/10 dark:text-red-400"
      >
        <RefreshCwIcon className="size-3" />
        {t("common.retry")}
      </button>
    ) : null)

  return (
    <div
      data-slot="error-state"
      key="error"
      role="alert"
      className={cn(
        "flex w-full animate-in items-start gap-2.5 rounded-2xl bg-red-500/[0.06] px-4 py-3 text-sm duration-300 fade-in motion-reduce:animate-none dark:bg-red-500/10",
        className
      )}
      {...props}
    >
      <div className="min-w-0 flex-1">
        <p className="font-medium wrap-break-word text-red-600 dark:text-red-400">
          {title}
        </p>
        {detail ? (
          <p className="mt-0.5 text-[13px] leading-snug wrap-break-word text-red-600/60 dark:text-red-400/60">
            {detail}
          </p>
        ) : null}
      </div>
      {action || retryControl ? (
        <div className="ms-auto flex shrink-0 flex-wrap items-center justify-end gap-1">
          {action}
          {retryControl}
        </div>
      ) : null}
    </div>
  )
}
