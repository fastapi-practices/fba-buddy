import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  CircleDotIcon,
  ClockIcon,
  CopyIcon,
  EraserIcon,
  FolderIcon,
  FolderInputIcon,
  InboxIcon,
  LoaderCircleIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon,
  Trash2Icon,
  type LucideIcon,
} from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { useState, type ReactElement, type ReactNode } from "react"

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
import { toast } from "@/components/ui/toast"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { TooltipHint } from "@/components/ui/tooltip"
import {
  archiveConversation,
  clearConversationMessages,
  deleteConversation,
  forkConversation,
  patchConversationWorkspace,
  pinConversation,
  renameConversation,
} from "@/api"
import {
  conversationPreviewProjectName,
  conversationPreviewText,
  conversationPreviewTime,
} from "@/features/shell/conversation-preview"
import { usePrefsStore } from "@/features/shell/prefs-store"
import { useSelectionStore } from "@/features/shell/selection-store"
import {
  useConversationActivityStore,
  useConversationGenerating,
} from "@/features/chat/conversation-activity"
import { ArchiveConversationDialog } from "@/features/shell/archive-conversation-dialog"
import { ClearMessagesDialog } from "@/features/shell/clear-messages-dialog"
import { removeConversationFromCaches } from "@/features/shell/conversation-cache"
import { RenameDialog } from "@/features/shell/sidebar-rename-dialog"
import {
  SIDEBAR_TRAILING_ICON_CLASS,
  SIDEBAR_TRAILING_SLOT_CLASS,
} from "@/features/shell/sidebar-style"
import { formatWorkspaceTime } from "@/features/workspace/workspace-records"
import { useIsMobile } from "@/hooks/use-mobile"
import { useT } from "@/hooks/use-t"
import { cn } from "@/lib/utils"
import type { ConversationListItem, ProjectItem } from "@/lib/types"

export function ConversationItems({
  items,
  selectedId,
  openIds,
  projects,
  nested = false,
  onSelect,
  onClear,
  onRefresh,
}: {
  items: ConversationListItem[]
  selectedId: string | null
  /* 主栏与侧栏打开的会话：主高亮给选中栏，另一栏弱高亮 */
  openIds?: readonly (string | null)[]
  projects: ProjectItem[]
  nested?: boolean
  onSelect: (id: string) => void
  onClear: () => void
  onRefresh: () => void
}) {
  if (items.length === 0) {
    return null
  }

  return (
    <>
      {items.map((item) => (
        <ConversationRow
          key={item.conversation_id}
          item={item}
          active={selectedId === item.conversation_id}
          open={openIds?.includes(item.conversation_id) ?? false}
          projects={projects}
          nested={nested}
          onSelect={onSelect}
          onClear={onClear}
          onRefresh={onRefresh}
        />
      ))}
    </>
  )
}

function ConversationRow({
  item,
  active,
  open,
  projects,
  nested,
  onSelect,
  onClear,
  onRefresh,
}: {
  item: ConversationListItem
  active: boolean
  open: boolean
  projects: ProjectItem[]
  nested: boolean
  onSelect: (id: string) => void
  onClear: () => void
  onRefresh: () => void
}) {
  const unread = useConversationUnread(item.conversation_id)
  const generating = useConversationGenerating(
    item.conversation_id,
    item.is_generating
  )
  return (
    <SidebarMenuItem className="group/conversation">
      <ConversationContextMenu
        item={item}
        active={active}
        projects={projects}
        onSelect={onSelect}
        onClear={onClear}
        onRefresh={onRefresh}
      >
        <ConversationHoverCard
          item={item}
          projects={projects}
          unread={unread}
          generating={generating}
        >
          <SidebarMenuButton
            isActive={active}
            /* 另一对话栏打开的会话弱高亮，选中栏的走 isActive 主高亮 */
            className={cn(
              "pr-16",
              open &&
                !active &&
                "bg-sidebar-accent/60 text-sidebar-accent-foreground"
            )}
            onClick={() => onSelect(item.conversation_id)}
          >
            {nested ? <span className="size-4 shrink-0" aria-hidden /> : null}
            <span>{item.title}</span>
          </SidebarMenuButton>
        </ConversationHoverCard>
        <ConversationIdleIndicator unread={unread} generating={generating} />
        <ConversationHoverActions item={item} onRefresh={onRefresh} />
      </ConversationContextMenu>
    </SidebarMenuItem>
  )
}

function useConversationUnread(conversationId: string) {
  return useSelectionStore((state) =>
    state.unreadConversationIds.includes(conversationId)
  )
}

