import { DEFAULT_VIRTUAL_FILE_METRICS } from "@pierre/diffs"
import { FileDiff, Virtualizer } from "@pierre/diffs/react"
import { ChevronDownIcon } from "lucide-react"
import { useMemo, type ReactNode, type Ref } from "react"
import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"
import { usePrefsStore } from "@/features/shell/prefs-store"
import { useT } from "@/hooks/use-t"
import { cn } from "@/lib/utils"
import type { WorkspaceGitDiff as GitDiff } from "@/shared/workspace"
import {
  workspaceGitDiffContent,
  type WorkspaceGitDiffFile,
} from "./workspace-git-diff-state"
import { WorkspaceGitFileIcon } from "./workspace-git-file-icon"

function diffCSS(fontSize: number, lineHeight: number) {
  return `
:host {
  --diffs-font-family: var(--app-font-code);
  --diffs-header-font-family: var(--font-sans);
  --diffs-font-size: ${fontSize}px;
  --diffs-line-height: ${lineHeight}px;
  --diffs-bg: var(--background) !important;
  --diffs-light-bg: var(--background) !important;
  --diffs-dark-bg: var(--background) !important;
  --diffs-token-light-bg: transparent;
  --diffs-token-dark-bg: transparent;
  --diffs-bg-context-override: var(--background) !important;
  --diffs-bg-context-number-override: var(--background) !important;
  --diffs-bg-hover-override: color-mix(in srgb, var(--background) 96%, var(--foreground)) !important;
  --diffs-bg-separator-override: color-mix(in srgb, var(--background) 95%, var(--foreground)) !important;
  --diffs-bg-addition-override: color-mix(in srgb, var(--background) 92%, var(--diff-added)) !important;
  --diffs-bg-addition-number-override: color-mix(in srgb, var(--background) 88%, var(--diff-added)) !important;
  --diffs-bg-addition-emphasis-override: color-mix(in srgb, var(--background) 80%, var(--diff-added)) !important;
  --diffs-bg-deletion-override: color-mix(in srgb, var(--background) 92%, var(--diff-removed)) !important;
  --diffs-bg-deletion-number-override: color-mix(in srgb, var(--background) 88%, var(--diff-removed)) !important;
  --diffs-bg-deletion-emphasis-override: color-mix(in srgb, var(--background) 80%, var(--diff-removed)) !important;
  font-family: var(--app-font-code);
  background-color: var(--background);
}
[data-diffs-header] {
  position: sticky;
  top: 0;
  z-index: 4;
  background-color: var(--background) !important;
  border-bottom: 1px solid var(--border) !important;
}
[data-diffs-header="custom"] {
  display: flex !important;
  align-items: center !important;
  min-height: 0 !important;
  padding: 0 !important;
}
::slotted([slot="header-custom"]) {
  display: flex !important;
  width: 100% !important;
  min-width: 0 !important;
  flex: 1 1 auto !important;
}
[data-diff], [data-file], [data-error-wrapper], [data-virtualizer-buffer] {
  --diffs-bg: var(--background) !important;
  font-family: var(--app-font-code) !important;
  font-size: ${fontSize}px !important;
  background-color: var(--background) !important;
}
[data-line-number-content], [data-column-number], [data-unmodified-lines] {
  font-family: var(--font-sans) !important;
  font-variant-numeric: tabular-nums;
}
[data-column-number] {
  padding-left: 1.25ch !important;
}
`
}

