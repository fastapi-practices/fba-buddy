"use client"

import { useContext, useLayoutEffect, useRef, useState } from "react"
import type { Components } from "react-markdown"
import { CheckIcon, CopyIcon, Maximize2Icon } from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { TooltipIconButton } from "./tooltip-icon-button"
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard"
import { useT } from "@/hooks/use-t"
import {
  markdownTableSource,
  tableRowsToMarkdown,
} from "@/features/chat/markdown-table"
import { cn } from "@/lib/utils"
import { MarkdownSourceContext } from "./markdown-source"
import { tableRowsToCsv } from "@/features/chat/transcript-render"

export const MarkdownTable: NonNullable<Components["table"]> = ({
  node,
  className,
  children,
  ...props
}) => {
  const t = useT()
  const source = useContext(MarkdownSourceContext)
  const containerRef = useRef<HTMLDivElement>(null)
  const tableRef = useRef<HTMLTableElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [contentWidth, setContentWidth] = useState(0)
  useLayoutEffect(() => {
    if (!expanded || !containerRef.current) return
    const content =
      containerRef.current.closest('[data-slot="transcript-message-group"]') ??
      containerRef.current
    const measure = () => setContentWidth(content.getBoundingClientRect().width)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(content)
    return () => observer.disconnect()
  }, [expanded])
  const { isCopied, copyToClipboard } = useCopyToClipboard()
  const copy = () => {
    const markdown = markdownTableSource(
      source,
      node?.position?.start.offset,
      node?.position?.end.offset
    )
    const rows = Array.from(tableRef.current?.rows ?? []).map((row) =>
      Array.from(row.cells).map((cell) => cell.textContent?.trim() ?? "")
    )
    copyToClipboard(markdown || tableRowsToMarkdown(rows))
  }
  const tableClass = cn(
    "markdown-table w-max min-w-full border-separate border-spacing-0",
    className
  )
  const copyButton = (
    <TooltipIconButton
      type="button"
      tooltip={t(isCopied ? "common.copied" : "common.copyMarkdownTable")}
      onClick={copy}
    >
      {isCopied ? <CheckIcon /> : <CopyIcon />}
    </TooltipIconButton>
  )
  const csvButton = (
    <TooltipIconButton
      type="button"
      tooltip={t("common.copyCsvTable")}
      onClick={() => {
        const rows = Array.from(tableRef.current?.rows ?? []).map((row) =>
          Array.from(row.cells).map((cell) => cell.textContent ?? "")
        )
        copyToClipboard(tableRowsToCsv(rows))
      }}
    >
      <span className="text-[10px] font-medium">CSV</span>
    </TooltipIconButton>
  )

  return (
    <div
      ref={containerRef}
      data-slot="markdown-table"
      className="markdown-table-container group/table relative my-3 w-full max-w-full min-w-0"
    >
      <div
        data-slot="markdown-table-actions"
        className="absolute top-1 right-1 z-10 flex gap-1 rounded-md border bg-background p-1 opacity-0 shadow-sm transition-opacity group-focus-within/table:opacity-100 group-hover/table:opacity-100 [@media(hover:none)]:opacity-100"
      >
        {copyButton}
        {csvButton}
        <TooltipIconButton
          type="button"
          tooltip={t("common.expandTable")}
          onClick={() => setExpanded(true)}
        >
          <Maximize2Icon />
        </TooltipIconButton>
      </div>
      <div
        data-slot="markdown-table-scroll"
        className="w-full overflow-x-auto"
        tabIndex={0}
        role="region"
        aria-label={t("common.table")}
      >
        <table ref={tableRef} className={tableClass} {...props}>
          {children}
        </table>
      </div>
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="flex max-h-[90vh] w-max max-w-[calc(100vw-2rem)] flex-col gap-2 bg-background text-foreground sm:max-w-[calc(100vw-4rem)]">
          <DialogTitle className="sr-only">{t("common.table")}</DialogTitle>
          <div className="flex shrink-0 justify-end gap-1 pr-8">
            {copyButton}
            {csvButton}
          </div>
          <div
            className="markdown min-h-0 w-full overflow-auto"
            tabIndex={0}
            role="region"
            aria-label={t("common.table")}
          >
            <table
              className={tableClass}
              {...props}
              style={{ ...props.style, minWidth: contentWidth }}
            >
              {children}
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
