import {
  ArrowDownToLineIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  Columns2Icon,
  CopyIcon,
  EllipsisIcon,
  FileDiffIcon,
  FolderClosedIcon,
  FolderOpenIcon,
  FoldersIcon,
  GitCommitHorizontalIcon,
  ListChecksIcon,
  RefreshCwIcon,
  Rows3Icon,
  SearchIcon,
} from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { TooltipHint } from "@/components/ui/tooltip"
import { useT } from "@/hooks/use-t"
import type { WorkspaceGitDiffFile } from "./workspace-git-diff-state"
import { WorkspaceGitFileIcon } from "./workspace-git-file-icon"
import type { useWorkspaceGitSession } from "./workspace-git-provider"
import type { useWorkspaceGitTurns } from "./workspace-git-turns"
import { WorkspaceEngineeringDialog } from "./workspace-engineering-dialog"
import { gitEntryConflict } from "./workspace-git-state"

type Session = NonNullable<ReturnType<typeof useWorkspaceGitSession>>
type Turns = ReturnType<typeof useWorkspaceGitTurns>

export function WorkspaceGitToolbar({
  git,
  openCommit,
  turns,
  files,
  stats,
  viewMode,
  onViewMode,
  wordWrap,
  onWordWrap,
  allCollapsed,
  onCollapseAll,
  fileListOpen,
  onFileList,
  onSelectFile,
  activeFile,
  onNavigate,
  onReload,
  onCopy,
  disabled,
}: {
  git: Session["git"]
  openCommit: () => void
  turns: Turns
  files: WorkspaceGitDiffFile[]
  stats: { additions: number; deletions: number } | null
  viewMode: "split" | "unified"
  onViewMode: (mode: "split" | "unified") => void
  wordWrap: boolean
  onWordWrap: (value: boolean) => void
  allCollapsed: boolean
  onCollapseAll: () => void
  fileListOpen: boolean
  onFileList: () => void
  onSelectFile: (path: string) => void
  activeFile: string | null
  onNavigate: (direction: -1 | 1) => void
  onReload: () => void
  onCopy: () => void
  disabled: boolean
}) {
  const t = useT()
  const [searchOpen, setSearchOpen] = useState(false)
  const staged = git.status?.entries.filter((entry) => entry.staged) ?? []
  const unstaged =
    git.status?.entries.filter(
      (entry) => entry.untracked || entry.worktree !== " "
    ) ?? []
  const scopeLabel = turns.selectedId
    ? t("common.gitTurn", {
        number:
          turns.summaries.length -
          turns.summaries.findIndex((turn) => turn.id === turns.selectedId),
      })
    : t(
        git.diffScope === "staged"
          ? "common.gitStaged"
          : git.diffScope === "unstaged"
            ? "common.gitUnstaged"
            : "common.gitWorkingTree"
      )
  return (
    <div
      data-slot="workspace-git-toolbar"
      className="@container flex shrink-0 flex-wrap items-center gap-1.5 border-b px-3 py-2"
    >
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              className="max-w-full min-w-0 justify-start"
              aria-label={t("common.gitChooseScope")}
              title={scopeLabel}
            />
          }
        >
          <FileDiffIcon data-icon="inline-start" />
          <span className="hidden truncate @xl:inline">{scopeLabel}</span>
          <span className="shrink-0 text-muted-foreground tabular-nums">
            {files.length}
          </span>
          {stats && (
            <span
              data-slot="workspace-git-scope-stats"
              className="flex shrink-0 items-center gap-1 tabular-nums"
            >
              <span className="text-[var(--diff-added)]">
                +{stats.additions}
              </span>
              <span className="text-[var(--diff-removed)]">
                −{stats.deletions}
              </span>
            </span>
          )}
          <ChevronDownIcon data-icon="inline-end" />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-52">
          <DropdownMenuGroup>
            <DropdownMenuLabel>{t("common.gitChooseScope")}</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={turns.selectedId ? "" : git.diffScope}
              onValueChange={(value) => {
                if (
                  value !== "working-tree" &&
                  value !== "staged" &&
                  value !== "unstaged"
                )
                  return
                void turns.select(null)
                git.setDiffScope(value)
              }}
            >
              <DropdownMenuRadioItem value="working-tree">
                <FileDiffIcon />
                {t("common.gitWorkingTree")}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="unstaged">
                <FileDiffIcon />
                {t("common.gitUnstaged")}
                <span className="ml-auto text-muted-foreground">
                  {unstaged.length}
                </span>
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="staged">
                <ListChecksIcon />
                {t("common.gitStaged")}
                <span className="ml-auto text-muted-foreground">
                  {staged.length}
                </span>
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <div
        role="group"
        aria-label={t("common.gitViewOptions")}
        className="ml-auto flex shrink-0 items-center rounded-lg border p-0.5"
      >
        <TooltipHint label={t("common.gitRefreshDiff")}>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("common.gitRefreshDiff")}
            disabled={
              git.loading || git.diffLoading || git.busy || turns.loading
            }
            onClick={onReload}
          >
            <RefreshCwIcon />
          </Button>
        </TooltipHint>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("common.gitViewOptions")}
              />
            }
          >
            <EllipsisIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel>
                {t("common.gitViewOptions")}
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={viewMode}
                onValueChange={(value) => {
                  if (value === "split" || value === "unified")
                    onViewMode(value)
                }}
              >
                <DropdownMenuRadioItem value="split">
                  <Columns2Icon />
                  {t("common.gitSplitView")}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="unified">
                  <Rows3Icon />
                  {t("common.gitUnifiedView")}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuCheckboxItem
                checked={wordWrap}
                onCheckedChange={onWordWrap}
              >
                {t("common.gitWordWrap")}
              </DropdownMenuCheckboxItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem disabled={!files.length} onClick={onCopy}>
                <CopyIcon />
                {t("common.gitCopyDiff")}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!files.length}
                onClick={onCollapseAll}
              >
                {allCollapsed ? <FolderOpenIcon /> : <FolderClosedIcon />}
                {t(
                  allCollapsed ? "common.gitExpandAll" : "common.gitCollapseAll"
                )}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <TooltipHint label={t("common.gitPreviousFile")}>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("common.gitPreviousFile")}
            disabled={!files.length}
            onClick={() => onNavigate(-1)}
          >
            <ChevronUpIcon />
          </Button>
        </TooltipHint>
        <TooltipHint label={t("common.gitNextFile")}>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("common.gitNextFile")}
            disabled={!files.length}
            onClick={() => onNavigate(1)}
          >
            <ChevronDownIcon />
          </Button>
        </TooltipHint>
        <Popover open={searchOpen} onOpenChange={setSearchOpen}>
          <PopoverTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("common.gitSearchFiles")}
                disabled={!files.length}
              />
            }
          >
            <SearchIcon />
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <Command>
              <CommandInput
                placeholder={t("common.gitSearchPlaceholder")}
                aria-label={t("common.gitSearchFiles")}
              />
              <CommandList>
                <CommandEmpty>{t("common.gitNoSearchMatches")}</CommandEmpty>
                <CommandGroup>
                  {files.map((file) => (
                    <CommandItem
                      key={file.path}
                      value={file.path}
                      keywords={[file.searchText]}
                      onSelect={() => {
                        onSelectFile(file.path)
                        setSearchOpen(false)
                      }}
                    >
                      <WorkspaceGitFileIcon path={file.path} />
                      <span className="min-w-0 flex-1 truncate">
                        {file.path}
                      </span>
                      {activeFile === file.path && (
                        <span className="text-muted-foreground">✓</span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <TooltipHint
          label={t(
            fileListOpen ? "common.gitHideFiles" : "common.gitShowFiles"
          )}
        >
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t(
              fileListOpen ? "common.gitHideFiles" : "common.gitShowFiles"
            )}
            aria-pressed={fileListOpen}
            disabled={!files.length}
            onClick={onFileList}
          >
            <FoldersIcon />
          </Button>
        </TooltipHint>
      </div>
      <div
        role="group"
        aria-label={t("common.gitCommit")}
        className="flex shrink-0 items-center rounded-lg border p-0.5"
      >
        <WorkspaceEngineeringDialog target={git.target} />
        <TooltipHint label={t("common.gitCommit")}>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("common.gitCommit")}
            disabled={
              disabled ||
              !staged.length ||
              git.status?.entries.some(gitEntryConflict)
            }
            onClick={openCommit}
          >
            <GitCommitHorizontalIcon />
          </Button>
        </TooltipHint>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("common.gitActions")}
              />
            }
          >
            <ChevronDownIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuGroup>
              <DropdownMenuItem
                disabled={disabled || !unstaged.length}
                onClick={() =>
                  void git.changeStage(
                    unstaged.map((file) => file.path),
                    "unstaged"
                  )
                }
              >
                <ArrowDownToLineIcon />
                {t("common.gitStageAll")}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={disabled || !staged.length}
                onClick={() =>
                  void git.changeStage(
                    staged.map((file) => file.path),
                    "staged"
                  )
                }
              >
                <ListChecksIcon />
                {t("common.gitUnstageAll")}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={disabled} onClick={openCommit}>
                <GitCommitHorizontalIcon />
                {t("common.gitCommit")}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <DropdownMenu
        onOpenChange={(open) => {
          if (open) void turns.loadList()
        }}
      >
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              disabled={!git.target.conversationId}
              aria-label={t("common.gitChooseTurn")}
            />
          }
        >
          <span className="hidden @3xl:inline">{t("common.gitTurns")}</span>
          <Rows3Icon data-icon="inline-start" />
          <ChevronDownIcon data-icon="inline-end" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuGroup>
            <DropdownMenuLabel>{t("common.gitTurns")}</DropdownMenuLabel>
            {turns.listLoading && (
              <DropdownMenuItem disabled>
                {t("common.loading")}
              </DropdownMenuItem>
            )}
            {turns.listError && (
              <DropdownMenuItem onClick={() => void turns.loadList()}>
                {t("common.retry")}
              </DropdownMenuItem>
            )}
            {!turns.listLoading &&
              !turns.listError &&
              !turns.summaries.length && (
                <DropdownMenuItem disabled>
                  {t("common.gitNoTurns")}
                </DropdownMenuItem>
              )}
            {turns.summaries.map((turn, index) => (
              <DropdownMenuItem
                key={turn.id}
                onClick={() => void turns.select(turn.id)}
              >
                <GitCommitHorizontalIcon />
                <span>
                  {t("common.gitTurn", {
                    number: turns.summaries.length - index,
                  })}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {new Date(turn.createdAt).toLocaleString(undefined, {
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
