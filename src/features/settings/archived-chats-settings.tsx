import { translateCurrent } from "@/lib/i18n"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  FolderIcon,
  ListFilterIcon,
  MoreHorizontalIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react"
import { useMemo, useState } from "react"

import {
  archiveConversation,
  deleteConversation,
  listAssistants,
  listConversations,
  listProjects,
} from "@/api"
import { apiErrorMessage } from "@/api/http"
import { queryKeys } from "@/api/query-keys"
import { openConversation, startDraftChat } from "@/app/navigation"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  SettingsSelect,
  SettingsSelectContent,
  SettingsSelectGroup,
  SettingsSelectItem,
  SettingsSelectTrigger,
  SettingsSelectValue,
} from "@/features/settings/settings-select"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/components/ui/toast"
import {
  conversationMatchesArchivedFilters,
  groupArchivedConversations,
  parseArchivedAssistantFilter,
  parseArchivedProjectFilter,
  type ArchivedAssistantFilter,
  type ArchivedChatGroup,
  type ArchivedProjectFilter,
} from "@/features/settings/archived-chats"
import { SettingsPageHeader } from "@/features/settings/settings-card"
import { removeConversationFromCaches } from "@/features/shell/conversation-cache"
import { usePrefsStore } from "@/features/shell/prefs-store"
import { useSelectionStore } from "@/features/shell/selection-store"
import { formatWorkspaceTime } from "@/features/workspace/workspace-records"
import { useT } from "@/hooks/use-t"
import { conversationAssistantId } from "@/lib/conversation-workspace"
import type { TranslationKey } from "@/lib/i18n"
import type { ConversationListItem } from "@/lib/types"

type PendingDelete = {
  title: string
  description: string
  ids: string[]
  successMessage: TranslationKey
}

async function listAllArchivedConversations() {
  const items: ConversationListItem[] = []
  let cursor: string | undefined
  for (;;) {
    const page = await listConversations({
      archived: true,
      size: 100,
      cursor,
    })
    items.push(...(page.items ?? []))
    if (!page.has_more || !page.next_cursor) {
      break
    }
    cursor = page.next_cursor
  }
  return items
}

