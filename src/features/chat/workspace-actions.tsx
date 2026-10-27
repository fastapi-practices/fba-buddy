import { useAgentMode } from "@/features/chat/conversation-mode"
import { currentAccountSource } from "@/lib/account-source"
import { ensureConversationOnline } from "@/features/chat/require-online"
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import {
  useChatRuntime,
  useChatRuntimeState,
} from "@/features/chat/chat-runtime"
import {
  FolderOpenIcon,
  PlayIcon,
  SquareIcon,
  QuoteIcon,
  ExternalLinkIcon,
} from "lucide-react"
import { toast } from "@/components/ui/toast"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { useT } from "@/hooks/use-t"
import type { WorkspaceAsset, WorkspaceBackend } from "@/shared/workspace"
import {
  parseFileReference,
  resolveReferencePath,
} from "@/shared/file-reference"
import {
  assetSource,
  findWorkspaceFile,
  loadWorkspaceAsset,
} from "./workspace-preview"
import { FilePreview } from "@/components/ai-elements/file-preview"
import { MarkdownBaseDirContext } from "@/components/ai-elements/markdown-media"

export type WorkspaceActionsValue = {
  conversationId: string | null
  backend: WorkspaceBackend | null
}

// eslint-disable-next-line react-refresh/only-export-components
export const WorkspaceActionsContext =
  createContext<WorkspaceActionsValue>({
    conversationId: null,
    backend: null,
  })
// eslint-disable-next-line react-refresh/only-export-components
export const parseWorkspaceLink = parseFileReference