function GitDiffHeader({
  file,
  collapsed,
  onToggleCollapsed,
  actions,
}: {
  file: WorkspaceGitDiffFile
  collapsed?: boolean
  onToggleCollapsed?: () => void
  actions?: ReactNode
}) {
  const t = useT()
  const { path, prevPath, additions, deletions } = file
  const separator = path.lastIndexOf("/")
  const directory = separator < 0 ? "" : path.slice(0, separator + 1)
  const filename = path.slice(separator + 1)
  return (
    <div
      data-slot="workspace-git-diff-header"
      data-diff-file-header
      className="flex h-10 w-full min-w-0 items-center gap-1.5 px-3 font-sans text-sm"
      title={prevPath ? `${prevPath} → ${path}` : path}
    >
      <Button
        variant="ghost"
        size="sm"
        className="min-w-0 flex-1 justify-start gap-2 px-0.5 hover:bg-transparent"
        aria-expanded={onToggleCollapsed ? !collapsed : undefined}
        aria-label={path}
        onClick={onToggleCollapsed}
      >
        <WorkspaceGitFileIcon path={path} className="opacity-70" />
        <span className="flex min-w-0 flex-1 items-baseline gap-1.5 overflow-hidden">
          {prevPath && (
            <>
              <span className="max-w-1/3 truncate text-muted-foreground/60 line-through">
                {prevPath.split("/").at(-1)}
              </span>
              <span className="shrink-0 text-muted-foreground/50">→</span>
            </>
          )}
          <span className="min-w-0 truncate font-medium text-foreground/85">
            {filename}
          </span>
          {directory && (
            <span className="min-w-0 truncate text-muted-foreground/60">
              {directory}
            </span>
          )}
        </span>
      </Button>
      {(additions > 0 || deletions > 0) && (
        <span
          className="flex shrink-0 items-center gap-1 text-xs tabular-nums"
          aria-label={t("common.gitDiffLines", {
            added: additions,
            removed: deletions,
          })}
        >
          <span className="text-[var(--diff-added)]">+{additions}</span>
          <span className="text-[var(--diff-removed)]">−{deletions}</span>
        </span>
      )}
      {actions && (
        <span data-diff-header-actions className="inline-flex shrink-0 gap-0.5">
          {actions}
        </span>
      )}
      {onToggleCollapsed && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`${t(collapsed ? "common.expand" : "common.collapse")} ${path}`}
          aria-expanded={!collapsed}
          onClick={onToggleCollapsed}
          className="text-muted-foreground"
        >
          <ChevronDownIcon
            className={cn("transition-transform", collapsed && "-rotate-90")}
          />
        </Button>
      )}
    </div>
  )
}

function FileCard({
  file,
  viewMode,
  wordWrap,
  collapsed,
  onToggleCollapsed,
  actions,
  unsafeCSS,
  fontSize,
  lineHeight,
  resolvedTheme,
}: {
  file: WorkspaceGitDiffFile
  viewMode: "split" | "unified"
  wordWrap: boolean
  collapsed: boolean
  onToggleCollapsed?: () => void
  actions?: ReactNode
  unsafeCSS: string
  fontSize: number
  lineHeight: number
  resolvedTheme: "light" | "dark"
}) {
  const t = useT()
  const header = () => (
    <GitDiffHeader
      file={file}
      collapsed={collapsed}
      onToggleCollapsed={onToggleCollapsed}
      actions={actions}
    />
  )
  return (
    <div
      data-diff-file-path={file.path}
      data-slot="workspace-git-diff-file"
      data-format={file.content.kind === "text" ? viewMode : file.content.kind}
      className="diff-render-file mb-3 overflow-clip rounded-lg border bg-background last:mb-0"
    >
      {file.content.kind === "text" ? (
        <FileDiff
          fileDiff={file.content.file}
          metrics={{
            ...DEFAULT_VIRTUAL_FILE_METRICS,
            lineHeight,
            diffHeaderHeight: 40,
          }}
          options={{
            diffStyle: viewMode,
            lineDiffType: "word",
            overflow: wordWrap ? "wrap" : "scroll",
            theme: resolvedTheme === "dark" ? "github-dark" : "github-light",
            themeType: resolvedTheme,
            unsafeCSS,
            collapsed,
          }}
          renderCustomHeader={header}
        />
      ) : (
        <>
          <div className={cn(!collapsed && "border-b")}>{header()}</div>
          {!collapsed &&
            (file.content.kind === "raw" ? (
              <pre
                className={cn(
                  "max-h-[60vh] overflow-auto p-3 font-mono",
                  wordWrap && "break-words whitespace-pre-wrap"
                )}
                style={{ fontSize, lineHeight: `${lineHeight}px` }}
              >
                {file.content.text}
              </pre>
            ) : (
              <p className="px-5 py-6 text-center text-sm text-muted-foreground">
                {t(
                  file.content.kind === "binary"
                    ? "common.binaryChange"
                    : "common.gitNoTextDiff"
                )}
              </p>
            ))}
        </>
      )}
    </div>
  )
}

