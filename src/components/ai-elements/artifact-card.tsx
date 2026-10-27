"use client"

import type { ComponentProps } from "react"
import { ArrowUpRightIcon, FileTextIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import type { ArtifactCardItem } from "@/features/chat/artifact-cards"
import { useT } from "@/hooks/use-t"
import { mono, paper, ShimmerLabel } from "./surfaces"

export type ArtifactCardProps = Omit<
  ComponentProps<"button">,
  "children" | "title" | "meta" | "generating" | "words"
> & {
  title: string
  meta: string
  generating?: boolean
  generation?: ArtifactCardItem["generation"]
  words?: number
}

/** 产物生成或交付过程中的紧凑卡片 */
export function ArtifactCard({
  title,
  meta,
  generating = false,
  generation = "write",
  words = 0,
  className,
  ...props
}: ArtifactCardProps) {
  const t = useT()
  return (
    <button
      type="button"
      data-slot="artifact-card"
      className={cn(
        paper,
        "group flex w-full max-w-xs cursor-pointer items-center gap-3 rounded-[20px] p-3.5 text-left transition-transform duration-150 hover:-translate-y-px active:scale-[0.98] motion-reduce:transition-none",
        className
      )}
      {...props}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-foreground/[0.05] text-muted-foreground">
        <FileTextIcon
          className={cn(
            "size-4",
            generating && "animate-pulse motion-reduce:animate-none"
          )}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-medium">
          {title}
        </span>
        {generating ? (
          <span
            className={cn(
              mono,
              "flex items-center gap-1 text-muted-foreground"
            )}
          >
            <ShimmerLabel className="relative inline-block leading-none">
              {t(
                generation === "delivery"
                  ? "common.deliveringArtifact"
                  : "common.artifactWriting"
              )}
            </ShimmerLabel>
            {generation === "write" && (
              <>
                <span>·</span>
                <span className="tabular-nums">
                  {t("common.artifactWords", { n: words })}
                </span>
              </>
            )}
          </span>
        ) : (
          <span
            className={cn(
              mono,
              "animate-in text-muted-foreground duration-300 blur-in-[2px] fade-in motion-reduce:animate-none"
            )}
          >
            {meta}
          </span>
        )}
      </span>
      <ArrowUpRightIcon className="size-3.5 shrink-0 text-foreground/35 opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  )
}
