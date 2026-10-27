"use client"

import type { ComponentProps, ReactNode } from "react"
import { MaximizeIcon, MinusIcon, PlusIcon, RotateCcwIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { useT } from "@/hooks/use-t"
import { ghostButton, mono, paper } from "./surfaces"

export type DiagramProps = Omit<
  ComponentProps<"div">,
  "title" | "children" | "onZoomIn" | "onZoomOut" | "onReset" | "onExpand"
> & {
  title: string
  /** 当前缩放比例，1 表示原始大小 */
  zoom: number
  children: ReactNode
  onZoomIn?: () => void
  onZoomOut?: () => void
  onReset?: () => void
  /** 未提供时不显示全屏按钮 */
  onExpand?: () => void
}

/** 图纸式容器：标题栏承载缩放与全屏控制，内容居中缩放 */
export function Diagram({
  title,
  zoom,
  children,
  onZoomIn,
  onZoomOut,
  onReset,
  onExpand,
  className,
  ...props
}: DiagramProps) {
  const t = useT()

  return (
    <div
      data-slot="diagram"
      className={cn(
        paper,
        "flex w-full max-w-md flex-col overflow-hidden rounded-2xl",
        className
      )}
      {...props}
    >
      <div className="flex items-center gap-1 px-3 py-2">
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
          {title}
        </span>
        <span
          className={cn(mono, "shrink-0 text-muted-foreground tabular-nums")}
        >
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          aria-label={t("common.diagramZoomOut")}
          onClick={onZoomOut}
          disabled={!onZoomOut}
          className={cn(
            ghostButton,
            "size-7 shrink-0 disabled:pointer-events-none disabled:opacity-30"
          )}
        >
          <MinusIcon className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label={t("common.diagramZoomIn")}
          onClick={onZoomIn}
          disabled={!onZoomIn}
          className={cn(
            ghostButton,
            "size-7 shrink-0 disabled:pointer-events-none disabled:opacity-30"
          )}
        >
          <PlusIcon className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label={t("common.diagramReset")}
          onClick={onReset}
          disabled={!onReset || zoom === 1}
          className={cn(
            ghostButton,
            "size-7 shrink-0 disabled:pointer-events-none disabled:opacity-30"
          )}
        >
          <RotateCcwIcon className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label={t("common.diagramExpand")}
          onClick={onExpand}
          disabled={!onExpand}
          className={cn(
            ghostButton,
            "size-7 shrink-0 disabled:pointer-events-none disabled:opacity-30"
          )}
        >
          <MaximizeIcon className="size-3.5" />
        </button>
      </div>

      <div className="flex min-h-[10rem] items-center justify-center overflow-hidden border-t border-foreground/[0.07] p-4">
        <div
          data-slot="diagram-canvas"
          className="origin-center transition-transform duration-200 ease-out motion-reduce:transition-none"
          style={{ transform: `scale(${zoom})` }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
