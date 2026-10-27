import { useEffect, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  BellRingIcon,
  CalendarDaysIcon,
  CalendarClockIcon,
  ClapperboardIcon,
  ClipboardListIcon,
  LanguagesIcon,
  LightbulbIcon,
  MessageSquarePlusIcon,
  MoonIcon,
  NewspaperIcon,
  PlusIcon,
  StethoscopeIcon,
  type LucideIcon,
} from "lucide-react"

import { listConversations, listCrons } from "@/api"
import { apiErrorMessage } from "@/api/http"
import { queryKeys } from "@/api/query-keys"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { startResourceCreateChat } from "@/features/chat/resource-create"
import { CronEditorForm } from "@/features/chat/conversation-crons"
import {
  cronMatchesQuery,
  type CronEditorValues,
} from "@/features/chat/conversation-cron"
import { useSelectionStore } from "@/features/shell/selection-store"
import { SIDEBAR_EMPTY_PLACEHOLDER_CLASS } from "@/features/shell/sidebar-style"
import { SidebarToolbarButton } from "@/features/shell/sidebar-toolbar-button"
import { CronRecord } from "@/features/workspace/cron-record"
import {
  CRON_EXAMPLES,
  cronEditorValuesFromExample,
  type CronExample,
  type CronExampleDraft,
} from "@/features/workspace/cron-examples"
import { useCronWorkspaceStore } from "@/features/workspace/cron-workspace-store"
import { useWorkspaceSearchStore } from "@/features/workspace/workspace-search"
import { useT } from "@/hooks/use-t"
import { dataSourceKey, useAccountSourceStore } from "@/lib/account-source"
import type { CronItem } from "@/lib/types"

const RECORD_PAGE_SIZE = 30

function useCronRecords() {
  const source = useAccountSourceStore(dataSourceKey)
  return useQuery({
    queryKey: [...queryKeys.crons(), source],
    queryFn: listCrons,
  })
}

function useCronConversations() {
  const source = useAccountSourceStore(dataSourceKey)
  return useQuery({
    queryKey: [...queryKeys.conversations(), "cron-editor", source],
    queryFn: () => listConversations({ size: 100 }),
  })
}

export function CronLibrary() {
  const source = useAccountSourceStore(dataSourceKey)
  return <CronWorkspace key={source} />
}