function ConversationHoverCard({
  item,
  projects,
  unread,
  generating,
  children,
}: {
  item: ConversationListItem
  projects: ProjectItem[]
  unread: boolean
  generating: boolean
  children: ReactElement
}) {
  const t = useT()
  const isMobile = useIsMobile()
  const locale = usePrefsStore((state) => state.locale)
  const preview = conversationPreviewText(item)
  const time = formatWorkspaceTime(conversationPreviewTime(item), locale)
  const projectName = conversationPreviewProjectName(item, projects)
  const flags = [
    unread ? { icon: CircleDotIcon, label: t("common.unread") } : null,
    generating
      ? { icon: LoaderCircleIcon, label: t("common.generating") }
      : null,
    item.is_archived ? { icon: ArchiveIcon, label: t("common.archive") } : null,
  ].filter((flag): flag is { icon: LucideIcon; label: string } => flag != null)

  if (isMobile) {
    return children
  }

  return (
    <HoverCard>
      <HoverCardTrigger delay={300} closeDelay={180} render={children} />
      <HoverCardContent
        side="right"
        align="start"
        sideOffset={8}
        collisionAvoidance={{ fallbackAxisSide: "none" }}
        className="w-64 items-stretch gap-2 p-3 text-left"
      >
        <p className="line-clamp-2 text-left font-medium">{item.title}</p>
        {preview ? (
          <p className="line-clamp-3 text-left text-xs break-words text-muted-foreground">
            {preview}
          </p>
        ) : null}
        {projectName || time || flags.length > 0 ? (
          <div className="grid gap-1.5 text-left text-muted-foreground">
            {projectName ? (
              <PreviewMetaRow
                icon={FolderIcon}
                label={t("common.projects")}
                value={projectName}
              />
            ) : null}
            {time ? (
              <PreviewMetaRow
                icon={ClockIcon}
                label={t("common.updated")}
                value={time}
              />
            ) : null}
            {flags.map((flag) => (
              <PreviewMetaRow
                key={flag.label}
                icon={flag.icon}
                label={flag.label}
              />
            ))}
          </div>
        ) : null}
      </HoverCardContent>
    </HoverCard>
  )
}

function PreviewMetaRow({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon
  label: string
  value?: string
}) {
  return (
    <div className="flex items-start gap-2 text-left">
      <Icon className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0 break-words">
        {value ? `${label} ${value}` : label}
      </span>
    </div>
  )
}

const CONVERSATION_IDLE_INDICATOR_CLASS =
  "group-hover/conversation:hidden group-focus-within/conversation:hidden"

function ConversationIdleIndicator({
  unread,
  generating,
}: {
  unread: boolean
  generating: boolean
}) {
  const t = useT()
  if (!unread && !generating) {
    return null
  }
  return (
    <span
      className={cn(
        SIDEBAR_TRAILING_SLOT_CLASS,
        CONVERSATION_IDLE_INDICATOR_CLASS
      )}
    >
      {generating ? (
        <span className={SIDEBAR_TRAILING_ICON_CLASS}>
          <LoaderCircleIcon
            className="animate-spin"
            aria-label={t("common.generating")}
          />
        </span>
      ) : null}
      {unread ? (
        <span className={SIDEBAR_TRAILING_ICON_CLASS}>
          <span
            className="size-1.5 rounded-full bg-chart-2"
            aria-label={t("common.unread")}
          />
        </span>
      ) : null}
    </span>
  )
}

const CONVERSATION_HOVER_ACTIONS_CLASS =
  "pointer-events-none hidden items-center group-hover/conversation:flex group-focus-within/conversation:flex"

function ConversationHoverActions({
  item,
  onRefresh,
}: {
  item: ConversationListItem
  onRefresh: () => void
}) {
  const t = useT()
  const queryClient = useQueryClient()
  const generating = useConversationGenerating(
    item.conversation_id,
    item.is_generating
  )
  const [archiveOpen, setArchiveOpen] = useState(false)
  const archiveLabel = item.is_archived
    ? t("common.unarchive")
    : t("common.archive")
  const pinLabel = item.is_pinned ? t("common.unpin") : t("common.pin")

  return (
    <>
      <div
        className={cn(
          "absolute inset-y-0 right-2 z-10",
          CONVERSATION_HOVER_ACTIONS_CLASS
        )}
      >
        <TooltipHint label={archiveLabel} side="top">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={SIDEBAR_TRAILING_ICON_CLASS}
            aria-label={archiveLabel}
            onClick={() => {
              if (item.is_archived) {
                void archiveConversation(item.conversation_id, false)
                  .then(() => {
                    removeConversationFromCaches(
                      queryClient,
                      item.conversation_id
                    )
                    onRefresh()
                    toast.add({
                      title: t("common.chatRestored"),
                      type: "success",
                    })
                  })
                  .catch(() => {})
                return
              }
              setArchiveOpen(true)
            }}
          >
            <ArchiveIcon />
          </Button>
        </TooltipHint>
        <TooltipHint label={pinLabel} side="top">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={SIDEBAR_TRAILING_ICON_CLASS}
            aria-label={pinLabel}
            onClick={() =>
              void pinConversation(item.conversation_id, !item.is_pinned).then(
                onRefresh
              )
            }
          >
            <PinIcon />
          </Button>
        </TooltipHint>
      </div>
      <ArchiveConversationDialog
        open={archiveOpen}
        generating={generating}
        onOpenChange={setArchiveOpen}
        onConfirm={() =>
          void archiveConversation(item.conversation_id, true)
            .then(() => {
              removeConversationFromCaches(queryClient, item.conversation_id)
              onRefresh()
              toast.add({ title: t("common.chatArchived"), type: "success" })
            })
            .catch(() => {})
        }
      />
    </>
  )
}

