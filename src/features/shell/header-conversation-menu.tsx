import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  CopyIcon,
  EraserIcon,
  FileDownIcon,
  FolderIcon,
  FolderInputIcon,
  InboxIcon,
  LockKeyholeIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon,
  Trash2Icon,
} from "lucide-react"
import { useState } from "react"

import {
  archiveConversation,
  clearConversationMessages,
  deleteConversation,
  exportConversation,
  forkConversation,
  listProjects,
  patchConversationWorkspace,
  pinConversation,
  renameConversation,
} from "@/api"
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
import { toast } from "@/components/ui/toast"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  useConversationActivityStore,
  useConversationGenerating,
} from "@/features/chat/conversation-activity"
import { useSelectionStore } from "@/features/shell/selection-store"
import { ArchiveConversationDialog } from "@/features/shell/archive-conversation-dialog"
import { ClearMessagesDialog } from "@/features/shell/clear-messages-dialog"
import { removeConversationFromCaches } from "@/features/shell/conversation-cache"
import { RenameDialog } from "@/features/shell/sidebar-rename-dialog"
import { useT } from "@/hooks/use-t"
import type {
  ConversationListItem,
} from "@/lib/types"

export function HeaderConversationMenu({
  item,
}: {
  item: ConversationListItem
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
  const projectsQuery = useQuery({
    queryKey: queryKeys.projects(),
    queryFn: listProjects,
  })
  const projects = projectsQuery.data ?? []
  const archiveLabel = item.is_archived
    ? t("common.unarchive")
    : t("common.archive")
  const pinLabel = item.is_pinned ? t("common.unpin") : t("common.pin")

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: queryKeys.conversations() })
  }

  async function exportDocument(encrypt: boolean) {
    try {
      const document = await exportConversation(item.conversation_id, {
        encrypt,
      })
      const blob = new Blob([JSON.stringify(document, null, 2)], {
        type: "application/json",
      })
      const url = URL.createObjectURL(blob)
      const anchor = window.document.createElement("a")
      const title =
        item.title.trim().replace(/[\\/:*?"<>|]+/g, "-") ||
        item.conversation_id
      anchor.href = url
      anchor.download = `${title}${encrypt ? ".encrypted" : ""}.json`
      window.document.body.append(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
      toast.add({
        title: t("common.conversationExported"),
        type: "success",
      })
    } catch {
      toast.add({ title: t("common.exportFailed"), type: "error" })
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="electron-no-drag size-7 shrink-0 text-muted-foreground"
              aria-label={t("common.more")}
            />
          }
        >
          <MoreHorizontalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-36">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => setRenameOpen(true)}>
              <PencilIcon />
              {t("common.rename")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                void forkConversation(item.conversation_id).then(
                  (conversationId) => {
                    openConversation(conversationId)
                    refresh()
                  }
                )
              }
            >
              <CopyIcon />
              {t("common.forkChat")}
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <FolderInputIcon />
                {t("common.moveToProject")}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    onClick={() =>
                      void patchConversationWorkspace(item.conversation_id, {
                        project_id: null,
                      }).then(refresh)
                    }
                  >
                    <InboxIcon />
                    {t("common.recent")}
                  </DropdownMenuItem>
                  {projects.map((project) => (
                    <DropdownMenuItem
                      key={project.id}
                      onClick={() =>
                        void patchConversationWorkspace(item.conversation_id, {
                          project_id: project.id,
                        }).then(refresh)
                      }
                    >
                      <FolderIcon />
                      {project.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem
              onClick={() =>
                void pinConversation(
                  item.conversation_id,
                  !item.is_pinned
                ).then(refresh)
              }
            >
              {item.is_pinned ? <PinOffIcon /> : <PinIcon />}
              {pinLabel}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                if (item.is_archived) {
                  void archiveConversation(item.conversation_id, false)
                    .then(() => {
                      removeConversationFromCaches(
                        queryClient,
                        item.conversation_id
                      )
                      refresh()
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
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => void exportDocument(false)}>
              <FileDownIcon />
              {t("common.exportJson")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void exportDocument(true)}>
              <LockKeyholeIcon />
              {t("common.exportEncryptedJson")}
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem
              disabled={!canClear}
              onClick={() => setClearOpen(true)}
            >
              <EraserIcon />
              {t("common.clearMessages")}
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2Icon />
              {t("common.delete")}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <RenameDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        title={t("common.renameChat")}
        value={item.title}
        onSubmit={(next) =>
          renameConversation(item.conversation_id, next).then(refresh)
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
              refresh()
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
              refresh()
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
                    startDraftChat()
                    useSelectionStore
                      .getState()
                      .markConversationRead(item.conversation_id)
                    refresh()
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
