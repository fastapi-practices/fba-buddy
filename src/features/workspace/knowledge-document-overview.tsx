import { useMemo, useState } from "react"
import { CodeIcon, EyeIcon, ImageOffIcon } from "lucide-react"

import { Image } from "@/components/ai-elements/image"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table"
import { TEXT_PAGE_SIZE } from "@/features/chat/file-preview-data"
import { knowledgeImageOverview } from "@/features/workspace/knowledge-image-overview"
import { WorkspaceMarkdown } from "@/features/workspace/workspace-markdown"
import {
  isMarkdownFormat,
  libraryOverviewKind,
  libraryRecordOverview,
} from "@/features/workspace/workspace-records"
import { useT } from "@/hooks/use-t"
import type { WorkspaceKnowledgeItem } from "@/lib/types"

export function KnowledgeDocumentOverview({
  document,
}: {
  document: WorkspaceKnowledgeItem
}) {
  const t = useT()
  const kind = libraryOverviewKind("knowledge", document)
  const content = libraryRecordOverview("knowledge", document)
  const image = useMemo(
    () => (kind === "image" ? knowledgeImageOverview(document, content) : null),
    [content, document, kind]
  )
  const textContent = image?.text ?? content
  const [source, setSource] = useState(false)
  const [page, setPage] = useState(0)
  const tabular = kind === "tsv"
  const markdown = isMarkdownFormat(kind)
  const rows = useMemo(
    () =>
      !tabular
        ? []
        : textContent
            .trimEnd()
            .split(/\r?\n/)
            .map((row) => row.split("\t")),
    [tabular, textContent]
  )
  const pageSize = tabular && !source ? 100 : TEXT_PAGE_SIZE
  const total = tabular && !source ? rows.length : textContent.length
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = Math.min(page, pages - 1)
  const start = currentPage * pageSize
  const columns = rows.reduce((count, row) => Math.max(count, row.length), 0)

  if (!content.trim()) {
    return (
      <p className="text-sm text-muted-foreground">{t("common.noContent")}</p>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {image ? (
        image.source ? (
          <Image.Root size="full" variant="outline">
            <Image.Zoom src={image.source} alt={document.title}>
              <Image.Preview
                src={image.source}
                alt={document.title}
                loading="lazy"
              />
            </Image.Zoom>
          </Image.Root>
        ) : (
          <div className="flex items-start gap-3 rounded-lg border border-dashed bg-background/70 p-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
              <ImageOffIcon className="size-5 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{document.title}</p>
              {image.filename !== document.title ? (
                <p className="truncate text-xs text-muted-foreground">
                  {image.filename}
                </p>
              ) : null}
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {t("knowledge.imageOriginalUnavailable")}
              </p>
            </div>
          </div>
        )
      ) : null}
      {markdown || tabular ? (
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => {
            setSource(!source)
            setPage(0)
          }}
        >
          {source ? (
            <EyeIcon data-icon="inline-start" />
          ) : (
            <CodeIcon data-icon="inline-start" />
          )}
          {t(source ? "common.showPreview" : "common.showSource")}
        </Button>
      ) : null}
      {tabular && !source ? (
        <Table aria-label={document.title}>
          <TableBody>
            {rows.slice(start, start + pageSize).map((row, index) => (
              <TableRow key={start + index}>
                {Array.from({ length: columns }, (_, column) => (
                  <TableCell
                    key={column}
                    className="min-w-24 align-top whitespace-pre-wrap"
                  >
                    {row[column] ?? ""}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
      {textContent.trim() ? (
        <>
          {image ? (
            <p className="text-xs font-medium text-muted-foreground">
              {t("knowledge.imageOcrText")}
            </p>
          ) : null}
          {tabular && !source ? null : source || !markdown ? (
            <pre className="text-sm leading-relaxed wrap-anywhere whitespace-pre-wrap">
              {textContent.slice(start, start + pageSize)}
            </pre>
          ) : (
            <WorkspaceMarkdown
              kind={kind}
              content={textContent.slice(start, start + pageSize)}
            />
          )}
        </>
      ) : null}
      {pages > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p role="status" className="text-xs text-muted-foreground">
            {t("common.previewPartial", {
              shown: `${start + 1}–${Math.min(total, start + pageSize)}`,
              total,
            })}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!currentPage}
              onClick={() => setPage(currentPage - 1)}
            >
              {t("common.previousPage")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage + 1 >= pages}
              onClick={() => setPage(currentPage + 1)}
            >
              {t("common.nextPage")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