function CronWorkspace() {
  const t = useT()
  const source = useAccountSourceStore(dataSourceKey)
  const queryClient = useQueryClient()
  const records = useCronRecords()
  const conversationsQuery = useCronConversations()
  const selectedId = useCronWorkspaceStore((state) => state.selectedId)
  const view = useCronWorkspaceStore((state) => state.view)
  const revision = useCronWorkspaceStore((state) => state.revision)
  const setView = useCronWorkspaceStore((state) => state.setView)
  const [exampleDraft, setExampleDraft] = useState<CronEditorValues | null>(
    null
  )
  const items = records.data ?? []
  const selected = items.find((item) => item.id === selectedId) ?? items[0]
  const conversations = (conversationsQuery.data?.items ?? []).map((item) => ({
    id: item.conversation_id,
    title: item.title,
  }))
  if (
    selected &&
    !conversations.some((item) => item.id === selected.conversation_id)
  ) {
    conversations.unshift({
      id: selected.conversation_id,
      title: selected.conversation_id,
    })
  }

  useEffect(
    () => () => {
      useWorkspaceSearchStore.getState().setQuery("")
      useCronWorkspaceStore.getState().reset()
    },
    []
  )

  async function saved() {
    const previousIds = new Set(items.map((item) => item.id))
    if (dataSourceKey() !== source) return
    await queryClient.invalidateQueries({
      queryKey: queryKeys.crons(),
      refetchType: "none",
    })
    if (dataSourceKey() !== source) return
    const updated = await records.refetch()
    if (
      dataSourceKey() !== source ||
      useCronWorkspaceStore.getState().revision !== revision
    )
      return
    const next =
      view === "create"
        ? updated.data?.find((item) => !previousIds.has(item.id))
        : selected
    if (next) useCronWorkspaceStore.getState().selectRecord(next.id)
  }

  function closeEditor(open: boolean) {
    if (open) return
    setExampleDraft(null)
    if (
      dataSourceKey() === source &&
      useCronWorkspaceStore.getState().revision === revision
    )
      setView("record")
  }

  function openCreate(draft: CronEditorValues | null) {
    setExampleDraft(draft)
    setView("create")
  }

  function applyExample(example: CronExampleDraft) {
    openCreate(cronEditorValuesFromExample(example, conversations[0]?.id ?? ""))
  }

  return (
    <div className="absolute inset-0 flex min-h-0 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {view === "edit" && selected ? (
          <div className="flex-1 overflow-y-auto px-6 py-6">
            {conversationsQuery.isLoading ? (
              <p role="status">{t("common.loading")}</p>
            ) : conversationsQuery.isError ? (
              <CronLoadError
                error={conversationsQuery.error}
                retry={() => void conversationsQuery.refetch()}
              />
            ) : (
              <CronEditorForm
                key={selected.id}
                presentation="inline"
                item={selected}
                conversations={conversations}
                onOpenChange={closeEditor}
                onSaved={saved}
              />
            )}
          </div>
        ) : records.isLoading ? (
          <p role="status" className="p-6 text-sm text-muted-foreground">
            {t("common.loading")}
          </p>
        ) : records.isError ? (
          <CronLoadError
            error={records.error}
            retry={() => void records.refetch()}
          />
        ) : selected ? (
          <CronRecord key={selected.id} item={selected} />
        ) : (
          <Empty className="flex-1">
            <EmptyHeader>
              <EmptyMedia className="mb-1 text-muted-foreground/40 [&_svg]:size-12">
                <CalendarClockIcon strokeWidth={1.25} />
              </EmptyMedia>
              <EmptyTitle className="text-base text-muted-foreground">
                {t("common.noScheduledTasksYet")}
              </EmptyTitle>
            </EmptyHeader>
          </Empty>
        )}
      </div>
      <CronExamples onUseExample={applyExample} />
      {view === "create" ? (
        <CronEditorForm
          key={exampleDraft ? `example-${exampleDraft.name}` : "create"}
          presentation="dialog"
          item={null}
          initialValues={exampleDraft ?? undefined}
          conversations={conversations}
          onOpenChange={closeEditor}
          onSaved={saved}
        />
      ) : null}
    </div>
  )
}

const CRON_EXAMPLE_ICONS: Record<CronExample["id"], LucideIcon> = {
  aiNews: NewspaperIcon,
  englishWords: LanguagesIcon,
  bedtimeStory: MoonIcon,
  weeklyReport: ClipboardListIcon,
  movieRecommendation: ClapperboardIcon,
  todayInHistory: CalendarDaysIcon,
  dailyWhy: LightbulbIcon,
  parentsContact: BellRingIcon,
  healthAppointment: StethoscopeIcon,
}

