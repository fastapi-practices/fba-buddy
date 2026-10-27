import { translateCurrent } from "@/lib/i18n"
import { useEffect, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  CopyIcon,
  FileJsonIcon,
  PencilIcon,
  PlugIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"

import { cloneMyMcp, deleteMyMcp, listMcps } from "@/api"
import { apiErrorMessage } from "@/api/http"
import { queryKeys } from "@/api/query-keys"
import { startDraftChat } from "@/app/navigation"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert"
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
import { Spinner } from "@/components/ui/spinner"
import { useComposerStore } from "@/features/chat/composer-store"
import {
  CreateMcpDialog,
  EditMcpDialog,
  ImportMcpJsonDialog,
} from "@/features/mcp/mcp-editors"
import { mcpEndpoint, mcpMatchesQuery, mcpTypeLabel } from "@/features/mcp/mcp"
import { McpOauth } from "@/features/mcp/mcp-oauth"
import { McpOauthConfig } from "@/features/mcp/mcp-oauth-config"
import {
  isMcpOauthEligible,
  useMcpOauthStatus,
} from "@/features/mcp/use-mcp-oauth"
import { SIDEBAR_EDGE_INSET_X_CLASS } from "@/features/shell/sidebar-style"
import { SidebarToolbarButton } from "@/features/shell/sidebar-toolbar-button"
import { useWorkspaceSearchStore } from "@/features/workspace/workspace-search"
import { avatarFallbackTone } from "@/lib/avatar-tone"
import { useT } from "@/hooks/use-t"
import { notifyError } from "@/lib/notify"
import { canEditOwnedResource } from "@/lib/ownership"
import { useSessionStore } from "@/lib/session"
import { cn } from "@/lib/utils"
import type { McpItem } from "@/lib/types"

export function McpLibrary() {
  const t = useT()
  const queryClient = useQueryClient()
  const query = useWorkspaceSearchStore((state) => state.query)
  const isSuperuser =
    useSessionStore((state) => state.user?.is_superuser) === true
  const mcpsQuery = useQuery({
    queryKey: queryKeys.mcps(),
    queryFn: listMcps,
  })
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [editMcp, setEditMcp] = useState<McpItem | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)

  useEffect(() => {
    return () => {
      useWorkspaceSearchStore.getState().setQuery("")
    }
  }, [])

  const items = useMemo(() => mcpsQuery.data ?? [], [mcpsQuery.data])
  const selected = items.find((item) => item.id === selectedId) ?? null
  const filtered = useMemo(
    () => items.filter((item) => mcpMatchesQuery(item, query)),
    [items, query]
  )

  async function refreshMcps() {
    await queryClient.invalidateQueries({ queryKey: queryKeys.mcps() })
  }

  async function clone(mcp: McpItem) {
    if (canEditOwnedResource(mcp.user_id) || busyId != null) {
      return
    }
    if (mcp.type === 0 && !isSuperuser) {
      return
    }
    setBusyId(mcp.id)
    try {
      await cloneMyMcp(mcp.id)
      await refreshMcps()
      setSelectedId(null)
    } catch (error) {
      notifyError(apiErrorMessage(error, t("common.couldNotCopyTheMcp")))
    } finally {
      setBusyId(null)
    }
  }

  async function remove(mcp: McpItem) {
    if (!canEditOwnedResource(mcp.user_id) || busyId != null) {
      return
    }
    setBusyId(mcp.id)
    try {
      await deleteMyMcp(mcp.id)
      await refreshMcps()
      setSelectedId(null)
    } catch (error) {
      notifyError(apiErrorMessage(error, t("common.couldNotDeleteTheMcp")))
    } finally {
      setBusyId(null)
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
        {mcpsQuery.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-40 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
          </div>
        ) : mcpsQuery.isError ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <PlugIcon />
              </EmptyMedia>
              <EmptyTitle>
                {t("common.couldNotLoadName", { name: t("common.mcp") })}
              </EmptyTitle>
              <EmptyDescription>
                {apiErrorMessage(
                  mcpsQuery.error,
                  translateCurrent("common.pleaseTryAgainLater")
                )}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : filtered.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <PlugIcon />
              </EmptyMedia>
              <EmptyTitle>
                {items.length === 0
                  ? t("common.noMcpServersYet")
                  : t("common.noMatchingMcpServers")}
              </EmptyTitle>
              {items.length === 0 ? (
                <EmptyDescription>
                  {t("common.createOneOrPasteMcpserversJson")}
                </EmptyDescription>
              ) : null}
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((mcp) => (
              <McpCard
                key={mcp.id}
                mcp={mcp}
                onOpen={() => setSelectedId(mcp.id)}
              />
            ))}
          </div>
        )}
      </div>
      <McpDialog
        mcp={selected}
        busy={selected != null && busyId === selected.id}
        isSuperuser={isSuperuser}
        onClose={() => setSelectedId(null)}
        onEdit={(item) => {
          setSelectedId(null)
          setEditMcp(item)
        }}
        onClone={(item) => void clone(item)}
        onRemove={(item) => void remove(item)}
      />
      <EditMcpDialog
        mcp={editMcp}
        open={editMcp != null}
        onOpenChange={(open) => {
          if (!open) {
            setEditMcp(null)
          }
        }}
        onSaved={refreshMcps}
      />
    </div>
  )
}

