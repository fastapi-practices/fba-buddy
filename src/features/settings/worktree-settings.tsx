import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  FolderOpenIcon,
  GitBranchIcon,
  GitForkIcon,
  RefreshCwIcon,
} from "lucide-react"
import { openConversation } from "@/app/navigation"
import { getConversation } from "@/api/conversations"
import { ApiError } from "@/api/http"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldTitle,
} from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog"
import { useT } from "@/hooks/use-t"
import {
  SettingsBlock,
  SettingsCard,
  SettingsPageHeader,
  SETTINGS_ROW_CLASS,
} from "@/features/settings/settings-card"
import {
  currentAccountSource,
  dataSourceKey,
  useAccountSourceStore,
} from "@/lib/account-source"
import type { WorkspaceManagedWorktree } from "@/shared/workspace"
import { startWorktreeDraft } from "@/features/chat/worktree-draft"

export function WorktreeSettings() {
  const sourceKey = useAccountSourceStore(dataSourceKey)
  return <WorktreeSettingsContent key={sourceKey} />
}

function WorktreeSettingsContent() {
  const t = useT()
  const queryClient = useQueryClient()
  const [source] = useState(currentAccountSource)
  const [sourceKey] = useState(dataSourceKey)
  const [items, setItems] = useState<WorkspaceManagedWorktree[]>([])
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [removing, setRemoving] = useState<WorkspaceManagedWorktree | null>(
    null
  )
  const request = useRef(0)
  const lock = useRef(false)
  const controller = useRef<AbortController | null>(null)
  const refresh = useCallback(async () => {
    if (
      !source ||
      sourceKey !== dataSourceKey() ||
      !window.buddyDesktop?.workspace
    )
      return
    const ticket = ++request.current
    setBusy(true)
    setError("")
    try {
      const result = await window.buddyDesktop!.workspace({
        action: "list-worktrees",
        source: source ?? undefined,
      })
      if (ticket !== request.current || sourceKey !== dataSourceKey()) return
      if (!result || !("worktrees" in result))
        throw new Error(t("common.gitResponseInvalid"))
      setItems(result.worktrees)
    } catch (cause) {
      if (ticket === request.current && sourceKey === dataSourceKey())
        setError(String(cause))
    } finally {
      if (ticket === request.current && sourceKey === dataSourceKey())
        setBusy(false)
    }
  }, [source, sourceKey, t])
  useEffect(() => {
    const active = request
    const pending = controller
    let mounted = true
    queueMicrotask(() => {
      if (mounted) void refresh()
    })
    return () => {
      mounted = false
      active.current++
      pending.current?.abort()
    }
  }, [refresh])

  const groups = useMemo(() => {
    const roots = new Map<string, Map<string, WorkspaceManagedWorktree[]>>()
    for (const item of items) {
      const worktrees =
        roots.get(item.sourcePath) ??
        new Map<string, WorkspaceManagedWorktree[]>()
      const linked = worktrees.get(item.path) ?? []
      linked.push(item)
      worktrees.set(item.path, linked)
      roots.set(item.sourcePath, worktrees)
    }
    return [...roots]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([sourcePath, worktrees]) => ({
        sourcePath,
        worktrees: [...worktrees].sort(([left], [right]) =>
          left.localeCompare(right)
        ),
      }))
  }, [items])

  async function act(
    item: WorkspaceManagedWorktree,
    action: "resume-worktree" | "remove-worktree" | "open-worktree"
  ) {
    if (
      lock.current ||
      busy ||
      sourceKey !== dataSourceKey() ||
      !window.buddyDesktop?.workspace
    )
      return
    lock.current = true
    const ticket = ++request.current
    const abort = new AbortController()
    controller.current = abort
    setBusy(true)
    setError("")
    try {
      let exists = true
      if (action === "resume-worktree") {
        try {
          await getConversation(item.conversationId, {
            messageLimit: 1,
            refresh: true,
            silent: true,
            signal: abort.signal,
          })
        } catch (cause) {
          if (cause instanceof ApiError && cause.code === 404) exists = false
          else throw cause
        }
        if (ticket !== request.current || sourceKey !== dataSourceKey()) return
      }
      if (action === "resume-worktree" && item.associated) {
        await window.buddyDesktop.workspace({
          action: "handoff-environment",
          conversationId: item.conversationId,
          source: source ?? undefined,
          mode: "worktree",
        })
        if (ticket !== request.current || sourceKey !== dataSourceKey()) return
      }
      const result = await window.buddyDesktop!.workspace({
        action,
        conversationId: item.conversationId,
        source: source ?? undefined,
        ...(action === "remove-worktree" ? { force: true } : {}),
      })
      if (ticket !== request.current || sourceKey !== dataSourceKey()) return
      if (action !== "open-worktree")
        await queryClient.invalidateQueries({
          queryKey: ["workspace-environment", sourceKey],
        })
      if (action === "resume-worktree") {
        if (!result || !("worktree" in result))
          throw new Error(t("common.gitResponseInvalid"))
        if (exists) {
          await window.buddyDesktop!.workspace({
            action: "mark-worktree-active",
            conversationId: item.conversationId,
            source: source ?? undefined,
          })
          if (ticket === request.current && sourceKey === dataSourceKey())
            openConversation(item.conversationId)
        } else
          startWorktreeDraft({
            conversationId: item.conversationId,
            source: sourceKey,
            ...result.worktree,
          })
      } else if (action === "remove-worktree") {
        setRemoving(null)
        await refresh()
      }
    } catch (cause) {
      if (
        ticket === request.current &&
        sourceKey === dataSourceKey() &&
        !abort.signal.aborted
      )
        setError(String(cause))
    } finally {
      lock.current = false
      if (ticket === request.current && sourceKey === dataSourceKey())
        setBusy(false)
    }
  }
  return (
    <div className="flex min-w-0 flex-col gap-8">
      <SettingsPageHeader
        title={t("common.worktrees")}
        action={
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void refresh()}
          >
            {busy ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <RefreshCwIcon data-icon="inline-start" />
            )}
            {t("common.gitRefresh")}
          </Button>
        }
      />
      <div data-slot="worktree-manager" className="flex min-w-0 flex-col gap-4">
        {busy && !items.length && <p role="status">{t("common.loading")}</p>}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {!busy && !items.length && !error && (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <GitForkIcon />
              </EmptyMedia>
              <EmptyTitle>{t("common.worktreeManagerEmpty")}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        )}
        {groups.map((group) => (
          <SettingsBlock
            key={group.sourcePath}
            title={group.sourcePath}
            className="[&_h2]:break-all"
          >
            <SettingsCard>
              {group.worktrees.map(([path, linked]) => {
                const item = linked[0]
                return (
                  <Field
                    key={path}
                    orientation="horizontal"
                    className={SETTINGS_ROW_CLASS}
                  >
                    <FieldContent className="min-w-0 gap-2">
                      <FieldTitle className="flex-wrap">
                        <Badge variant="secondary">
                          <GitBranchIcon aria-hidden="true" />
                          <span className="break-all">
                            {item.branch ?? t("common.gitDetachedHead")}
                          </span>
                        </Badge>
                        <code>{item.head.slice(0, 12)}</code>
                      </FieldTitle>
                      <FieldDescription className="font-mono break-all">
                        {path}
                      </FieldDescription>
                      <div className="flex flex-col gap-2">
                        <span className="text-sm text-muted-foreground">
                          {t("common.worktreeLinkedChats")}
                        </span>
                        {linked.map((binding) => (
                          <div
                            key={binding.conversationId}
                            className="flex min-w-0 flex-wrap items-center gap-2"
                          >
                            <WorktreeConversation
                              item={binding}
                              sourceKey={sourceKey}
                            />
                            <Badge variant="outline">
                              {t(
                                binding.state === "active"
                                  ? "common.worktreeStateActive"
                                  : binding.state === "orphan"
                                    ? "common.worktreeStateOrphan"
                                    : "common.worktreeStateDraft"
                              )}
                            </Badge>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy || Boolean(binding.error)}
                              onClick={() =>
                                void act(binding, "resume-worktree")
                              }
                            >
                              {t("common.worktreeResume")}
                            </Button>
                          </div>
                        ))}
                      </div>
                      {linked.map(
                        (binding) =>
                          binding.error && (
                            <Alert
                              key={binding.conversationId}
                              variant="destructive"
                            >
                              <AlertDescription>
                                {binding.error}
                              </AlertDescription>
                            </Alert>
                          )
                      )}
                    </FieldContent>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy || Boolean(item.error)}
                        onClick={() => void act(item, "open-worktree")}
                      >
                        <FolderOpenIcon data-icon="inline-start" />
                        {t("common.worktreeOpenFolder")}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={busy || Boolean(item.error)}
                        onClick={() => {
                          setError("")
                          setRemoving(item)
                        }}
                      >
                        {t("common.worktreeRemove")}
                      </Button>
                    </div>
                  </Field>
                )
              })}
            </SettingsCard>
          </SettingsBlock>
        ))}
        <AlertDialog
          open={Boolean(removing)}
          onOpenChange={(open) => {
            if (!open && !busy) setRemoving(null)
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("common.worktreeRemove")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("common.worktreeRemoveHint")}
                <code className="block break-all">{removing?.path}</code>
              </AlertDialogDescription>
            </AlertDialogHeader>
            {removing && (
              <div className="flex min-w-0 flex-col gap-2">
                <span className="text-sm text-muted-foreground">
                  {t("common.worktreeLinkedChats")}
                </span>
                {items
                  .filter((item) => item.path === removing.path)
                  .map((item) => (
                    <WorktreeConversation
                      key={item.conversationId}
                      item={item}
                      sourceKey={sourceKey}
                    />
                  ))}
              </div>
            )}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>
                {t("common.cancel")}
              </AlertDialogCancel>
              <Button
                variant="destructive"
                disabled={busy}
                onClick={() =>
                  removing && void act(removing, "remove-worktree")
                }
              >
                {t("common.confirm")}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}

function WorktreeConversation({
  item,
  sourceKey,
}: {
  item: WorkspaceManagedWorktree
  sourceKey: string
}) {
  const detail = useQuery({
    queryKey: ["worktree-conversation", sourceKey, item.conversationId],
    queryFn: ({ signal }) =>
      getConversation(item.conversationId, {
        messageLimit: 1,
        silent: true,
        signal,
      }),
    enabled: item.state === "active" && sourceKey === dataSourceKey(),
    retry: false,
    staleTime: 60000,
  })
  return (
    <span className="min-w-0 text-sm break-all" title={item.conversationId}>
      {detail.data?.title || item.conversationId}
    </span>
  )
}
