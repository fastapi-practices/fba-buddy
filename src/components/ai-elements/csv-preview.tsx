"use client"

import { useDeferredValue, useMemo, useState } from "react"
import { ArrowDownIcon, ArrowUpIcon, ArrowUpDownIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field } from "@/components/ui/field"
import { useT } from "@/hooks/use-t"
import {
  filterSortCsvRows,
  type CsvSort,
} from "@/features/chat/file-preview-data"

const pageSize = 100

export function CsvPreview({ rows }: { rows: string[][] }) {
  const t = useT()
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState<CsvSort>(null)
  const deferredQuery = useDeferredValue(query)
  const body = useMemo(() => rows.slice(1), [rows])
  const filtered = useMemo(
    () => filterSortCsvRows(body, deferredQuery, sort),
    [body, deferredQuery, sort]
  )
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, pages - 1)
  const width = useMemo(
    () => rows.reduce((count, row) => Math.max(count, row.length), 0),
    [rows]
  )
  const headers = Array.from(
    { length: width },
    (_, index) => rows[0]?.[index] ?? String(index + 1)
  )
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-3">
      <Field className="shrink-0">
        <Input
          aria-label={t("common.filterRows")}
          placeholder={t("common.filterRows")}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setPage(0)
          }}
        />
      </Field>
      <div className="min-h-0 w-full flex-1 overflow-auto">
        <table className="w-max min-w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-muted">
            <tr>
              {headers.map((header, index) => (
                <th
                  key={index}
                  aria-sort={
                    sort?.column === index
                      ? sort.descending
                        ? "descending"
                        : "ascending"
                      : "none"
                  }
                  className="border bg-muted px-2 py-1 text-start"
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-between"
                    onClick={() => {
                      setSort({
                        column: index,
                        descending:
                          sort?.column === index ? !sort.descending : false,
                      })
                      setPage(0)
                    }}
                  >
                    {header}
                    {sort?.column === index ? (
                      sort.descending ? (
                        <ArrowDownIcon data-icon="inline-end" />
                      ) : (
                        <ArrowUpIcon data-icon="inline-end" />
                      )
                    ) : (
                      <ArrowUpDownIcon data-icon="inline-end" />
                    )}
                  </Button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered
              .slice(currentPage * pageSize, (currentPage + 1) * pageSize)
              .map((row, index) => (
                <tr key={currentPage * pageSize + index}>
                  {headers.map((_, column) => (
                    <td
                      key={column}
                      className="max-w-xl border px-3 py-2 whitespace-pre-wrap"
                    >
                      {row[column] ?? ""}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
        {!filtered.length ? (
          <p role="status" className="py-4 text-sm text-muted-foreground">
            {t("common.noMatches")}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <p role="status" className="text-xs text-muted-foreground">
          {t("common.previewPage", {
            page: currentPage + 1,
            pages,
            rows: filtered.length,
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
    </div>
  )
}
