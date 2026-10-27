import { useEffect, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { ApiError, isAbortError } from "@/api/http"
import {
  CopyIcon,
  FolderIcon,
  FolderOpenIcon,
  MessageCirclePlusIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon,
  Trash2Icon,
} from "lucide-react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
} from "@/components/ui/sidebar"
import { TooltipHint } from "@/components/ui/tooltip"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { ConversationItems } from "@/features/shell/sidebar-conversations"
import { RenameDialog } from "@/features/shell/sidebar-rename-dialog"
import { ProjectDirectoryDialog } from "@/features/shell/project-directory-dialog"
import { RemoveProjectDialog } from "@/features/shell/remove-project-dialog"
import { dataSourceKey, useAccountSourceStore } from "@/lib/account-source"
import {
  copyProjectDirectoryPath,
  getProjectDirectory,
  openProjectDirectory,
} from "@/lib/project-workspace"
import {
  SIDEBAR_TRAILING_HOVER_ICON_CLASS,
  SIDEBAR_TRAILING_ICON_CLASS,
  SIDEBAR_TRAILING_SLOT_CLASS,
} from "@/features/shell/sidebar-style"
import { useT } from "@/hooks/use-t"
import { cn } from "@/lib/utils"
import type { ConversationListItem, ProjectItem } from "@/lib/types"

