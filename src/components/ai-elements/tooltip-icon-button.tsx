"use client"

import { type ComponentPropsWithRef, forwardRef } from "react"

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type TooltipIconButtonProps = ComponentPropsWithRef<typeof Button> & {
  tooltip: string
  side?: "top" | "bottom"
}

export const TooltipIconButton = forwardRef<
  HTMLButtonElement,
  TooltipIconButtonProps
>(({ children, tooltip, side = "top", className, ...rest }, ref) => {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              {...rest}
              className={cn(
                "icon-button size-6 p-1 active:scale-90",
                className
              )}
              ref={ref}
            />
          }
        >
          {children}
          <span className="sr-only sr-only">{tooltip}</span>
        </TooltipTrigger>
        <TooltipContent side={side}>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
})

TooltipIconButton.displayName = "TooltipIconButton"