export function WorkspaceGitDiff({
  diff,
  path,
  viewMode = "split",
  wordWrap = false,
  collapsedPaths,
  onToggleCollapsed,
  actionsForPath,
  searchQuery,
  containerRef,
}: {
  diff: GitDiff
  path?: string | null
  viewMode?: "split" | "unified"
  wordWrap?: boolean
  collapsedPaths?: ReadonlySet<string>
  onToggleCollapsed?: (path: string) => void
  actionsForPath?: (path: string) => ReactNode
  searchQuery?: string
  containerRef?: Ref<HTMLDivElement>
}) {
  const t = useT()
  const { resolvedTheme } = useTheme()
  const fontSize = usePrefsStore((state) =>
    Math.max(state.codeFontSize, state.uiFontSize)
  )
  const lineHeight = Math.ceil((fontSize * 5) / 3)
  const unsafeCSS = useMemo(
    () => diffCSS(fontSize, lineHeight),
    [fontSize, lineHeight]
  )
  const content = useMemo(
    () => workspaceGitDiffContent(path ? { ...diff, path } : diff),
    [diff, path]
  )
  const search = searchQuery?.trim().toLocaleLowerCase() ?? ""
  const files = content.kind === "files" ? content.files : []
  const visibleFiles = search
    ? files.filter((file) =>
        file.searchText.toLocaleLowerCase().includes(search)
      )
    : files

  if (!diff.repository)
    return (
      <p className="flex flex-1 items-center justify-center px-5 text-sm text-muted-foreground">
        {t("common.gitNotRepository")}
      </p>
    )

  return (
    <div
      ref={containerRef}
      data-slot="workspace-git-diff"
      data-format={
        files.length === 1 && files[0]!.content.kind !== "text"
          ? files[0]!.content.kind
          : content.kind === "empty"
            ? "empty"
            : viewMode
      }
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      {diff.truncated && (
        <p
          role="status"
          className="border-b px-3 py-2 text-xs text-muted-foreground"
        >
          {t("common.gitDiffTruncated")}
        </p>
      )}
      {files.length > 0 && (
        <Virtualizer
          key={`${fontSize}:${viewMode}:${wordWrap}`}
          className="workspace-git-diff-scroll min-h-0 flex-1 overflow-auto overscroll-contain p-3"
          config={{ overscrollSize: 400, intersectionObserverMargin: 600 }}
        >
          {visibleFiles.map((file) => (
            <FileCard
              key={`${file.path}:${resolvedTheme}:${viewMode}`}
              file={file}
              viewMode={viewMode}
              wordWrap={wordWrap}
              collapsed={collapsedPaths?.has(file.path) ?? false}
              onToggleCollapsed={
                onToggleCollapsed
                  ? () => onToggleCollapsed(file.path)
                  : undefined
              }
              actions={actionsForPath?.(file.path)}
              unsafeCSS={unsafeCSS}
              fontSize={fontSize}
              lineHeight={lineHeight}
              resolvedTheme={resolvedTheme}
            />
          ))}
        </Virtualizer>
      )}
      {content.kind === "empty" && (
        <p className="flex flex-1 items-center justify-center px-5 text-center text-sm text-muted-foreground">
          {t("common.gitNoTextDiff")}
        </p>
      )}
    </div>
  )
}