export function ArchivedChatsSettings() {
  const t = useT()
  const locale = usePrefsStore((state) => state.locale)
  const queryClient = useQueryClient()
  const [query, setQuery] = useState("")
  const [projectFilter, setProjectFilter] =
    useState<ArchivedProjectFilter>("all")
  const [assistantFilter, setAssistantFilter] =
    useState<ArchivedAssistantFilter>("all")
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)

  const conversationsQuery = useQuery({
    queryKey: [...queryKeys.conversations(), "archived"],
    queryFn: listAllArchivedConversations,
  })
  const projectsQuery = useQuery({
    queryKey: queryKeys.projects(),
    queryFn: listProjects,
  })
  const assistantsQuery = useQuery({
    queryKey: queryKeys.assistants(),
    queryFn: () => listAssistants(),
  })

  const conversations = useMemo(
    () => conversationsQuery.data ?? [],
    [conversationsQuery.data]
  )
  const projects = useMemo(() => projectsQuery.data ?? [], [projectsQuery.data])
  const assistants = useMemo(
    () => assistantsQuery.data ?? [],
    [assistantsQuery.data]
  )

  const filtered = useMemo(
    () =>
      conversations.filter((item) =>
        conversationMatchesArchivedFilters(item, {
          query,
          projectFilter,
          assistantFilter,
        })
      ),
    [assistantFilter, conversations, projectFilter, query]
  )
  const groups = useMemo(
    () => groupArchivedConversations(filtered, projects),
    [filtered, projects]
  )

  const assistantItems = useMemo(() => {
    const ids = [
      ...new Set(
        conversations
          .map((item) => conversationAssistantId(item))
          .filter((id): id is number => id != null)
      ),
    ]
    return [
      { value: "all", label: t("common.allChats") },
      ...ids.map((id) => ({
        value: String(id),
        label:
          assistants.find((assistant) => assistant.id === id)?.name ??
          t("common.assistant"),
      })),
    ]
  }, [assistants, conversations, t])

  const projectItems = useMemo(
    () => [
      { value: "all", label: t("common.allProjects") },
      { value: "none", label: t("common.noProject") },
      ...projects.map((project) => ({
        value: String(project.id),
        label: project.name,
      })),
    ],
    [projects, t]
  )

  async function refresh() {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.conversations(),
    })
  }

  const unarchiveMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const results = await Promise.allSettled(
        ids.map((id) => archiveConversation(id, false))
      )
      const failed = results.find((result) => result.status === "rejected")
      if (failed && failed.status === "rejected") {
        throw failed.reason
      }
    },
    onSuccess: (_, ids) => {
      for (const id of ids) {
        removeConversationFromCaches(queryClient, id)
      }
      toast.add({
        title: t(
          ids.length === 1 ? "common.chatRestored" : "common.chatsRestored",
          { count: ids.length }
        ),
        type: "success",
      })
    },
    onSettled: () => void refresh(),
  })

  const deleteMutation = useMutation({
    mutationFn: async ({ ids }: PendingDelete) => {
      const results = await Promise.allSettled(
        ids.map(async (id) => {
          await deleteConversation(id)
          if (useSelectionStore.getState().selectedConversationId === id) {
            startDraftChat()
          }
        })
      )
      const failed = results.find((result) => result.status === "rejected")
      if (failed && failed.status === "rejected") {
        throw failed.reason
      }
    },
    onSuccess: (_, { ids, successMessage }) => {
      toast.add({
        title: t(successMessage, { count: ids.length }),
        type: "success",
      })
    },
    onSettled: () => void refresh(),
  })

  const busy = unarchiveMutation.isPending || deleteMutation.isPending
  const hasChats = conversations.length > 0

  return (
    <div className="flex min-h-full flex-1 flex-col gap-8">
      <SettingsPageHeader
        title={t("common.archivedChats")}
        action={
          <Button
            type="button"
            variant="destructive"
            disabled={!hasChats || busy}
            onClick={() =>
              setPendingDelete({
                title: t("common.deleteAll"),
                description: t(
                  "hints.thisPermanentlyDeletesEveryArchivedChatAndCannotBeUndone"
                ),
                ids: conversations.map((item) => item.conversation_id),
                successMessage: "common.allArchivedChatsDeleted",
              })
            }
          >
            <Trash2Icon data-icon="inline-start" />
            {t("common.deleteAll")}
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <InputGroup className="h-9 min-w-48 flex-1 rounded-full">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("common.searchArchivedChats")}
            aria-label={t("common.searchArchivedChats")}
          />
        </InputGroup>
        <SettingsSelect
          items={assistantItems}
          value={assistantFilter === "all" ? "all" : String(assistantFilter)}
          onValueChange={(value) => {
            if (value != null) {
              setAssistantFilter(parseArchivedAssistantFilter(value))
            }
          }}
        >
          <SettingsSelectTrigger
            id="archived-assistant-filter"
            aria-label={t("common.assistant")}
          >
            <ListFilterIcon />
            <SettingsSelectValue />
          </SettingsSelectTrigger>
          <SettingsSelectContent>
            <SettingsSelectGroup>
              {assistantItems.map((item) => (
                <SettingsSelectItem key={item.value} value={item.value}>
                  {item.label}
                </SettingsSelectItem>
              ))}
            </SettingsSelectGroup>
          </SettingsSelectContent>
        </SettingsSelect>
        <SettingsSelect
          items={projectItems}
          value={
            projectFilter === "all" || projectFilter === "none"
              ? projectFilter
              : String(projectFilter)
          }
          onValueChange={(value) => {
            if (value != null) {
              setProjectFilter(parseArchivedProjectFilter(value))
            }
          }}
        >
          <SettingsSelectTrigger
            id="archived-project-filter"
            aria-label={t("common.projects")}
          >
            <FolderIcon />
            <SettingsSelectValue />
          </SettingsSelectTrigger>
          <SettingsSelectContent>
            <SettingsSelectGroup>
              {projectItems.map((item) => (
                <SettingsSelectItem key={item.value} value={item.value}>
                  {item.label}
                </SettingsSelectItem>
              ))}
            </SettingsSelectGroup>
          </SettingsSelectContent>
        </SettingsSelect>
      </div>

      {conversationsQuery.isLoading ? (
        <div className="flex flex-col gap-6">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      ) : conversationsQuery.isError ? (
        <Empty className="flex-1">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ArchiveIcon />
            </EmptyMedia>
            <EmptyTitle>
              {apiErrorMessage(
                conversationsQuery.error,
                translateCurrent("common.pleaseTryAgainLater")
              )}
            </EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : groups.length === 0 ? (
        <Empty className="flex-1">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ArchiveIcon />
            </EmptyMedia>
            <EmptyTitle>{t("common.noArchivedChats")}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-8">
          {groups.map((group) => (
            <ArchivedChatGroupCard
              key={group.projectId ?? "none"}
              group={group}
              locale={locale}
              busy={busy}
              onOpen={openConversation}
              onUnarchive={(id) => unarchiveMutation.mutate([id])}
              onDeleteOne={(item) =>
                setPendingDelete({
                  title: t("common.deleteChat"),
                  description: t(
                    "hints.thisCannotBeUndoneMessagesInThisChatWillAlsoBeDeleted"
                  ),
                  ids: [item.conversation_id],
                  successMessage: "common.archivedChatDeleted",
                })
              }
              onUnarchiveGroup={() =>
                unarchiveMutation.mutate(
                  group.items.map((item) => item.conversation_id)
                )
              }
              onDeleteGroup={() =>
                setPendingDelete({
                  title: t("common.deleteGroup"),
                  description: t(
                    "hints.thisCannotBeUndoneMessagesInThisChatWillAlsoBeDeleted"
                  ),
                  ids: group.items.map((item) => item.conversation_id),
                  successMessage:
                    group.items.length === 1
                      ? "common.archivedChatDeleted"
                      : "common.archivedChatsDeleted",
                })
              }
            />
          ))}
        </div>
      )}

      <AlertDialog
        open={pendingDelete != null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDelete(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingDelete?.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (pendingDelete) {
                  deleteMutation.mutate(pendingDelete)
                }
                setPendingDelete(null)
              }}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function ArchivedChatGroupCard({
  group,
  locale,
  busy,
  onOpen,
  onUnarchive,
  onDeleteOne,
  onUnarchiveGroup,
  onDeleteGroup,
}: {
  group: ArchivedChatGroup
  locale: string
  busy: boolean
  onOpen: (id: string) => void
  onUnarchive: (id: string) => void
  onDeleteOne: (item: ConversationListItem) => void
  onUnarchiveGroup: () => void
  onDeleteGroup: () => void
}) {
  const t = useT()
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2 px-1">
        <FolderIcon className="size-4 text-muted-foreground" />
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium">
          {group.projectId == null ? t("common.noProject") : group.name}
        </h2>
        <span className="text-xs text-muted-foreground">
          {t("common.countChats", { count: group.items.length })}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground"
                aria-label={t("common.more")}
              />
            }
          >
            <MoreHorizontalIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-36">
            <DropdownMenuGroup>
              <DropdownMenuItem disabled={busy} onClick={onUnarchiveGroup}>
                <ArchiveRestoreIcon />
                {t("common.unarchiveGroup")}
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                disabled={busy}
                onClick={() => {
                  queueMicrotask(onDeleteGroup)
                }}
              >
                <Trash2Icon />
                {t("common.deleteGroup")}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Card size="sm" className="gap-0 overflow-hidden rounded-2xl py-0">
        <CardContent className="divide-y p-0">
          {group.items.map((item) => (
            <div
              key={item.conversation_id}
              className="flex items-center gap-3 px-4 py-3"
            >
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left"
                onClick={() => onOpen(item.conversation_id)}
              >
                <span className="block truncate text-sm font-medium">
                  {item.title}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {formatWorkspaceTime(
                    item.last_message_time ||
                      item.updated_time ||
                      item.created_time,
                    locale
                  )}
                </span>
              </button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                disabled={busy}
                aria-label={t("common.delete")}
                onClick={() => onDeleteOne(item)}
              >
                <Trash2Icon />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => onUnarchive(item.conversation_id)}
              >
                {t("common.unarchive")}
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  )
}
