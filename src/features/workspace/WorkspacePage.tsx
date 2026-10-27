import { translateCurrent } from "@/lib/i18n"
import { useQuery } from "@tanstack/react-query"
import { BrainIcon } from "lucide-react"
import { useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { deleteMemory, getMemory, listMemories } from "@/api"
import { queryKeys } from "@/api/query-keys"
import { useAppLocation } from "@/app/use-app-location"
import { usePrefsStore } from "@/features/shell/prefs-store"
import { AcpLibrary } from "@/features/workspace/acp-library"
import { CronLibrary } from "@/features/workspace/cron-library"
import { KnowledgeLibrary } from "@/features/workspace/knowledge-library"
import { McpLibrary } from "@/features/workspace/mcp-library"
import { PhraseLibrary } from "@/features/workspace/phrase-library"
import { WorkspaceLibrary } from "@/features/workspace/workspace-library"
import { getWorkspaceNavItem } from "@/features/workspace/workspace-nav"
import {
  formatWorkspaceTime,
  toWorkspaceListItem,
} from "@/features/workspace/workspace-records"
import { useT } from "@/hooks/use-t"
import { apiErrorMessage } from "@/api/http"
import type { MemoryListItem } from "@/lib/types"

export function WorkspacePage() {
  const workspaceKind = useAppLocation().workspaceKind
  if (workspaceKind === "knowledge") {
    return <KnowledgeLibrary />
  }
  if (workspaceKind === "skill" || workspaceKind === "artifact") {
    return <WorkspaceLibrary kind={workspaceKind} />
  }
  if (workspaceKind === "acp") {
    return <AcpLibrary />
  }
  if (workspaceKind === "mcp") {
    return <McpLibrary />
  }
  if (workspaceKind === "phrase") {
    return <PhraseLibrary />
  }
  if (workspaceKind === "cron") {
    return <CronLibrary />
  }
  return <WorkspaceRecordsPage />
}

function WorkspaceRecordsPage() {
  const t = useT()
  const locale = usePrefsStore((state) => state.locale)
  const meta = getWorkspaceNavItem("memory")

  const recordsQuery = useQuery({
    queryKey: queryKeys.memories(),
    queryFn: listMemories,
  })

  const [peekKey, setPeekKey] = useState<string | null>(null)

  const records = recordsQuery.data ?? []
  const items = records.map((item) => toWorkspaceListItem("memory", item))
  const selectedRecord =
    records.find(
      (item) => toWorkspaceListItem("memory", item).key === peekKey
    ) ?? null
  const memoryQuery = useQuery({
    queryKey: queryKeys.memory(peekKey ?? ""),
    queryFn: () => getMemory(peekKey ?? ""),
    enabled: Boolean(peekKey),
  })

  function selectRecord(key: string) {
    setPeekKey((current) => (current === key ? null : key))
  }

  return (
    <div className="absolute inset-0 flex flex-col overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-1 flex-col gap-6 px-10 pt-8 pb-10">
        <h1 className="text-2xl font-medium tracking-tight">{t(meta.label)}</h1>

        {recordsQuery.isLoading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : recordsQuery.isError ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BrainIcon />
              </EmptyMedia>
              <EmptyTitle>
                {t("common.couldNotLoadName", { name: t(meta.label) })}
              </EmptyTitle>
              <EmptyDescription>
                {apiErrorMessage(
                  recordsQuery.error,
                  translateCurrent("common.pleaseTryAgainLater")
                )}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : items.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BrainIcon />
              </EmptyMedia>
              <EmptyTitle>
                {t("common.noNameYet", { name: t(meta.label) })}
              </EmptyTitle>
              <EmptyDescription>
                {t("common.theyAppearHereAfterTheAssistantWritesThem")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex flex-col gap-4">
            {selectedRecord ? (
              <WorkspaceRecordDetail
                record={selectedRecord}
                memoryContent={memoryQuery.data?.content}
                onDeleteMemory={
                  peekKey
                    ? () => {
                        void deleteMemory(peekKey).then(() => {
                          setPeekKey(null)
                          void recordsQuery.refetch()
                        })
                      }
                    : undefined
                }
              />
            ) : null}
            <div className="flex flex-col gap-2">
              {items.map((item) => (
                <Button
                  key={item.key}
                  type="button"
                  variant={peekKey === item.key ? "secondary" : "outline"}
                  className="h-auto w-full flex-col items-start gap-1 py-3"
                  onClick={() => selectRecord(item.key)}
                >
                  <span className="flex w-full min-w-0 items-center gap-2">
                    <span className="truncate text-left">{item.label}</span>
                    {item.badge ? (
                      <Badge variant="secondary">{item.badge}</Badge>
                    ) : null}
                  </span>
                  {item.preview ? (
                    <span className="w-full truncate text-left text-xs font-normal text-muted-foreground">
                      {item.preview}
                    </span>
                  ) : null}
                  {item.updatedTime ? (
                    <span className="w-full truncate text-left text-xs font-normal text-muted-foreground">
                      {formatWorkspaceTime(item.updatedTime, locale)}
                    </span>
                  ) : null}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function WorkspaceRecordDetail({
  record,
  memoryContent,
  onDeleteMemory,
}: {
  record: MemoryListItem
  memoryContent?: string
  onDeleteMemory?: () => void
}) {
  const t = useT()
  const item = toWorkspaceListItem("memory", record)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="min-w-0 truncate">{item.label}</span>
          {item.badge ? <Badge variant="secondary">{item.badge}</Badge> : null}
        </CardTitle>
        <CardDescription>{record.path}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm whitespace-pre-wrap">
          {memoryContent ?? record.preview}
        </p>
      </CardContent>
      {onDeleteMemory ? (
        <CardFooter>
          <Button type="button" variant="destructive" onClick={onDeleteMemory}>
            {t("common.deleteMemory")}
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  )
}