export function WorkspaceMcpAddButtons() {
  const t = useT()
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  async function refreshMcps() {
    await queryClient.invalidateQueries({ queryKey: queryKeys.mcps() })
  }

  return (
    <>
      {/* 新建在搜索按钮右侧，导入跟在其后；都只留图标 */}
      <SidebarToolbarButton
        label={t("common.createMcp")}
        onClick={() => setCreateOpen(true)}
      >
        <PlusIcon strokeWidth={1.75} />
      </SidebarToolbarButton>
      <SidebarToolbarButton
        label={t("common.importJson")}
        onClick={() => setImportOpen(true)}
      >
        <FileJsonIcon strokeWidth={1.75} />
      </SidebarToolbarButton>
      <CreateMcpDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={refreshMcps}
      />
      <ImportMcpJsonDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={refreshMcps}
      />
    </>
  )
}

function McpCard({ mcp, onOpen }: { mcp: McpItem; onOpen: () => void }) {
  const t = useT()
  const owned = canEditOwnedResource(mcp.user_id)
  const endpoint = mcpEndpoint(mcp)
  return (
    <Card
      size="sm"
      role="button"
      tabIndex={0}
      className="cursor-pointer py-4 text-left transition-colors hover:bg-muted/40"
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
          <Avatar className="size-8">
            <AvatarFallback className={avatarFallbackTone(mcp.id)}>
              {mcp.name.trim().slice(0, 1) || "?"}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <CardTitle className="flex items-center gap-2 truncate text-base">
              <span className="min-w-0 truncate">{mcp.name}</span>
              <Badge variant="outline">{mcpTypeLabel(mcp.type)}</Badge>
              {owned ? null : (
                <Badge variant="outline">{t("common.builtIn")}</Badge>
              )}
            </CardTitle>
            {endpoint ? (
              <CardDescription className="mt-1 line-clamp-2 leading-5">
                {endpoint}
              </CardDescription>
            ) : null}
          </div>
        </div>
      </CardHeader>
    </Card>
  )
}

