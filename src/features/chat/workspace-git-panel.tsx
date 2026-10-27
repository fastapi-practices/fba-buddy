import { useMemo, useRef, useState } from "react"
import {
  CopyIcon,
  EllipsisIcon,
  ExternalLinkIcon,
  FileDiffIcon,
  FolderOpenIcon,
  PlusIcon,
  RotateCcwIcon,
} from "lucide-react"
import { FilePreview } from "@/components/ai-elements/file-preview"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Empty, EmptyDescription } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { TooltipHint } from "@/components/ui/tooltip"
import { useT } from "@/hooks/use-t"
import { currentAccountSource } from "@/lib/account-source"
import type { WorkspaceAsset } from "@/shared/workspace"
import { WorkspaceGitDiff } from "./workspace-git-diff"
import { workspaceGitDiffFiles } from "./workspace-git-diff-state"
import { WorkspaceGitFileIcon } from "./workspace-git-file-icon"
import { useWorkspaceGitSession } from "./workspace-git-provider"
import { gitEntryConflict, gitEntryGroups } from "./workspace-git-state"
import { WorkspaceGitToolbar } from "./workspace-git-toolbar"
import { useWorkspaceGitTurns } from "./workspace-git-turns"
import { assetSource } from "./workspace-preview"

export function WorkspaceGitPanel() {
  const session = useWorkspaceGitSession()
  const t = useT()
  if (!session)
    return (
      <Empty>
        <EmptyDescription>{t("common.gitSelectWorkspace")}</EmptyDescription>
      </Empty>
    )
  return <WorkspaceGitPanelContent session={session} />
}

