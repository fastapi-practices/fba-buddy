"use client"

import type { ComponentProps } from "react"
import { LoaderCircleIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export function ThinkingIndicator({
  active = true,
  className,
  ...props
}: Omit<ComponentProps<"span">, "children"> & { active?: boolean }) {
  return (
    <span
      aria-hidden="true"
      data-slot="thinking-indicator"
      data-active={active ? "" : undefined}
      className={cn(
        "inline-flex size-4 shrink-0 items-center justify-center",
        className
      )}
      {...props}
    >
      <LoaderCircleIcon
        className={cn(
          "size-3.5 text-muted-foreground",
          active && "animate-spin motion-reduce:animate-none"
        )}
      />
    </span>
  )
}
