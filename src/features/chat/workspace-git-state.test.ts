import { describe, expect, it } from "vitest"
import { gitEntryConflict, gitEntryGroups } from "./workspace-git-state"
import type { WorkspaceGitStatusEntry } from "@/shared/workspace"

function entry(
  path: string,
  index: string,
  worktree: string
): WorkspaceGitStatusEntry {
  return {
    path,
    index,
    worktree,
    staged: index !== " " && index !== "?",
    untracked: index === "?",
  }
}

describe("Git file groups", () => {
  it("shows files modified in both the index and worktree in each group", () => {
    const both = entry("both.ts", "M", "M")
    const staged = entry("staged.ts", "A", " ")
    const working = entry("working.ts", " ", "D")
    const untracked = entry("new.ts", "?", "?")
    expect(gitEntryGroups([both, staged, working, untracked])).toEqual({
      staged: [both, staged],
      unstaged: [both, working, untracked],
    })
  })

  it("does not present conflict entries as committable staged changes", () => {
    const conflicts = [
      entry("deleted", "D", "D"),
      entry("added", "A", "A"),
      entry("updated", "U", "U"),
    ]
    expect(conflicts.every(gitEntryConflict)).toBe(true)
    expect(gitEntryGroups(conflicts)).toEqual({
      staged: [],
      unstaged: conflicts,
    })
  })
})