function ConversationContextMenu({
  item,
  active,
  projects,
  onSelect,
  onClear,
  onRefresh,
  children,
}: {
  item: ConversationListItem
  active: boolean
  projects: ProjectItem[]
  onSelect: (id: string) => void
  onClear: () => void
  onRefresh: () => void
  children: ReactNode
}) {
  const t = useT()
  const queryClient = useQueryClient()
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [clearOpen, setClearOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const generating = useConversationGenerating(
    item.conversation_id,
    item.is_generating
  )
  const canClear =
    !generating && Boolean(item.last_message_preview || item.last_message_time)
  const archiveLabel = item.is_archived
    ? t("common.unarchive")
    : t("common.archive")
  const pinLabel = item.is_pinned ? t("common.unpin") : t("common.pin")

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger className="relative block w-full">
          {children}
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuGroup>
            <ContextMenuItem onClick={() => setRenameOpen(true)}>
              <PencilIcon />
              {t("common.rename")}
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() =>
                void forkConversation(item.conversation_id).then(
                  (conversationId) => {
                    onSelect(conversationId)
                    onRefresh()
                  }
                )
              }
            >
              <CopyIcon />
              {t("common.forkChat")}
            </ContextMenuItem>
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <FolderInputIcon />
                {t("common.moveToProject")}
              </ContextMenuSubTrigger>
              <ContextMenuSubContent>
                <ContextMenuGroup>
                  <ContextMenuItem
                    onClick={() =>
                      void patchConversationWorkspace(item.conversation_id, {
                        project_id: null,
                      }).then(onRefresh)
                    }
                  >
                    <InboxIcon />
                    {t("common.recent")}
                  </ContextMenuItem>
                  {projects.map((project) => (
                    <ContextMenuItem
                      key={project.id}
                      onClick={() =>
                        void patchConversationWorkspace(item.conversation_id, {
                          project_id: project.id,
                        }).then(onRefresh)
                      }
                    >
                      <FolderIcon />
                      {project.name}
                    </ContextMenuItem>
                  ))}
                </ContextMenuGroup>
              </ContextMenuSubContent>
            </ContextMenuSub>
            <ContextMenuItem
              onClick={() =>
                void pinConversation(
                  item.conversation_id,
                  !item.is_pinned
                ).then(onRefresh)
              }
            >
              {item.is_pinned ? <PinOffIcon /> : <PinIcon />}
              {pinLabel}
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => {
                if (item.is_archived) {
                  void archiveConversation(item.conversation_id, false)
                    .then(() => {
                      removeConversationFromCaches(
                        queryClient,
                        item.conversation_id
                      )
                      onRefresh()
                      toast.add({
                        title: t("common.chatRestored"),
                        type: "success",
                      })
                    })
                    .catch(() => {})
                  return
                }
                setArchiveOpen(true)
              }}
            >
              {item.is_archived ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
              {archiveLabel}
            </ContextMenuItem>
          </ContextMenuGroup>
          <ContextMenuSeparator />
          <ContextMenuGroup>
            <ContextMenuItem
              disabled={!canClear}
              onClick={() => setClearOpen(true)}
            >
              <EraserIcon />
              {t("common.clearMessages")}
            </ContextMenuItem>
            <ContextMenuItem
              variant="destructive"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2Icon />
              {t("common.delete")}
            </ContextMenuItem>
          </ContextMenuGroup>
        </ContextMenuContent>
      </ContextMenu>
      <RenameDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        title={t("common.renameChat")}
        value={item.title}
        onSubmit={(next) =>
          renameConversation(item.conversation_id, next).then(onRefresh)
        }
      />
      <ArchiveConversationDialog
        open={archiveOpen}
        generating={generating}
        onOpenChange={setArchiveOpen}
        onConfirm={() =>
          void archiveConversation(item.conversation_id, true)
            .then(() => {
              removeConversationFromCaches(queryClient, item.conversation_id)
              onRefresh()
              toast.add({ title: t("common.chatArchived"), type: "success" })
            })
            .catch(() => {})
        }
      />
      <ClearMessagesDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        onConfirm={() =>
          void clearConversationMessages(item.conversation_id)
            .then(() => {
              useConversationActivityStore
                .getState()
                .bumpMessages(item.conversation_id)
              useSelectionStore
                .getState()
                .markConversationRead(item.conversation_id)
              onRefresh()
              toast.add({ title: t("common.messagesCleared"), type: "success" })
            })
            .catch(() => {})
        }
      />
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("common.deleteChat")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("hints.thisCannotBeUndoneMessagesInThisChatWillAlsoBeDeleted")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                void deleteConversation(item.conversation_id)
                  .then(() => {
                    if (active) {
                      onClear()
                    }
                    useSelectionStore
                      .getState()
                      .markConversationRead(item.conversation_id)
                    onRefresh()
                    toast.add({
                      title: t(
                        item.is_archived
                          ? "common.archivedChatDeleted"
                          : "common.chatDeleted"
                      ),
                      type: "success",
                    })
                  })
                  .catch(() => {})
              }
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
