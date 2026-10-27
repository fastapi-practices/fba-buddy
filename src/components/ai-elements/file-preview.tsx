"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { CodeIcon, EyeIcon, RefreshCwIcon } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { SyntaxHighlighter } from "./shiki-highlighter"
import { MarkdownText } from "./markdown-text"
import { parseDelimitedText } from "@/features/chat/transcript-render"
import { useT } from "@/hooks/use-t"
import {
  readPreviewText,
  TEXT_PAGE_SIZE,
} from "@/features/chat/file-preview-data"
import { CsvPreview } from "./csv-preview"
import { MediaPreview } from "./media-preview"
import { Image } from "./image"
import { MarkdownBaseDirContext } from "./markdown-media"

export function FilePreview({
  name,
  mimeType,
  src,
  open,
  onOpenChange,
  line,
  column,
  toolbar,
  baseDir,
}: {
  name: string
  mimeType: string
  src: string
  open: boolean
  onOpenChange: (open: boolean) => void
  line?: number
  column?: number
  toolbar?: ReactNode
  baseDir?: string
}) {
  const t = useT()
  const [source, setSource] = useState(line !== undefined)
  const [loaded, setLoaded] = useState<{
    src: string
    revision: number
    text: string | null
    error: string
  } | null>(null)
  const [revision, setRevision] = useState(0)
  const current =
    loaded?.src === src && loaded.revision === revision ? loaded : null
  const text = current?.text ?? null
  const error = current?.error ?? ""
  const extension = name.split(".").at(-1)?.toLowerCase() ?? ""
  const markdown =
    ["md", "mdx", "markdown"].includes(extension) ||
    mimeType.includes("markdown")
  const html = ["html", "htm"].includes(extension) || mimeType === "text/html"
  const csv =
    ["csv", "tsv"].includes(extension) || /(?:csv|tab-separated)/.test(mimeType)
  const pdf = mimeType === "application/pdf" || extension === "pdf"
  const audio = mimeType.startsWith("audio/")
  const video = mimeType.startsWith("video/")
  const image = mimeType.startsWith("image/")
  const needsText = !pdf && !audio && !video && !image
  useEffect(() => {
    if (!open || !needsText) return
    const controller = new AbortController()
    void fetch(src, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(`${response.status} ${response.statusText}`)
        return readPreviewText(response, controller.signal)
      })
      .then((value) => {
        if (!controller.signal.aborted)
          setLoaded({ src, revision, text: value, error: "" })
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setLoaded({
            src,
            revision,
            text: null,
            error:
              cause instanceof RangeError
                ? t("common.previewResourceLimit")
                : cause instanceof Error
                  ? cause.message
                  : t("common.couldNotLoadPreview"),
          })
      })
    return () => controller.abort()
  }, [src, open, needsText, revision, t])
  const rows = useMemo(
    () =>
      csv && text
        ? parseDelimitedText(
            text,
            extension === "tsv" || mimeType.includes("tab-separated")
              ? "\t"
              : ","
          )
        : [],
    [csv, text, extension, mimeType]
  )
  const language =
    (
      {
        js: "javascript",
        ts: "typescript",
        py: "python",
        txt: "text",
        md: "markdown",
        csv: "text",
        tsv: "text",
      } as Record<string, string>
    )[extension] ?? extension
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85dvh] max-w-[calc(100vw-2rem)] flex-col sm:max-w-5xl">
        <DialogHeader className="shrink-0 pr-8">
          <DialogTitle className="truncate">{name}</DialogTitle>
        </DialogHeader>
        {toolbar}
        {markdown || html || csv ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => setSource(!source)}
          >
            {source ? (
              <EyeIcon data-icon="inline-start" />
            ) : (
              <CodeIcon data-icon="inline-start" />
            )}
            {t(source ? "common.showPreview" : "common.showSource")}
          </Button>
        ) : null}
        <div className="min-h-0 min-w-0 flex-1 overflow-auto">
          {error ? (
            <div
              role="alert"
              className="flex flex-col items-start gap-3 text-sm"
            >
              <p className="text-destructive">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRevision(revision + 1)}
              >
                <RefreshCwIcon data-icon="inline-start" />
                {t("common.retry")}
              </Button>
            </div>
          ) : image ? (
            <Image.Root size="full" variant="ghost">
              <Image.Zoom src={src} alt={name}>
                <Image.Preview src={src} alt={name} />
              </Image.Zoom>
            </Image.Root>
          ) : pdf ? (
            <iframe src={src} title={name} className="h-full w-full border-0" />
          ) : audio || video ? (
            <MediaPreview
              key={src}
              src={src}
              video={video}
              className="max-h-full w-full rounded-lg"
            />
          ) : text === null ? (
            <p role="status" className="text-sm text-muted-foreground">
              {t("common.loading")}
            </p>
          ) : html && !source ? (
            <iframe
              srcDoc={text}
              sandbox=""
              title={name}
              className="h-full w-full border bg-background"
            />
          ) : csv && !source ? (
            <CsvPreview key={`${src}:${revision}`} rows={rows} />
          ) : (
            <MarkdownBaseDirContext value={baseDir}>
              <TextPreview
                key={`${src}:${revision}`}
                text={text}
                language={language}
                markdown={markdown && !source}
                line={source || !markdown ? line : undefined}
                column={column}
              />
            </MarkdownBaseDirContext>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function TextPreview({
  text,
  language,
  markdown,
  line,
  column,
}: {
  text: string
  language: string
  markdown: boolean
  line?: number
  column?: number
}) {
  const t = useT()
  const [page, setPage] = useState(() =>
    line
      ? Math.min(
          Math.max(0, Math.ceil(text.length / TEXT_PAGE_SIZE) - 1),
          Math.floor(
            text
              .split("\n")
              .slice(0, line - 1)
              .join("\n").length / TEXT_PAGE_SIZE
          )
        )
      : 0
  )
  const target = useRef<HTMLSpanElement>(null)
  const pages = Math.max(1, Math.ceil(text.length / TEXT_PAGE_SIZE))
  const visible = text.slice(page * TEXT_PAGE_SIZE, (page + 1) * TEXT_PAGE_SIZE)
  const firstLine = text.slice(0, page * TEXT_PAGE_SIZE).split("\n").length
  useEffect(() => {
    target.current?.scrollIntoView({ block: "center" })
  }, [page, line])
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {pages > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p role="status" className="text-xs text-muted-foreground">
            {t("common.previewPartial", {
              shown: `${page * TEXT_PAGE_SIZE + 1}–${Math.min(text.length, (page + 1) * TEXT_PAGE_SIZE)}`,
              total: text.length,
            })}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!page}
              onClick={() => setPage(page - 1)}
            >
              {t("common.previousPage")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page + 1 >= pages}
              onClick={() => setPage(page + 1)}
            >
              {t("common.nextPage")}
            </Button>
          </div>
        </div>
      ) : null}
      {markdown ? (
        <MarkdownText text={visible} />
      ) : line !== undefined ? (
        <pre className="overflow-auto rounded border bg-muted/30 p-3 text-xs">
          {visible.split("\n").map((value, index) => (
            <span
              key={index}
              ref={firstLine + index === line ? target : undefined}
              data-line={firstLine + index}
              className={
                firstLine + index === line
                  ? "block min-w-fit bg-accent"
                  : "block min-w-fit"
              }
            >
              <span className="mr-4 inline-block w-10 text-right text-muted-foreground select-none">
                {firstLine + index}
              </span>
              {firstLine + index === line && column ? (
                <>
                  {value.slice(0, column - 1)}
                  <mark>{value.slice(column - 1, column) || " "}</mark>
                  {value.slice(column)}
                </>
              ) : (
                value || " "
              )}
            </span>
          ))}
        </pre>
      ) : (
        <SyntaxHighlighter code={visible} language={language} />
      )}
    </div>
  )
}
