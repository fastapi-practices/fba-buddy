import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import {
  useChatMessageState,
  useChatRuntime,
  useChatRuntimeState,
} from "@/features/chat/chat-runtime"
import {
  GitBranchIcon,
  PencilIcon,
  RefreshCwIcon,
  SplitIcon,
  Undo2Icon,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { TooltipIconButton } from "./tooltip-icon-button"
import {
  threadMessagePk,
  toThreadMessage,
} from "@/features/chat/thread-message"
import type { ChatMessage } from "@/lib/types"
import { useComposerStore } from "@/features/chat/composer-store"
import { Switch } from "@/components/ui/switch"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { MessageVersionsContext } from "@/features/chat/message-versions"
import { useT } from "@/hooks/use-t"
import { WorkspaceActionsContext } from "@/features/chat/workspace-actions"
import {
  getMessageVersions,
  type MessageVersion,
} from "@/api/chat-interactions"

export type BranchMessage = (
  pk: number,
  options?: { regenerate?: boolean; content?: string }
) => Promise<void>
export type RollbackMessage = (
  pk: number,
  restoreFiles: boolean
) => Promise<ChatMessage | undefined>
type BranchRequest = {
  pk: number
  edit: boolean
  regenerate: boolean
  text: string
}
const branchLabel = (request: Pick<BranchRequest, "edit" | "regenerate">) =>
  request.edit
    ? "common.historicalEdit"
    : request.regenerate
      ? "common.branchRegenerate"
      : "common.forkFromMessage"

type BranchableMessage = {
  role: string
  content: readonly { type: string; text?: string }[]
  attachments?: readonly unknown[]
}

export function canEditBranchMessage(message: BranchableMessage) {
  return (
    message.role === "user" &&
    !message.attachments?.length &&
    message.content.length > 0 &&
    message.content.every((part) => part.type === "text") &&
    message.content.some((part) => Boolean(part.text?.trim()))
  )
}
const MessageActionsContext = createContext<{
  canBranch: boolean
  busy: boolean
  requestBranch: (request: BranchRequest) => void
  requestVersions: (pk: number) => void
  requestRollback?: (pk: number) => void
} | null>(null)

// 工具栏随悬浮状态卸载，弹窗与请求状态由会话层持有
export function MessageActionsProvider({
  branch,
  rollback,
  children,
}: {
  branch?: BranchMessage
  rollback?: RollbackMessage
  children: ReactNode
}) {
  const { conversationId } = useContext(WorkspaceActionsContext)
  return (
    <MessageActionsController
      key={conversationId ?? "draft"}
      branch={branch}
      rollback={rollback}
    >
      {children}
    </MessageActionsController>
  )
}

function MessageActionsController({
  branch,
  rollback,
  children,
}: {
  branch?: BranchMessage
  rollback?: RollbackMessage
  children: ReactNode
}) {
  const t = useT()
  const runtime = useChatRuntime()
  const running = useChatRuntimeState((state) => state.thread.isRunning)
  const { conversationId } = useContext(WorkspaceActionsContext)
  const versionServices = useContext(MessageVersionsContext)
  const [request, setRequest] = useState<BranchRequest | null>(null)
  const [rollbackPk, setRollbackPk] = useState<number | null>(null)
  const [restoreFiles, setRestoreFiles] = useState(true)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)
  const [versionPk, setVersionPk] = useState<number | null>(null)
  const [versionsOpen, setVersionsOpen] = useState(false)
  const [versions, setVersions] = useState<MessageVersion[]>([])
  const [versionsError, setVersionsError] = useState("")
  const [versionsBusy, setVersionsBusy] = useState(false)
  const versionRevision = useRef(0)
  const versionAbort = useRef<AbortController | null>(null)
  useEffect(
    () => () => {
      versionRevision.current++
      versionAbort.current?.abort()
    },
    []
  )
  const submit = async (next: BranchRequest) => {
    if (!branch || submitting.current) return
    submitting.current = true
    setBusy(true)
    setError("")
    try {
      await branch(next.pk, {
        regenerate: next.edit || next.regenerate,
        ...(next.edit ? { content: next.text } : {}),
      })
      setOpen(false)
    } catch (cause) {
      setError(String(cause))
      setOpen(true)
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }
  const loadVersions = async (pk: number) => {
    if (!conversationId) return
    const revision = ++versionRevision.current
    versionAbort.current?.abort()
    const controller = new AbortController()
    versionAbort.current = controller
    setVersionPk(pk)
    setVersionsOpen(true)
    setVersionsBusy(true)
    setVersionsError("")
    setVersions([])
    try {
      const result = await (versionServices.load ?? getMessageVersions)(
        conversationId,
        pk,
        { signal: controller.signal }
      )
      if (revision === versionRevision.current) setVersions(result)
    } catch (cause) {
      if (revision === versionRevision.current)
        setVersionsError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      if (revision === versionRevision.current) setVersionsBusy(false)
    }
  }
  const label = request ? t(branchLabel(request)) : ""
  return (
    <MessageActionsContext
      value={{
        canBranch: !!branch,
        busy,
        requestBranch: (next) => {
          if (submitting.current) return
          setRequest(next)
          setError("")
          if (next.regenerate && !next.edit) {
            void submit(next)
            return
          }
          setOpen(true)
        },
        requestVersions: (pk) => void loadVersions(pk),
        requestRollback: rollback
          ? (pk) => {
              setRollbackPk(pk)
              setRestoreFiles(true)
              setError("")
            }
          : undefined,
      }}
    >
      {children}
      <Dialog
        open={rollbackPk !== null}
        onOpenChange={(value) => {
          if (!value && !busy) setRollbackPk(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("common.rollbackTurn")}</DialogTitle>
            <DialogDescription>
              {t("common.rollbackTurnHint")}
            </DialogDescription>
          </DialogHeader>
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={restoreFiles}
              onCheckedChange={(value) => setRestoreFiles(value)}
              disabled={busy}
            />
            {t("common.rollbackFiles")}
          </label>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button
            disabled={busy || running || rollbackPk === null}
            onClick={() =>
              void (async () => {
                if (!rollback || rollbackPk === null || submitting.current)
                  return
                submitting.current = true
                setBusy(true)
                setError("")
                try {
                  const original = await rollback(rollbackPk, restoreFiles)
                  if (original) {
                    const converted = toThreadMessage(original)
                    runtime.composer.clear()
                    if (converted.role === "user") {
                      const files: File[] = []
                      for (const attachment of converted.attachments ?? []) {
                        const content = attachment.content[0]
                        if (!content) continue
                        const source =
                          content.type === "image"
                            ? content.image
                            : content.data
                        const blob = await fetch(source).then((response) =>
                          response.blob()
                        )
                        files.push(
                          new File([blob], attachment.name, {
                            type:
                              attachment.contentType ??
                              (content.type === "file"
                                ? content.mimeType
                                : blob.type),
                          })
                        )
                      }
                      await runtime.composer.addFiles(files)
                    }
                    runtime.composer.setText(original.content)
                    useComposerStore.getState().setDraft(original.content)
                  }
                  setRollbackPk(null)
                } catch (cause) {
                  setError(
                    cause instanceof Error ? cause.message : String(cause)
                  )
                } finally {
                  submitting.current = false
                  setBusy(false)
                }
              })()
            }
          >
            {t(busy ? "common.loading" : "common.rollbackTurn")}
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
            <DialogDescription>
              {request?.edit || request?.regenerate
                ? t("common.forkFromMessage")
                : t("common.forkFromMessageHint")}
            </DialogDescription>
          </DialogHeader>
          {request?.edit && (
            <Textarea
              aria-label={label}
              value={request.text}
              disabled={busy}
              className="min-h-40"
              onChange={(event) =>
                setRequest({ ...request, text: event.target.value })
              }
            />
          )}
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          <Button
            disabled={
              busy || !request || (request.edit && !request.text.trim())
            }
            onClick={() => request && void submit(request)}
          >
            {label}
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={versionsOpen}
        onOpenChange={(next) => {
          setVersionsOpen(next)
          if (!next) {
            versionRevision.current++
            versionAbort.current?.abort()
            setVersionsBusy(false)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("common.branchVersions")}</DialogTitle>
            <DialogDescription>
              {versionServices.description ?? t("common.branchVersionsHint")}
            </DialogDescription>
          </DialogHeader>
          {versionsBusy ? (
            <p role="status">{t("common.loading")}</p>
          ) : versionsError ? (
            <Alert variant="destructive">
              <AlertDescription>{versionsError}</AlertDescription>
              <Button
                onClick={() =>
                  versionPk != null && void loadVersions(versionPk)
                }
              >
                {t("common.retry")}
              </Button>
            </Alert>
          ) : versions.length ? (
            <ul className="flex max-h-96 flex-col gap-2 overflow-auto">
              {versions.map((version) => (
                <li key={`${version.conversation_id}:${version.message_id}`}>
                  <Button
                    variant="outline"
                    nativeButton={false}
                    role="link"
                    render={
                      <a
                        href={`#/chat/${encodeURIComponent(version.conversation_id)}`}
                      />
                    }
                    onClick={(event) => {
                      event.preventDefault()
                      void (async () => {
                        const revision = versionRevision.current
                        try {
                          if (!versionServices.navigate)
                            throw new Error(
                              t("common.branchNavigationUnavailable")
                            )
                          await versionServices.navigate(version)
                          if (revision === versionRevision.current)
                            setVersionsOpen(false)
                        } catch (cause) {
                          if (revision === versionRevision.current)
                            setVersionsError(
                              cause instanceof Error
                                ? cause.message
                                : String(cause)
                            )
                        }
                      })()
                    }}
                    className="h-auto w-full flex-col items-start gap-1 p-3 text-left"
                  >
                    <span className="max-w-full truncate">
                      {version.title || t("common.branchUntitled")}
                    </span>
                    <time className="text-xs text-muted-foreground">
                      {Number.isNaN(Date.parse(version.created_time))
                        ? version.created_time
                        : new Date(version.created_time).toLocaleString()}
                    </time>
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>{t("common.noBranches")}</EmptyTitle>
              </EmptyHeader>
            </Empty>
          )}
        </DialogContent>
      </Dialog>
    </MessageActionsContext>
  )
}

export function MessageRollbackButton() {
  const t = useT()
  const actions = useContext(MessageActionsContext)
  const pk = useChatMessageState((state) => threadMessagePk(state.message))
  const running = useChatMessageState((state) => state.thread.isRunning)
  if (!actions?.requestRollback || pk == null) return null
  return (
    <TooltipIconButton
      tooltip={t("common.rollbackTurn")}
      disabled={running || actions.busy}
      onClick={() => actions.requestRollback?.(pk)}
    >
      <Undo2Icon />
    </TooltipIconButton>
  )
}

export function MessageVersionsButton() {
  const t = useT()
  const actions = useContext(MessageActionsContext)
  const { conversationId } = useContext(WorkspaceActionsContext)
  const pk = useChatMessageState((state) => threadMessagePk(state.message))
  if (!actions || !conversationId || pk == null) return null
  return (
    <TooltipIconButton
      tooltip={t("common.branchVersions")}
      onClick={() => actions.requestVersions(pk)}
    >
      <GitBranchIcon />
    </TooltipIconButton>
  )
}

export function MessageBranchButton({
  edit = false,
  regenerate = false,
}: {
  edit?: boolean
  regenerate?: boolean
}) {
  const t = useT()
  const actions = useContext(MessageActionsContext)
  const message = useChatMessageState((state) => state.message)
  const pk = threadMessagePk(message)
  if (
    !actions?.canBranch ||
    pk == null ||
    (edit && !canEditBranchMessage(message))
  )
    return null
  const label = t(branchLabel({ edit, regenerate }))
  return (
    <TooltipIconButton
      tooltip={label}
      side="top"
      disabled={actions.busy}
      onClick={() =>
        actions.requestBranch({
          pk,
          edit,
          regenerate,
          text: message.content
            .filter((part) => part.type === "text")
            .map((part) => part.text)
            .join(""),
        })
      }
    >
      {edit ? (
        <PencilIcon />
      ) : regenerate ? (
        <RefreshCwIcon />
      ) : (
        <SplitIcon className="rotate-90" />
      )}
    </TooltipIconButton>
  )
}