export function ProjectGroupRow({
  project,
  items,
  expanded,
  selectedId,
  openIds,
  projects,
  onToggle,
  onTogglePinned,
  onNewConversation,
  onRename,
  onDelete,
  onSelect,
  onClear,
  onRefresh,
}: {
  project: ProjectItem
  items: ConversationListItem[]
  expanded: boolean
  selectedId: string | null
  /* 主栏与侧栏打开的会话：主高亮给选中栏，另一栏弱高亮 */
  openIds?: readonly (string | null)[]
  projects: ProjectItem[]
  onToggle: () => void
  onTogglePinned: () => Promise<void>
  onNewConversation: () => void
  onRename: (name: string) => Promise<void>
  onDelete: () => Promise<void>
  onSelect: (id: string) => void
  onClear: () => void
  onRefresh: () => void
}) {
  const t = useT()
  const [renameOpen, setRenameOpen] = useState(false)
  const [directoryOpen, setDirectoryOpen] = useState(false)
  const [removalEpoch, setRemovalEpoch] = useState<number | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [pendingSource, setPendingSource] = useState<string | null>(null)
  const active = useRef(true)
  const lock = useRef<string | null>(null)
  const source = useAccountSourceStore(dataSourceKey)
  const ready = useAccountSourceStore((state) => state.ready)
  const sourceEpoch = useAccountSourceStore((state) => state.epoch)
  const removalOpen = removalEpoch === sourceEpoch
  const directoryQueryKey = ["project-directory", source, project.id] as const
  const directory = useQuery({
    queryKey: directoryQueryKey,
    queryFn: () => getProjectDirectory(project.id),
    enabled: menuOpen && ready,
  })
  const pending = pendingSource === source
  const reportedDirectoryError = useRef<Error | null>(null)
  const directoryDisabled =
    pending ||
    !ready ||
    directory.isPending ||
    directory.isFetching ||
    directory.isError ||
    !directory.data
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])
  useEffect(() => {
    if (
      menuOpen &&
      directory.isError &&
      !isAbortError(directory.error) &&
      source === dataSourceKey() &&
      reportedDirectoryError.current !== directory.error
    ) {
      reportedDirectoryError.current = directory.error
      toast.add({ title: directory.error.message, type: "error" })
    }
  }, [menuOpen, directory.isError, directory.error, source])

  async function runAction(action: "pin" | "open" | "copy" | "remove") {
    if (
      lock.current === source ||
      !useAccountSourceStore.getState().ready ||
      source !== dataSourceKey() ||
      ((action === "open" || action === "copy") && directoryDisabled) ||
      (action === "remove" && !removalOpen)
    )
      return
    lock.current = source
    setPendingSource(source)
    try {
      if (action === "pin") {
        await onTogglePinned()
      } else if (action === "open") {
        await openProjectDirectory(project.id)
      } else if (action === "copy") {
        const copied = await copyProjectDirectoryPath(project.id)
        if (copied && active.current && source === dataSourceKey())
          toast.add({ title: t("common.copied"), type: "success" })
      } else {
        await onDelete()
        if (active.current && source === dataSourceKey()) setRemovalEpoch(null)
      }
    } catch (cause) {
      if (
        active.current &&
        source === dataSourceKey() &&
        !isAbortError(cause) &&
        ((action !== "pin" && action !== "remove") ||
          !(cause instanceof ApiError))
      )
        toast.add({
          title:
            cause instanceof Error ? cause.message : t("common.requestFailed"),
          type: "error",
        })
    } finally {
      if (lock.current === source) lock.current = null
      if (active.current && source === dataSourceKey()) setPendingSource(null)
    }
  }
  return (
    <Collapsible
      open={expanded}
      onOpenChange={onToggle}
      className="group/collapsible"
    >
      <SidebarMenuItem>
        <ContextMenu onOpenChange={setMenuOpen}>
          <ContextMenuTrigger className="group/project-row relative block w-full">
            <SidebarMenuButton
              tooltip={project.name}
              className="pr-10 text-sm group-hover/project-row:bg-sidebar-accent group-hover/project-row:text-sidebar-accent-foreground"
              render={<CollapsibleTrigger />}
            >
              {expanded ? (
                <FolderOpenIcon className="text-muted-foreground" />
              ) : (
                <FolderIcon className="text-muted-foreground" />
              )}
              <span className="truncate">{project.name}</span>
            </SidebarMenuButton>
            <span
              className={cn(
                SIDEBAR_TRAILING_SLOT_CLASS,
                SIDEBAR_TRAILING_HOVER_ICON_CLASS
              )}
            >
              <TooltipHint label={t("common.newChat")} side="top">
                <button
                  type="button"
                  aria-label={t("common.newChat")}
                  className={SIDEBAR_TRAILING_ICON_CLASS}
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    onNewConversation()
                  }}
                >
                  <MessageCirclePlusIcon />
                </button>
              </TooltipHint>
            </span>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuGroup>
              <ContextMenuItem
                disabled={directoryDisabled}
                onClick={() => void runAction("open")}
              >
                {directory.isFetching ? <Spinner /> : <FolderOpenIcon />}
                {t("common.openProjectDirectory")}
              </ContextMenuItem>
              <ContextMenuItem
                disabled={directoryDisabled}
                onClick={() => void runAction("copy")}
              >
                <CopyIcon />
                {t("common.copyProjectDirectoryPath")}
              </ContextMenuItem>
            </ContextMenuGroup>
            <ContextMenuSeparator />
            <ContextMenuGroup>
              <ContextMenuItem
                disabled={pending || !ready}
                onClick={() => void runAction("pin")}
              >
                {project.sort < 0 ? <PinOffIcon /> : <PinIcon />}
                {t(project.sort < 0 ? "common.unpin" : "common.pin")}
              </ContextMenuItem>
              <ContextMenuItem
                disabled={pending || !ready}
                onClick={() => setDirectoryOpen(true)}
              >
                <FolderIcon />
                {t("common.projectDirectory")}
              </ContextMenuItem>
              <ContextMenuItem
                disabled={pending || !ready}
                onClick={() => setRenameOpen(true)}
              >
                <PencilIcon />
                {t("common.rename")}
              </ContextMenuItem>
              <ContextMenuItem
                disabled={pending || !ready}
                onClick={() => onNewConversation()}
              >
                <MessageCirclePlusIcon />
                {t("chat.create")}
              </ContextMenuItem>
            </ContextMenuGroup>
            <ContextMenuSeparator />
            <ContextMenuGroup>
              <ContextMenuItem
                variant="destructive"
                disabled={pending || !ready}
                onClick={() => setRemovalEpoch(sourceEpoch)}
              >
                <Trash2Icon />
                {t("common.removeProject")}
              </ContextMenuItem>
            </ContextMenuGroup>
          </ContextMenuContent>
        </ContextMenu>
        <RenameDialog
          open={renameOpen}
          onOpenChange={setRenameOpen}
          title={t("common.renameProject")}
          value={project.name}
          onSubmit={onRename}
        />
        <RemoveProjectDialog
          open={removalOpen}
          name={project.name}
          pending={pending}
          disabled={!ready}
          onOpenChange={(open) => {
            if (!open) setRemovalEpoch(null)
          }}
          onConfirm={() => void runAction("remove")}
        />
        {directoryOpen ? (
          <ProjectDirectoryDialog
            key={`${sourceEpoch}:${project.id}`}
            project={project}
            onClose={() => setDirectoryOpen(false)}
          />
        ) : null}
        <CollapsibleContent>
          {items.length > 0 ? (
            <SidebarMenuSub className="mx-0 translate-x-0 border-0 px-0">
              <ConversationItems
                items={items}
                selectedId={selectedId}
                openIds={openIds}
                projects={projects}
                nested
                onSelect={onSelect}
                onClear={onClear}
                onRefresh={onRefresh}
              />
            </SidebarMenuSub>
          ) : null}
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  )
}
