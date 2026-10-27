import { useQueryClient } from "@tanstack/react-query"
import { Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { deleteConversation } from "@/api"
import { queryKeys } from "@/api/query-keys"
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
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { toast } from "@/components/ui/toast"
import {
  imageConversationKey,
  type ImageConversationRecord,
} from "@/features/image/image-conversations"
import { useImageStore } from "@/features/image/image-store"
import { useImageConversations } from "@/features/image/use-image-conversations"
import { discardImageGeneration } from "@/features/image/use-image-gen"
import { removeConversationFromCaches } from "@/features/shell/conversation-cache"
import { usePrefsStore } from "@/features/shell/prefs-store"
import { SIDEBAR_EMPTY_PLACEHOLDER_CLASS } from "@/features/shell/sidebar-style"
import { formatWorkspaceTime } from "@/features/workspace/workspace-records"
import { useT } from "@/hooks/use-t"
import type { AppLocale } from "@/lib/general-settings"

/** 绘画记录按会话展示，滚动到底部继续加载 */
export function ImageRecordsSidebar() {
  const t = useT()
  const locale = usePrefsStore((state) => state.locale)
  const selectedId = useImageStore((state) => state.selectedConversationId)
  const selectConversation = useImageStore((state) => state.selectConversation)
  const startNewConversation = useImageStore(
    (state) => state.startNewConversation
  )
  const records = useImageConversations()
  const sentinel = useRef<HTMLLIElement>(null)
  const { hasNextPage, isFetchingNextPage, isError, fetchNextPage } = records

  useEffect(() => {
    const target = sentinel.current
    if (!target || !hasNextPage || isFetchingNextPage || isError) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) void fetchNextPage()
      },
      { root: target.closest('[data-sidebar="content"]'), rootMargin: "160px" }
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [
    hasNextPage,
    isFetchingNextPage,
    isError,
    fetchNextPage,
    records.items.length,
  ])

  return (
    <>
      <SidebarGroup className="shrink-0 px-3 py-1">
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={selectedId === null}
                onClick={startNewConversation}
              >
                <PlusIcon />
                <span>{t("image.newDrawing")}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      <SidebarGroup
        className="min-h-0 shrink-0 px-3 py-1"
        aria-label={t("common.generationHistory")}
      >
        <SidebarGroupContent>
          <SidebarMenu>
            {records.items.map((record) => (
              <SidebarMenuItem key={record.conversationId}>
                <ImageRecordRow
                  record={record}
                  active={selectedId === record.conversationId}
                  locale={locale}
                  onSelect={selectConversation}
                />
              </SidebarMenuItem>
            ))}
            {!records.items.length && !records.isLoading && !isError ? (
              <SidebarMenuItem>
                <span className={SIDEBAR_EMPTY_PLACEHOLDER_CLASS}>
                  {t("common.noRecordsYet")}
                </span>
              </SidebarMenuItem>
            ) : null}
            {records.isLoading || isFetchingNextPage ? (
              <SidebarMenuItem>
                <span role="status" className={SIDEBAR_EMPTY_PLACEHOLDER_CLASS}>
                  {t("common.loading")}
                </span>
              </SidebarMenuItem>
            ) : null}
            {isError ? (
              <SidebarMenuItem>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    void (hasNextPage ? fetchNextPage() : records.refetch())
                  }
                >
                  {t("common.retry")}
                </Button>
              </SidebarMenuItem>
            ) : null}
            {hasNextPage ? (
              <SidebarMenuItem
                ref={sentinel}
                aria-hidden="true"
                className="h-1"
              />
            ) : null}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </>
  )
}

function ImageRecordRow({
  record,
  active,
  locale,
  onSelect,
}: {
  record: ImageConversationRecord
  active: boolean
  locale: AppLocale
  onSelect: (conversationId: string) => void
}) {
  const t = useT()
  const queryClient = useQueryClient()
  const removeConversation = useImageStore((state) => state.removeConversation)
  const [deleteOpen, setDeleteOpen] = useState(false)

  function remove() {
    void deleteConversation(record.conversationId)
      .then(() => {
        discardImageGeneration(record.conversationId)
        removeConversation(record.conversationId)
        removeConversationFromCaches(queryClient, record.conversationId)
        queryClient.removeQueries({
          queryKey: imageConversationKey(record.conversationId),
        })
        void queryClient.invalidateQueries({
          queryKey: queryKeys.conversations(),
        })
        toast.add({ title: t("common.chatDeleted"), type: "success" })
      })
      .catch(() => {})
  }

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger className="relative block w-full">
          <SidebarMenuButton
            className="h-auto min-h-10 py-2"
            isActive={active}
            onClick={() => onSelect(record.conversationId)}
            title={record.title}
          >
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate">{record.title}</span>
              <span className="truncate text-xs text-muted-foreground">
                {formatWorkspaceTime(
                  new Date(record.updatedAt).toISOString(),
                  locale
                )}
              </span>
            </span>
            {record.isGenerating ? (
              <Loader2Icon className="animate-spin" />
            ) : null}
          </SidebarMenuButton>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuGroup>
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
            <AlertDialogAction variant="destructive" onClick={remove}>
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
