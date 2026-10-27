import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { BookOpenIcon, FileTextIcon, SearchIcon } from "lucide-react"

import { listKnowledgeDocuments } from "@/api"
import { apiErrorMessage } from "@/api/http"
import { queryKeys } from "@/api/query-keys"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { usePrefsStore } from "@/features/shell/prefs-store"
import { SIDEBAR_EDGE_INSET_X_CLASS } from "@/features/shell/sidebar-style"
import { KnowledgeBaseActions } from "@/features/workspace/knowledge-base-controls"
import {
  useKnowledgeBases,
  useSelectedKnowledgeBase,
} from "@/features/workspace/knowledge-workspace"
import { CatalogDialog } from "@/features/workspace/workspace-library"
import {
  formatWorkspaceTime,
  matchesLibraryQuery,
} from "@/features/workspace/workspace-records"
import { useT } from "@/hooks/use-t"
import { dataSourceKey, useAccountSourceStore } from "@/lib/account-source"
import { canEditOwnedResource } from "@/lib/ownership"
import type { KnowledgeBaseItem, WorkspaceKnowledgeItem } from "@/lib/types"
import { cn } from "@/lib/utils"

export function KnowledgeLibrary() {
  const t = useT()
  const source = useAccountSourceStore(dataSourceKey)
  const basesQuery = useKnowledgeBases()
  const base = useSelectedKnowledgeBase(basesQuery.data ?? [])

  return (
    <div className="absolute inset-0 flex flex-col overflow-y-auto">
      <div
        className={cn(
          "flex min-h-full w-full flex-1 flex-col gap-6 pt-6 pb-8",
          SIDEBAR_EDGE_INSET_X_CLASS
        )}
      >
        {basesQuery.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : basesQuery.isError ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BookOpenIcon />
              </EmptyMedia>
              <EmptyTitle>
                {t("common.couldNotLoadName", { name: t("knowledge.title") })}
              </EmptyTitle>
              <EmptyDescription>
                {apiErrorMessage(basesQuery.error)}
              </EmptyDescription>
            </EmptyHeader>
            <Button variant="outline" onClick={() => void basesQuery.refetch()}>
              {t("common.retry")}
            </Button>
          </Empty>
        ) : base ? (
          <KnowledgeFiles key={`${source}:${base.id}`} base={base} />
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BookOpenIcon />
              </EmptyMedia>
              <EmptyTitle>
                {t("common.noNameYet", { name: t("knowledge.title") })}
              </EmptyTitle>
              <EmptyDescription>{t("knowledge.createFirst")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>
    </div>
  )
}

function KnowledgeFiles({ base }: { base: KnowledgeBaseItem }) {
  const t = useT()
  const locale = usePrefsStore((state) => state.locale)
  const source = useAccountSourceStore(dataSourceKey)
  const queryClient = useQueryClient()
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<WorkspaceKnowledgeItem | null>(null)
  const documentsQuery = useQuery({
    queryKey: [...queryKeys.knowledgeDocuments(base.id), source],
    queryFn: () => listKnowledgeDocuments(base.id),
  })
  const documents = documentsQuery.data ?? []
  const filtered = documents.filter((item) => matchesLibraryQuery(item, query))
  const owned = canEditOwnedResource(base.user_id)

  return (
    <section aria-label={base.name} className="flex flex-1 flex-col gap-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate text-lg font-semibold">{base.name}</h2>
            {!owned ? (
              <Badge variant="outline">{t("common.builtIn")}</Badge>
            ) : null}
            {owned ? <KnowledgeBaseActions base={base} /> : null}
          </div>
        </div>
        <InputGroup className="w-full sm:w-64 sm:shrink-0">
          <InputGroupInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("knowledge.searchFiles")}
            aria-label={t("knowledge.searchFiles")}
          />
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
        </InputGroup>
      </div>
      <p className="text-sm wrap-anywhere whitespace-pre-wrap text-muted-foreground">
        {base.description?.trim() || t("common.noDescription")}
      </p>
      {documentsQuery.isPending ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : documentsQuery.isError ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileTextIcon />
            </EmptyMedia>
            <EmptyTitle>
              {t("common.couldNotLoadName", { name: t("knowledge.files") })}
            </EmptyTitle>
            <EmptyDescription>
              {apiErrorMessage(documentsQuery.error)}
            </EmptyDescription>
          </EmptyHeader>
          <Button
            variant="outline"
            onClick={() => void documentsQuery.refetch()}
          >
            {t("common.retry")}
          </Button>
        </Empty>
      ) : filtered.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileTextIcon />
            </EmptyMedia>
            <EmptyTitle>
              {t(
                documents.length === 0
                  ? "knowledge.noFiles"
                  : "knowledge.noMatchingFiles"
              )}
            </EmptyTitle>
            {documents.length === 0 && owned ? (
              <EmptyDescription>
                {t("knowledge.emptyFilesHint")}
              </EmptyDescription>
            ) : null}
          </EmptyHeader>
        </Empty>
      ) : (
        <Table aria-label={t("knowledge.files")} className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead>{t("knowledge.fileName")}</TableHead>
              <TableHead className="w-24">{t("common.type")}</TableHead>
              <TableHead className="w-48">{t("common.updated")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((document) => (
              <TableRow key={document.id}>
                <TableCell>
                  <Button
                    variant="link"
                    className="h-auto max-w-full justify-start px-0 py-1"
                    onClick={() =>
                      setSelected({
                        ...document,
                        knowledge_base_name: base.name,
                      })
                    }
                  >
                    <FileTextIcon data-icon="inline-start" />
                    <span className="truncate">{document.title}</span>
                  </Button>
                </TableCell>
                <TableCell>{document.file_type.toUpperCase()}</TableCell>
                <TableCell>
                  {formatWorkspaceTime(
                    document.updated_time ?? document.created_time,
                    locale
                  ) || "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <CatalogDialog
        kind="knowledge"
        record={selected}
        onClose={() => setSelected(null)}
        onDeleted={() => {
          setSelected(null)
          void queryClient.invalidateQueries({
            queryKey: queryKeys.knowledge(),
          })
        }}
      />
    </section>
  )
}
