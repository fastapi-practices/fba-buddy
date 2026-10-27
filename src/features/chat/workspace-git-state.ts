import type { WorkspaceGitStatusEntry } from "@/shared/workspace"

export type GitScope = "staged" | "unstaged"

export function gitEntryConflict(entry: WorkspaceGitStatusEntry) {
  return (
    entry.index === "U" ||
    entry.worktree === "U" ||
    ["AA", "DD"].includes(entry.index + entry.worktree)
  )
}

export function gitEntryGroups(entries: readonly WorkspaceGitStatusEntry[]) {
  return {
    staged: entries.filter((entry) => entry.staged && !gitEntryConflict(entry)),
    unstaged: entries.filter(
      (entry) =>
        entry.untracked || entry.worktree !== " " || gitEntryConflict(entry)
    ),
  }
}
