import { translateCurrent } from "@/lib/i18n"
import { useEffect, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  BotIcon,
  MessageSquareQuoteIcon,
  PencilIcon,
  QuoteIcon,
  SparklesIcon,
  Wand2Icon,
  XIcon,
} from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { applyExpert, listAssistantCategories, listExperts } from "@/api"
import { queryKeys } from "@/api/query-keys"
import { useAppLocation } from "@/app/use-app-location"
import { AssistantEditorDialog } from "@/features/assistants/assistant-editor"
import { ExpertEditorDialog } from "@/features/assistants/expert-editor"
import { ExpertAvatar } from "@/features/assistants/expert-avatar"
import { ExpertDialog } from "@/features/assistants/expert-dialog"
import {
  composerPatchFromExpert,
  filterExperts,
} from "@/features/assistants/expert-apply"
import { useComposerStore } from "@/features/chat/composer-store"
import {
  ALL_ASSISTANT_CATEGORY,
  ASSISTANT_SORT_OPTIONS,
  assistantInitial,
  assistantOpening,
  assistantOpenings,
  filterAssistants,
  formatUsageCount,
} from "@/features/assistants/assistant"
import {
  startAssistantChat,
  useAssistantSearchStore,
  useAssistants,
} from "@/features/assistants/assistant-state"
import { usePrefsStore } from "@/features/shell/prefs-store"
import { SIDEBAR_EDGE_INSET_X_CLASS } from "@/features/shell/sidebar-style"
import { ExpandableText } from "@/features/workspace/expandable-text"
import { avatarFallbackTone } from "@/lib/avatar-tone"
import { useT } from "@/hooks/use-t"
import { apiErrorMessage } from "@/api/http"
import { notifyError } from "@/lib/notify"
import { canEditOwnedResource } from "@/lib/ownership"
import { cn } from "@/lib/utils"
import type {
  AssistantItem,
  AssistantSortType,
  ExpertDetail,
  ExpertItem,
} from "@/lib/types"