export function WorkspaceLink({
  href,
  children,
}: {
  href: string
  children: ReactNode
}) {
  const t = useT()
  const { conversationId, backend } = useContext(WorkspaceActionsContext)
  const baseDir = useContext(MarkdownBaseDirContext)
  const link = parseFileReference(href)
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<WorkspaceAsset | null>(null)
  const [choices, setChoices] = useState<string[]>([])
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const request = useRef(0)
  useEffect(
    () => () => {
      request.current++
    },
    []
  )
  if (!link) return <>{children}</>
  if (backend === "sandbox")
    return (
      <span title={t("common.sandboxFilePreviewUnavailable")}>{children}</span>
    )
  const read = async (chosen?: string) => {
    const ticket = ++request.current
    setLoading(true)
    setError("")
    setFile(null)
    setChoices([])
    try {
      if (!conversationId || backend !== "local")
        throw new Error(t("common.localWorkspaceRequired"))
      const path = chosen ?? resolveReferencePath(link.path, baseDir)
      const paths = chosen
        ? [chosen]
        : await findWorkspaceFile(conversationId, path)
      if (request.current !== ticket) return
      if (paths.length > 1) {
        setChoices(paths)
        return
      }
      const value = await loadWorkspaceAsset(conversationId, paths[0] ?? path)
      if (request.current === ticket) setFile(value)
    } catch (cause) {
      if (request.current === ticket)
        setError(
          cause instanceof Error
            ? cause.message
            : t("common.couldNotLoadPreview")
        )
    } finally {
      if (request.current === ticket) setLoading(false)
    }
  }
  const close = (next: boolean) => {
    setOpen(next)
    if (!next) request.current++
  }
  const toolbar =
    file && conversationId && backend === "local" ? (
      <div className="flex flex-wrap gap-2">
        {(["open", "reveal"] as const).map((action) => (
          <Button
            key={action}
            size="sm"
            variant="outline"
            onClick={() =>
              void window.buddyDesktop
                ?.workspace({
                  source: currentAccountSource() ?? undefined,
                  action,
                  conversationId,
                  path: file.path,
                  line: link.line,
                  column: link.column,
                })
                .catch((cause) =>
                  toast.add({ title: String(cause), type: "error" })
                )
            }
          >
            {action === "open" ? (
              <ExternalLinkIcon data-icon="inline-start" />
            ) : (
              <FolderOpenIcon data-icon="inline-start" />
            )}
            {t(action === "open" ? "common.openFile" : "common.revealFile")}
          </Button>
        ))}
      </div>
    ) : null
  return (
    <>
      <button
        type="button"
        className="cursor-pointer text-primary underline decoration-dotted underline-offset-4"
        onClick={() => {
          setOpen(true)
          void read()
        }}
      >
        {children}
      </button>
      {file ? (
        <FilePreview
          key={file.path}
          name={file.path}
          src={assetSource(file)}
          mimeType={file.mimeType}
          open={open}
          onOpenChange={close}
          line={link.line}
          column={link.column}
          toolbar={toolbar}
          baseDir={
            file.path.includes("/")
              ? file.path.slice(0, file.path.lastIndexOf("/"))
              : undefined
          }
        />
      ) : (
        <Dialog open={open} onOpenChange={close}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{link.path}</DialogTitle>
              <DialogDescription>{t("common.workspaceFile")}</DialogDescription>
            </DialogHeader>
            {loading ? <p role="status">{t("common.loading")}</p> : null}
            {error ? (
              <div role="alert">
                <p>{error}</p>
                <Button onClick={() => void read()}>{t("common.retry")}</Button>
              </div>
            ) : null}
            {choices.length ? (
              <div className="flex max-h-80 flex-col gap-2 overflow-auto">
                <p>{t("common.chooseMatchingFile")}</p>
                {choices.map((path) => (
                  <Button
                    key={path}
                    variant="outline"
                    className="justify-start"
                    onClick={() => void read(path)}
                  >
                    {path}
                  </Button>
                ))}
              </div>
            ) : null}
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}

export function RunCodeButton({
  code,
  language,
}: {
  code: string
  language?: string
}) {
  const t = useT()
  const coding = useAgentMode() === "coding"
  const { conversationId, backend } = useContext(WorkspaceActionsContext)
  const runtime = useChatRuntime()
  const threadRunning = useChatRuntimeState((state) => state.thread.isRunning)
  const readOnly = useChatRuntimeState((state) => state.thread.isDisabled)
  const [open, setOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const [output, setOutput] = useState("")
  const [error, setError] = useState("")
  const id = useRef(crypto.randomUUID())
  const outputRef = useRef<HTMLPreElement>(null)
  useEffect(
    () => () => {
      if (conversationId && backend === "local")
        void window.buddyDesktop
          ?.workspace({
            source: currentAccountSource() ?? undefined,
            action: "cancel",
            conversationId,
            requestId: id.current,
          })
          .catch(() => {})
    },
    [conversationId, backend]
  )
  if (
    !coding ||
    !/^(sh|bash|shell|zsh|console)$/i.test(language ?? "") ||
    !window.buddyDesktop?.workspace ||
    backend !== "local" ||
    !conversationId
  )
    return null
  const run = async () => {
    if (!ensureConversationOnline()) return
    setRunning(true)
    setOutput("")
    setError("")
    try {
      const result = await window.buddyDesktop!.workspace({
        source: currentAccountSource() ?? undefined,
        action: "run",
        conversationId,
        requestId: id.current,
        command: code,
      })
      setOutput(result && "output" in result ? result.output : "")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setRunning(false)
    }
  }
  const quote = () => {
    const selection = window.getSelection()
    const selected =
      selection?.anchorNode && outputRef.current?.contains(selection.anchorNode)
        ? selection.toString()
        : ""
    const text = (selected || output).slice(0, 20000)
    const start = selected
      ? output.slice(0, output.indexOf(selected)).split("\n").length
      : 1
    runtime.composer.setText(
      `${runtime.composer.text}\n\n${t("common.terminalOutput")} (${conversationId}, L${start}–L${start + text.split("\n").length - 1})\n\n\`\`\`text\n${text}\n\`\`\``.trim()
    )
    setOpen(false)
  }
  return (
    <>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={t("common.runInTerminal")}
        disabled={threadRunning || readOnly}
        title={t("common.runInTerminal")}
        onClick={() => setOpen(true)}
      >
        <PlayIcon />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[85dvh] min-w-0 flex-col sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t("common.runInTerminal")}</DialogTitle>
            <DialogDescription>{t("common.runInWorkspace")}</DialogDescription>
          </DialogHeader>
          <pre className="max-h-40 overflow-auto rounded bg-muted p-3 text-xs">
            {code}
          </pre>
          <div className="flex gap-2">
            <Button disabled={running || readOnly} onClick={() => void run()}>
              <PlayIcon />
              {t("common.run")}
            </Button>
            {running && (
              <Button
                variant="outline"
                onClick={() =>
                  void window.buddyDesktop!.workspace({
                    source: currentAccountSource() ?? undefined,
                    action: "cancel",
                    conversationId,
                    requestId: id.current,
                  })
                }
              >
                <SquareIcon />
                {t("common.stop")}
              </Button>
            )}
            {output && (
              <Button variant="outline" onClick={quote}>
                <QuoteIcon />
                {t("common.quoteOutput")}
              </Button>
            )}
          </div>
          {running && <p role="status">{t("common.running")}</p>}
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          {output && (
            <pre
              ref={outputRef}
              tabIndex={0}
              className="min-h-0 overflow-auto rounded border p-3 font-mono text-xs whitespace-pre-wrap"
            >
              {output}
            </pre>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
