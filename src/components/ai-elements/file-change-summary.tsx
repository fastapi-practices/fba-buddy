"use client"

import { useState } from "react"
import { ChevronDownIcon, FileDiffIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ChangedFile } from "@/features/chat/file-changes"
import { useT } from "@/hooks/use-t"
import { FileTree } from "./file-tree"

function FileChangeStats({
  additions,
  deletions,
}: {
  additions: number
  deletions: number
}) {
  return (
    <span className="shrink-0 font-mono tabular-nums">
      <span className="text-[var(--diff-added)]">+{additions}</span>{" "}
      <span className="text-[var(--diff-removed)]">−{deletions}</span>
    </span>
  )
}

export function FileChangeSummary({
  files,
  totalAdditions,
  totalDeletions,
  onView,
  onUndo,
  undoing,
  undone,
}: {
  files: readonly ChangedFile[]
  totalAdditions: number
  totalDeletions: number
  onView: (path?: string) => void
  onUndo?: () => void
  undoing?: boolean
  undone?: boolean
}) {
  const t = useT()
  const [expanded, setExpanded] = useState(false)
  const single = files.length === 1
  const visible = expanded ? files : files.slice(0, 3)
  if (files.length === 0) return null

  return (
    <section
      data-slot="file-change-summary"
      className="w-full overflow-hidden rounded-xl border bg-muted/30"
    >
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-background">
          <FileDiffIcon className="size-5 text-muted-foreground" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 font-medium">
            <span>
              {single
                ? t("common.fileEdited")
                : t("common.filesEdited", { n: files.length })}
            </span>
            {single && (
              <span
                className="min-w-0 truncate font-mono"
                title={files[0]!.path}
              >
                {files[0]!.name}
              </span>
            )}
          </div>
          <div className="mt-0.5 text-sm">
            <FileChangeStats
              additions={totalAdditions}
              deletions={totalDeletions}
            />
          </div>
        </div>
        {onUndo && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onUndo}
            disabled={undoing || undone}
          >
            {t(undone ? "common.changeUndone" : "common.undoChange")}
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onView()}
        >
          {t("common.viewFileChanges")}
        </Button>
      </div>
      {!single && (
        <div className="border-t bg-background/40">
          <FileTree
            className="py-1"
            files={visible.map((file) => ({
              path: file.path,
              name: file.name,
              meta: (
                <FileChangeStats
                  additions={file.additions}
                  deletions={file.deletions}
                />
              ),
            }))}
            onSelect={onView}
          />
          {files.length > 3 && (
            <Button
              type="button"
              variant="ghost"
              className="w-full justify-start rounded-none px-4"
              aria-expanded={expanded}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded
                ? t("common.collapse")
                : t("common.showMoreFiles", { n: files.length - 3 })}
              <ChevronDownIcon
                data-icon="inline-end"
                data-expanded={expanded}
                className="data-[expanded=true]:rotate-180"
              />
            </Button>
          )}
        </div>
      )}
    </section>
  )
}