function WorkspaceGitPanelContent({
  session,
}: {
  session: NonNullable<ReturnType<typeof useWorkspaceGitSession>>
}) {
  const t = useT()
  const { git, commitOpen, conversationId, openCommit } = session
  const turns = useWorkspaceGitTurns(conversationId)
  const [viewMode, setViewMode] = useState<"split" | "unified">("split")
  const [wordWrap, setWordWrap] = useState(false)
  const [collapsedPaths, setCollapsedPaths] = useState<ReadonlySet<string>>(
    new Set()
  )
  const [fileListOpen, setFileListOpen] = useState(false)
  const [fileQuery, setFileQuery] = useState("")
  const [activeFile, setActiveFile] = useState<string | null>(null)
  const [preview, setPreview] = useState<WorkspaceAsset | null>(null)
  const [fileError, setFileError] = useState("")
  const viewport = useRef<HTMLDivElement>(null)
  const diff = turns.selectedId ? turns.diff : git.aggregate
  const loading = turns.selectedId
    ? turns.loading
    : git.loading || git.diffLoading
  const error = turns.selectedId ? turns.error : git.error || git.diffError
  const files = useMemo(() => (diff ? workspaceGitDiffFiles(diff) : []), [diff])
  const groups = gitEntryGroups(git.status?.entries ?? [])
  const allCollapsed =
    files.length > 0 && files.every((file) => collapsedPaths.has(file.path))
  const disabled =
    git.busy || git.loading || !!git.error || !git.status?.repository
  const conflicts = git.status?.entries.some(gitEntryConflict) ?? false
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.add({ title: t("common.copied"), type: "success" })
    } catch {
      toast.add({ title: t("common.copyFailed"), type: "error" })
    }
  }
  const toggleCollapsed = (path: string) =>
    setCollapsedPaths((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  const selectFile = (path: string) => {
    setActiveFile(path)
    setCollapsedPaths((current) => {
      if (!current.has(path)) return current
      const next = new Set(current)
      next.delete(path)
      return next
    })
    requestAnimationFrame(() => {
      const card = Array.from(
        viewport.current?.querySelectorAll<HTMLElement>(
          "[data-diff-file-path]"
        ) ?? []
      ).find((item) => item.dataset.diffFilePath === path)
      card?.scrollIntoView({ block: "start", behavior: "instant" })
    })
  }
  const navigate = (direction: -1 | 1) => {
    if (!files.length) return
    const index = files.findIndex((file) => file.path === activeFile)
    const next =
      index < 0
        ? direction === 1
          ? 0
          : files.length - 1
        : (index + direction + files.length) % files.length
    selectFile(files[next].path)
  }
  const fileRequest = async (
    path: string,
    action: "open" | "reveal" | "read-asset"
  ) => {
    setFileError("")
    try {
      const result = await window.buddyDesktop?.workspace({
        source: currentAccountSource() ?? undefined,
        action,
        ...git.target,
        path,
      })
      if (action === "read-asset" && result && "data" in result)
        setPreview(result)
    } catch (cause) {
      setFileError(cause instanceof Error ? cause.message : String(cause))
    }
  }
  const actionsForPath = (path: string) => {
    const staged = groups.staged.some((entry) => entry.path === path)
    const unstaged = groups.unstaged.some((entry) => entry.path === path)
    const entry = git.status?.entries.find((entry) => entry.path === path)
    const binary = files.find((file) => file.path === path)?.binary
    const deleted =
      !git.status?.entries.some(
        (entry) => entry.path === path && entry.untracked
      ) &&
      (entry?.worktree === "D" ||
        (entry?.index === "D" && entry.worktree === " "))
    const stageAction = git.diffScope !== "staged" && unstaged
    return (
      <>
        {!turns.selectedId && (staged || unstaged) && (
          <TooltipHint
            label={t(stageAction ? "common.gitStage" : "common.gitUnstage")}
          >
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`${t(stageAction ? "common.gitStage" : "common.gitUnstage")} ${path}`}
              disabled={disabled}
              onClick={() =>
                void git.changeStage(
                  [path],
                  stageAction ? "unstaged" : "staged"
                )
              }
            >
              {stageAction ? <PlusIcon /> : <RotateCcwIcon />}
            </Button>
          </TooltipHint>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`${t("common.gitFileActions")} ${path}`}
              />
            }
          >
            <EllipsisIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuGroup>
              {!turns.selectedId && unstaged && (
                <DropdownMenuItem
                  disabled={disabled}
                  onClick={() => void git.changeStage([path], "unstaged")}
                >
                  <PlusIcon />
                  {t("common.gitStage")}
                </DropdownMenuItem>
              )}
              {!turns.selectedId && staged && (
                <DropdownMenuItem
                  disabled={disabled}
                  onClick={() => void git.changeStage([path], "staged")}
                >
                  <RotateCcwIcon />
                  {t("common.gitUnstage")}
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>
            {!turns.selectedId && (staged || unstaged) && (
              <DropdownMenuSeparator />
            )}
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => void copy(path)}>
                <CopyIcon />
                {t("common.copyProjectDirectoryPath")}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={deleted}
                onClick={() => void fileRequest(path, "open")}
              >
                <ExternalLinkIcon />
                {t("common.openFile")}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={deleted}
                onClick={() => void fileRequest(path, "reveal")}
              >
                <FolderOpenIcon />
                {t("common.revealFile")}
              </DropdownMenuItem>
              {binary && (
                <DropdownMenuItem
                  disabled={deleted}
                  onClick={() => void fileRequest(path, "read-asset")}
                >
                  <FileDiffIcon />
                  {t("common.gitPreviewFile")}
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </>
    )
  }
  const query = fileQuery.trim().toLocaleLowerCase()
  const visibleFiles = files.filter(
    (file) =>
      !query ||
      file.path.toLocaleLowerCase().includes(query) ||
      file.searchText.toLocaleLowerCase().includes(query)
  )
  return (
    <div
      data-slot="workspace-git-panel"
      className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden"
    >
      <WorkspaceGitToolbar
        git={git}
        openCommit={openCommit}
        turns={turns}
        files={files}
        stats={diff}
        viewMode={viewMode}
        onViewMode={setViewMode}
        wordWrap={wordWrap}
        onWordWrap={setWordWrap}
        allCollapsed={allCollapsed}
        onCollapseAll={() =>
          setCollapsedPaths(
            allCollapsed ? new Set() : new Set(files.map((file) => file.path))
          )
        }
        fileListOpen={fileListOpen}
        onFileList={() => setFileListOpen((open) => !open)}
        onSelectFile={selectFile}
        activeFile={activeFile}
        onNavigate={navigate}
        onReload={() => {
          setFileError("")
          if (turns.selectedId) void turns.select(turns.selectedId)
          else void git.refresh()
        }}
        onCopy={() => {
          if (diff) void copy(diff.diff)
        }}
        disabled={disabled}
      />
      {(error || fileError || (!commitOpen && git.actionError)) && (
        <Alert variant="destructive" className="m-2 shrink-0">
          <AlertDescription>
            {error || fileError || git.actionError}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (turns.selectedId) void turns.select(turns.selectedId)
                else void git.refresh()
              }}
            >
              {t("common.retry")}
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {conflicts && !turns.selectedId && (
        <Alert variant="destructive" className="mx-2 my-1 shrink-0">
          <AlertDescription>{t("common.gitConflictsHint")}</AlertDescription>
        </Alert>
      )}
      {turns.checkpoint?.incomplete && (
        <Alert className="m-2 shrink-0">
          <AlertDescription>
            {t("common.gitTurnIncomplete", {
              paths:
                turns.checkpoint.omitted?.join(", ") ||
                turns.checkpoint.captureError ||
                "…",
            })}
          </AlertDescription>
        </Alert>
      )}
      <div className="flex min-h-0 min-w-0 flex-1">
        {fileListOpen && files.length > 0 && (
          <nav
            aria-label={t("common.changedFilesNavigation")}
            className="flex w-44 max-w-[40%] min-w-0 shrink-0 flex-col gap-1 overflow-auto border-r p-1.5"
          >
            <Input
              aria-label={t("common.gitSearchFiles")}
              placeholder={t("common.gitSearchFiles")}
              value={fileQuery}
              onChange={(event) => setFileQuery(event.target.value)}
            />
            {!visibleFiles.length && (
              <p className="p-2 text-xs text-muted-foreground">
                {t("common.gitNoSearchMatches")}
              </p>
            )}
            {visibleFiles.map((file) => (
              <Button
                key={file.path}
                variant={activeFile === file.path ? "secondary" : "ghost"}
                size="sm"
                className="min-w-0 justify-start"
                aria-label={file.path}
                aria-pressed={activeFile === file.path}
                title={file.path}
                onClick={() => selectFile(file.path)}
              >
                <WorkspaceGitFileIcon path={file.path} />
                <span className="min-w-0 truncate">{file.path}</span>
              </Button>
            ))}
          </nav>
        )}
        <div
          ref={viewport}
          data-slot="workspace-git-diff-pane"
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        >
          {loading && (
            <Empty role="status">
              <Spinner />
              <EmptyDescription>{t("common.loading")}</EmptyDescription>
            </Empty>
          )}
          {!loading &&
            !error &&
            !turns.selectedId &&
            !git.status?.repository && (
              <Empty>
                <EmptyDescription>
                  {t("common.gitNotRepository")}
                </EmptyDescription>
              </Empty>
            )}
          {!loading && !error && diff && !files.length && (
            <Empty>
              <EmptyDescription>
                {t(
                  turns.selectedId
                    ? "common.gitNoTextDiff"
                    : git.diffScope === "staged"
                      ? "common.gitNoStagedChanges"
                      : git.diffScope === "unstaged"
                        ? "common.gitNoUnstagedChanges"
                        : "common.gitWorkingTreeClean"
                )}
              </EmptyDescription>
            </Empty>
          )}
          {!loading && diff && files.length > 0 && (
            <WorkspaceGitDiff
              diff={diff}
              viewMode={viewMode}
              wordWrap={wordWrap}
              collapsedPaths={collapsedPaths}
              onToggleCollapsed={toggleCollapsed}
              actionsForPath={actionsForPath}
            />
          )}
        </div>
      </div>
      {preview && (
        <FilePreview
          name={preview.path}
          src={assetSource(preview)}
          mimeType={preview.mimeType}
          open
          onOpenChange={(open) => {
            if (!open) setPreview(null)
          }}
        />
      )}
    </div>
  )
}