export function AssistantsPage() {
  const t = useT()
  const queryClient = useQueryClient()
  const section = useAppLocation().assistantsSection
  const query = useAssistantSearchStore((state) => state.query)
  const createKind = useAssistantSearchStore((state) => state.createKind)
  const closeCreate = useAssistantSearchStore((state) => state.closeCreate)
  const [category, setCategory] = useState(ALL_ASSISTANT_CATEGORY)
  const [sortType, setSortType] = useState<AssistantSortType>("comprehensive")
  const [selected, setSelected] = useState<AssistantItem | null>(null)
  const [selectedExpert, setSelectedExpert] = useState<ExpertItem | null>(null)
  const [editor, setEditor] = useState<AssistantItem | "create" | null>(null)
  const [expertEditor, setExpertEditor] = useState<
    ExpertDetail | "create" | null
  >(null)
  const [applyingExpertId, setApplyingExpertId] = useState<number | null>(null)
  const assistantsQuery = useAssistants(sortType)
  const expertsQuery = useQuery({
    queryKey: queryKeys.experts(),
    queryFn: listExperts,
  })

  useEffect(() => {
    return () => {
      useAssistantSearchStore.getState().setQuery("")
      useAssistantSearchStore.getState().closeCreate()
    }
  }, [])

  const categoriesQuery = useQuery({
    queryKey: queryKeys.assistantCategories(),
    queryFn: listAssistantCategories,
  })

  const assistants = useMemo(
    () => assistantsQuery.data ?? [],
    [assistantsQuery.data]
  )
  const experts = useMemo(() => expertsQuery.data ?? [], [expertsQuery.data])
  const categories = useMemo(
    () => categoriesQuery.data ?? [],
    [categoriesQuery.data]
  )
  const filtered = useMemo(
    () => filterAssistants(assistants, query, category),
    [assistants, category, query]
  )
  const filteredExperts = useMemo(
    () => filterExperts(experts, query),
    [experts, query]
  )
  const hasUncategorized = assistants.some(
    (item) => !(item.category ?? "").trim()
  )
  const categoryChips = useMemo(() => {
    const chips = [
      { code: ALL_ASSISTANT_CATEGORY, name: t("common.all") },
      ...[...categories].sort((left, right) => left.sort - right.sort),
    ]
    if (hasUncategorized) {
      chips.push({ code: "", name: t("common.uncategorized") })
    }
    return chips
  }, [categories, hasUncategorized, t])

  function startChat(assistant: AssistantItem, opening?: string) {
    startAssistantChat(assistant.id, opening || assistantOpening(assistant))
    setSelected(null)
  }

  async function applyExpertTemplate(expert: ExpertDetail, opening?: string) {
    if (applyingExpertId != null) {
      return
    }
    setApplyingExpertId(expert.id)
    try {
      const result = await applyExpert(expert.id)
      const patch = composerPatchFromExpert(result)
      if (patch.assistantId == null) {
        throw new Error(t("common.couldNotCreateTheAssistant"))
      }
      useComposerStore.getState().setMcpIds(patch.mcpIds)
      void queryClient.invalidateQueries({
        queryKey: queryKeys.assistantLists(),
      })
      setSelectedExpert(null)
      startAssistantChat(patch.assistantId, opening || patch.opening)
    } catch (error) {
      notifyError(
        apiErrorMessage(error, t("common.couldNotApplyTheExpertTemplate"))
      )
    } finally {
      setApplyingExpertId(null)
    }
  }

  return (
    <div className="absolute inset-0 flex flex-col overflow-y-auto">
      <div
        className={cn(
          "flex min-h-full w-full flex-1 flex-col gap-6 pt-6 pb-8",
          SIDEBAR_EDGE_INSET_X_CLASS
        )}
      >
        {section === "expert" ? (
          <ExpertsPane
            loading={expertsQuery.isLoading}
            error={expertsQuery.isError}
            errorMessage={apiErrorMessage(
              expertsQuery.error,
              translateCurrent("common.pleaseTryAgainLater")
            )}
            experts={experts}
            filtered={filteredExperts}
            onOpen={(expert) => setSelectedExpert(expert)}
          />
        ) : assistantsQuery.isLoading ? (
          <AssistantsGridSkeleton />
        ) : assistantsQuery.isError ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BotIcon />
              </EmptyMedia>
              <EmptyTitle>
                {t("common.couldNotLoadName", { name: t("common.assistant") })}
              </EmptyTitle>
              <EmptyDescription>
                {apiErrorMessage(
                  assistantsQuery.error,
                  translateCurrent("common.pleaseTryAgainLater")
                )}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {categoryChips.map((chip) => {
                  const selectedChip = category === chip.code
                  return (
                    <Button
                      key={chip.code || "uncategorized"}
                      type="button"
                      size="sm"
                      variant={selectedChip ? "secondary" : "outline"}
                      aria-pressed={selectedChip}
                      onClick={() => setCategory(chip.code)}
                    >
                      {chip.name}
                    </Button>
                  )
                })}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Tabs
                  value={sortType}
                  onValueChange={(value) => {
                    if (
                      value === "comprehensive" ||
                      value === "hottest" ||
                      value === "newest"
                    ) {
                      setSortType(value)
                    }
                  }}
                >
                  <TabsList>
                    {ASSISTANT_SORT_OPTIONS.map((option) => (
                      <TabsTrigger key={option.value} value={option.value}>
                        {t(option.label)}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </div>
            </div>

            {filtered.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <BotIcon />
                  </EmptyMedia>
                  <EmptyTitle>
                    {assistants.length === 0
                      ? t("common.noAssistants")
                      : t("common.noMatchingAssistants")}
                  </EmptyTitle>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((item) => (
                  <AssistantCard
                    key={item.id}
                    assistant={item}
                    onOpen={() => setSelected(item)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <AssistantDialog
        assistant={selected}
        onClose={() => setSelected(null)}
        onStart={startChat}
        onEdit={(item) => {
          setSelected(null)
          setEditor(item)
        }}
      />
      {selectedExpert ? (
        <ExpertDialog
          key={selectedExpert.id}
          expert={selectedExpert}
          applying={
            selectedExpert != null && applyingExpertId === selectedExpert.id
          }
          onClose={() => setSelectedExpert(null)}
          onApply={(item, opening) => void applyExpertTemplate(item, opening)}
          onEdit={(item) => {
            setSelectedExpert(null)
            setExpertEditor(item)
          }}
        />
      ) : null}
      <AssistantEditorDialog
        open={editor != null || createKind === "assistant"}
        assistant={
          createKind === "assistant" || editor === "create" ? null : editor
        }
        categories={categories}
        onOpenChange={(open) => {
          if (!open) {
            setEditor(null)
            closeCreate()
          }
        }}
      />
      <ExpertEditorDialog
        open={expertEditor != null || createKind === "expert"}
        expert={
          createKind === "expert" || expertEditor === "create"
            ? null
            : expertEditor
        }
        onOpenChange={(open) => {
          if (!open) {
            setExpertEditor(null)
            closeCreate()
          }
        }}
      />
    </div>
  )
}

function AssistantsGridSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-7 w-16 rounded-md" />
        <Skeleton className="h-7 w-20 rounded-md" />
        <Skeleton className="h-7 w-24 rounded-md" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    </div>
  )
}

function ExpertsPane({
  loading,
  error,
  errorMessage,
  experts,
  filtered,
  onOpen,
}: {
  loading: boolean
  error: boolean
  errorMessage: string
  experts: ExpertItem[]
  filtered: ExpertItem[]
  onOpen: (expert: ExpertItem) => void
}) {
  const t = useT()

  if (loading) {
    return <AssistantsGridSkeleton />
  }
  if (error) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SparklesIcon />
          </EmptyMedia>
          <EmptyTitle>
            {t("common.couldNotLoadName", { name: t("common.experts") })}
          </EmptyTitle>
          <EmptyDescription>{errorMessage}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }
  if (filtered.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SparklesIcon />
          </EmptyMedia>
          <EmptyTitle>
            {experts.length === 0
              ? t("common.noExperts")
              : t("common.noMatchingExperts")}
          </EmptyTitle>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {filtered.map((expert) => (
        <ExpertCard
          key={expert.id}
          expert={expert}
          onOpen={() => onOpen(expert)}
        />
      ))}
    </div>
  )
}

function AssistantDialog({
  assistant,
  onClose,
  onStart,
  onEdit,
}: {
  assistant: AssistantItem | null
  onClose: () => void
  onStart: (assistant: AssistantItem, opening?: string) => void
  onEdit: (assistant: AssistantItem) => void
}) {
  const t = useT()
  const locale = usePrefsStore((state) => state.locale)
  const openings = assistant ? assistantOpenings(assistant) : []

  return (
    <Dialog
      open={assistant != null}
      onOpenChange={(open) => {
        if (!open) {
          onClose()
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        overlayClassName="bg-black/50 supports-backdrop-filter:backdrop-blur-sm"
        className="gap-6 overflow-y-auto rounded-3xl p-6 sm:max-w-xl"
      >
        {assistant ? (
          <>
            <DialogHeader className="gap-4">
              <div className="flex items-start gap-4">
                <AssistantAvatar assistant={assistant} className="size-16" />
                <div className="flex min-w-0 flex-1 flex-col gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <DialogTitle className="min-w-0 flex-1 truncate text-lg font-semibold">
                      {assistant.name}
                    </DialogTitle>
                    <p className="shrink-0 text-sm text-muted-foreground">
                      {formatUsageCount(assistant.usage_count, locale)}
                    </p>
                    <DialogClose
                      render={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="shrink-0"
                        />
                      }
                    >
                      <XIcon />
                      <span className="sr-only">{t("common.close")}</span>
                    </DialogClose>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="lg"
                      className="w-fit"
                      onClick={() => onStart(assistant)}
                    >
                      <Wand2Icon data-icon="inline-start" />
                      {t("common.summonAssistant")}
                    </Button>
                    {canEditOwnedResource(assistant.user_id) ? (
                      <Button
                        type="button"
                        size="lg"
                        variant="outline"
                        className="w-fit"
                        onClick={() => onEdit(assistant)}
                      >
                        <PencilIcon data-icon="inline-start" />
                        {t("common.edit")}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
              <DialogDescription className="sr-only">
                {assistant.description || t("common.noDescription")}
              </DialogDescription>
              <ExpandableText
                key={assistant.id}
                text={assistant.description ?? ""}
                emptyLabel={t("common.noDescription")}
              />
            </DialogHeader>
            {openings.length > 0 ? (
              <div className="flex flex-col gap-3">
                <p className="flex items-center gap-2 text-sm font-medium text-foreground [&_svg]:size-4 [&_svg]:text-muted-foreground">
                  <QuoteIcon />
                  {t("common.letTheAssistantHelp")}
                </p>
                <div className="flex flex-col gap-2">
                  {openings.map((opening) => (
                    <Button
                      key={opening}
                      type="button"
                      variant="ghost"
                      className="h-auto w-full justify-between bg-foreground/4 px-4 py-3 text-left font-normal whitespace-normal hover:!bg-foreground/8 hover:text-foreground has-data-[icon=inline-end]:pr-4"
                      onClick={() => onStart(assistant, opening)}
                    >
                      <span className="min-w-0 flex-1">{`“${opening}”`}</span>
                      <MessageSquareQuoteIcon data-icon="inline-end" />
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function AssistantCard({
  assistant,
  onOpen,
}: {
  assistant: AssistantItem
  onOpen: () => void
}) {
  const t = useT()
  return (
    <Card
      size="sm"
      role="button"
      tabIndex={0}
      className={cn(
        "cursor-pointer py-4 text-left transition-colors hover:bg-muted/40"
      )}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onOpen()
        }
      }}
    >
      <CardHeader className="gap-3">
        <div className="flex items-start gap-3">
          <AssistantAvatar assistant={assistant} className="size-8" />
          <div className="min-w-0 flex-1">
            <CardTitle className="flex items-center gap-2 truncate text-base">
              <span className="min-w-0 truncate">{assistant.name}</span>
              {canEditOwnedResource(assistant.user_id) ? null : (
                <Badge variant="outline">{t("common.builtIn")}</Badge>
              )}
            </CardTitle>
            {assistant.description ? (
              <CardDescription className="mt-1 line-clamp-2 leading-5">
                {assistant.description}
              </CardDescription>
            ) : null}
          </div>
        </div>
      </CardHeader>
    </Card>
  )
}

function AssistantAvatar({
  assistant,
  className,
}: {
  assistant: AssistantItem
  className?: string
}) {
  return (
    <Avatar className={className}>
      <AvatarFallback className={avatarFallbackTone(assistant.id)}>
        {assistantInitial(assistant)}
      </AvatarFallback>
    </Avatar>
  )
}

function ExpertCard({
  expert,
  onOpen,
}: {
  expert: ExpertItem
  onOpen: () => void
}) {
  const t = useT()
  return (
    <Card
      size="sm"
      role="button"
      tabIndex={0}
      className={cn(
        "cursor-pointer py-4 text-left transition-colors hover:bg-muted/40"
      )}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onOpen()
        }
      }}
    >
      <CardHeader className="gap-3">
        <div className="flex items-start gap-3">
          <ExpertAvatar expert={expert} className="size-8" />
          <div className="min-w-0 flex-1">
            <CardTitle className="flex items-center gap-2 truncate text-base">
              <span className="min-w-0 truncate">{expert.name}</span>
              {canEditOwnedResource(expert.user_id) ? null : (
                <Badge variant="outline">{t("common.builtIn")}</Badge>
              )}
            </CardTitle>
            {expert.description ? (
              <CardDescription className="mt-1 line-clamp-2 leading-5">
                {expert.description}
              </CardDescription>
            ) : null}
          </div>
        </div>
      </CardHeader>
    </Card>
  )
}