function CronExamples({
  onUseExample,
}: {
  onUseExample: (example: CronExampleDraft) => void
}) {
  const t = useT()
  return (
    <section className="w-full shrink-0 px-6 pt-4 pb-8">
      <h2 className="mb-3 text-lg font-medium">
        {t("common.tryTheseCommonTasks")}
      </h2>
      <div className="grid grid-cols-3 gap-3">
        {CRON_EXAMPLES.map((example) => {
          const Icon = CRON_EXAMPLE_ICONS[example.id]
          const title = t(example.titleKey)
          const applyExample = () => {
            onUseExample({
              name: title,
              trigger: example.trigger,
              prompt: t(example.promptKey),
              fresh_thread: example.freshThread,
            })
          }
          return (
            <button
              key={example.id}
              type="button"
              className="flex h-24 min-w-0 items-center gap-3 rounded-xl bg-card px-4 text-left ring-1 ring-foreground/5 transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              onClick={applyExample}
            >
              <Icon className="size-4 shrink-0 text-foreground/70" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {title}
                </span>
                <span className="mt-1 block truncate text-xs text-muted-foreground">
                  {t(example.descriptionKey)}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

export function WorkspaceCronCreateInChatButton() {
  const t = useT()
  return (
    <SidebarToolbarButton
      label={t("common.createInChat")}
      onClick={() => void startResourceCreateChat("cron").catch(() => undefined)}
    >
      <MessageSquarePlusIcon strokeWidth={1.75} />
    </SidebarToolbarButton>
  )
}

export function WorkspaceCronAddButton() {
  const t = useT()
  const setView = useCronWorkspaceStore((state) => state.setView)
  const conversations = useCronConversations()
  return (
    <SidebarToolbarButton
      label={t("common.newScheduledTask")}
      disabled={!conversations.data?.items.length}
      onClick={() => setView("create")}
    >
      <PlusIcon strokeWidth={1.75} />
    </SidebarToolbarButton>
  )
}

export function CronRecordsSidebar() {
  const t = useT()
  const source = useAccountSourceStore(dataSourceKey)
  const records = useCronRecords()
  const conversations = useCronConversations()
  const query = useWorkspaceSearchStore((state) => state.query)
  const selectedId = useCronWorkspaceStore((state) => state.selectedId)
  const allItems = records.data ?? []
  const activeId =
    allItems.find((item) => item.id === selectedId)?.id ?? allItems[0]?.id
  const items = allItems.filter((item) =>
    cronMatchesQuery(
      item,
      query,
      conversations.data?.items.find(
        (chat) => chat.conversation_id === item.conversation_id
      )?.title
    )
  )
  return (
    <SidebarGroup
      className="shrink-0 px-3 py-1"
      aria-label={t("common.records")}
    >
      <SidebarGroupContent>
        <SidebarMenu className="gap-0.5">
          <CronRecordItems
            key={`${source}:${query}`}
            items={items}
            activeId={activeId}
          />
          {records.isLoading ? (
            <SidebarMenuItem>
              <span role="status" className={SIDEBAR_EMPTY_PLACEHOLDER_CLASS}>
                {t("common.loading")}
              </span>
            </SidebarMenuItem>
          ) : records.isError ? (
            <SidebarMenuItem>
              <CronLoadError
                error={records.error}
                retry={() => void records.refetch()}
              />
            </SidebarMenuItem>
          ) : items.length === 0 ? (
            <SidebarMenuItem>
              <span className={SIDEBAR_EMPTY_PLACEHOLDER_CLASS}>
                {t("common.noRecordsYet")}
              </span>
            </SidebarMenuItem>
          ) : null}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

function CronRecordItems({
  items,
  activeId,
}: {
  items: CronItem[]
  activeId?: number
}) {
  const [visibleCount, setVisibleCount] = useState(RECORD_PAGE_SIZE)
  const sentinel = useRef<HTMLLIElement>(null)
  const selectRecord = useCronWorkspaceStore((state) => state.selectRecord)
  const hasMore = visibleCount < items.length

  useEffect(() => {
    const target = sentinel.current
    if (!target || !hasMore) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return
        observer.disconnect()
        setVisibleCount((count) => count + RECORD_PAGE_SIZE)
      },
      { root: target.closest('[data-sidebar="content"]'), rootMargin: "160px" }
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [hasMore, visibleCount, items.length])

  return (
    <>
      {items.slice(0, visibleCount).map((item) => (
        <SidebarMenuItem key={item.id}>
          <SidebarMenuButton
            data-cron-id={item.id}
            className="h-auto min-h-10 py-2"
            isActive={item.id === activeId}
            aria-current={item.id === activeId ? "true" : undefined}
            onClick={() => {
              selectRecord(item.id)
              useSelectionStore
                .getState()
                .markConversationRead(item.conversation_id)
            }}
            title={item.name}
          >
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate">{item.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {item.prompt}
              </span>
            </span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
      {hasMore ? (
        <SidebarMenuItem ref={sentinel} aria-hidden="true" className="h-1" />
      ) : null}
    </>
  )
}

function CronLoadError({
  error,
  retry,
}: {
  error: unknown
  retry: () => void
}) {
  const t = useT()
  return (
    <div role="alert" className="flex flex-col gap-2 p-4 text-sm">
      <p className="text-destructive">{apiErrorMessage(error)}</p>
      <Button variant="outline" size="sm" onClick={retry}>
        {t("common.retry")}
      </Button>
    </div>
  )
}
