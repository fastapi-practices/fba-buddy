import type { ComponentProps, ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { TooltipHint } from "@/components/ui/tooltip"
import { SIDEBAR_HEADER_ICON_CLASS } from "@/features/shell/sidebar-style"
import { cn } from "@/lib/utils"

/**
 * 动态侧边栏头部的图标按钮：搜索、新建、导入都用这一款，
 * 可及名与提示语走同一个 label
 */
export function SidebarToolbarButton({
  label,
  pressed,
  className,
  children,
  ...props
}: {
  label: string
  /* 作为开关时传入，写进 aria-pressed 并点亮按钮 */
  pressed?: boolean
  className?: string
  children: ReactNode
} & Omit<ComponentProps<typeof Button>, "className" | "children">) {
  return (
    <TooltipHint label={label} side="top">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={label}
        aria-pressed={pressed}
        className={cn(
          SIDEBAR_HEADER_ICON_CLASS,
          "electron-no-drag",
          pressed && "bg-foreground/[0.08] text-foreground",
          className
        )}
        {...props}
      >
        {children}
      </Button>
    </TooltipHint>
  )
}