function McpDialog({
  mcp,
  busy,
  isSuperuser,
  onClose,
  onEdit,
  onClone,
  onRemove,
}: {
  mcp: McpItem | null
  busy: boolean
  isSuperuser: boolean
  onClose: () => void
  onEdit: (mcp: McpItem) => void
  onClone: (mcp: McpItem) => void
  onRemove: (mcp: McpItem) => void
}) {
  const t = useT()
  const oauthStatus = useMcpOauthStatus(mcp)
  const oauthEligible = mcp != null && isMcpOauthEligible(mcp)
  const connectionRequired =
    oauthStatus.data?.configured === true && !oauthStatus.data.connected
  const canUse =
    !oauthEligible ||
    (oauthStatus.data != null && !oauthStatus.isError && !connectionRequired)
  const owned = mcp ? canEditOwnedResource(mcp.user_id) : false
  const canClone = mcp != null && !owned && (mcp.type !== 0 || isSuperuser)
  const endpoint = mcp ? mcpEndpoint(mcp) : ""

  return (
    <Dialog
      open={mcp != null}
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
        {mcp ? (
          <>
            <DialogHeader className="gap-4">
              <div className="flex items-start gap-4">
                <Avatar className="size-16">
                  <AvatarFallback className={avatarFallbackTone(mcp.id)}>
                    {mcp.name.trim().slice(0, 1) || "?"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex min-w-0 flex-1 flex-col gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <DialogTitle className="min-w-0 flex-1 truncate text-lg font-semibold">
                      {mcp.name}
                    </DialogTitle>
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
                      disabled={!canUse}
                      onClick={() => {
                        if (!canUse) return
                        startDraftChat()
                        const composer = useComposerStore.getState()
                        const selected = composer.mcp_ids ?? []
                        if (!selected.includes(mcp.id)) {
                          composer.setMcpIds([...selected, mcp.id])
                        }
                        onClose()
                      }}
                    >
                      <PlugIcon data-icon="inline-start" />
                      {t("common.addToThisRun")}
                    </Button>
                    {owned ? (
                      <>
                        <Button
                          type="button"
                          size="lg"
                          variant="outline"
                          className="w-fit"
                          disabled={busy}
                          onClick={() => onEdit(mcp)}
                        >
                          <PencilIcon data-icon="inline-start" />
                          {t("common.edit")}
                        </Button>
                        <Button
                          type="button"
                          size="lg"
                          variant="destructive"
                          className="w-fit"
                          disabled={busy}
                          onClick={() => onRemove(mcp)}
                        >
                          {busy ? (
                            <Spinner data-icon="inline-start" />
                          ) : (
                            <Trash2Icon data-icon="inline-start" />
                          )}
                          {t("common.delete")}
                        </Button>
                      </>
                    ) : canClone ? (
                      <Button
                        type="button"
                        size="lg"
                        variant="outline"
                        className="w-fit"
                        disabled={busy}
                        onClick={() => onClone(mcp)}
                      >
                        {busy ? (
                          <Spinner data-icon="inline-start" />
                        ) : (
                          <CopyIcon data-icon="inline-start" />
                        )}
                        {t("common.copyToMine")}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
              <DialogDescription className="sr-only">
                {mcp.description || endpoint || t("common.noDescription")}
              </DialogDescription>
              <p className="text-sm text-muted-foreground">
                {mcpTypeLabel(mcp.type)}
                {endpoint ? ` · ${endpoint}` : ""}
              </p>
              {mcp.description ? (
                <p className="text-sm leading-6 whitespace-pre-wrap text-foreground/80">
                  {mcp.description}
                </p>
              ) : null}
            </DialogHeader>
            {oauthEligible &&
            oauthStatus.isError &&
            !oauthStatus.data?.configured ? (
              <Alert variant="destructive">
                <AlertDescription>
                  {apiErrorMessage(oauthStatus.error, t("oauth.checkFailed"))}
                </AlertDescription>
                <AlertAction>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={oauthStatus.isFetching}
                    onClick={() => void oauthStatus.refetch()}
                  >
                    {t("common.retry")}
                  </Button>
                </AlertAction>
              </Alert>
            ) : null}
            {oauthEligible ? <McpOauth mcp={mcp} /> : null}
            {isSuperuser && oauthEligible ? <McpOauthConfig mcp={mcp} /> : null}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
