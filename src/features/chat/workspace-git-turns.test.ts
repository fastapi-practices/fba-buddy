import { describe, expect, it } from "vitest"
import type {
  WorkspaceCheckpoint,
  WorkspaceCheckpointFile,
} from "@/shared/workspace"
import { workspaceGitDiffFiles } from "./workspace-git-diff-state"
import { checkpointGitDiff } from "./workspace-git-turns-state"

function checkpoint(files: WorkspaceCheckpointFile[]): WorkspaceCheckpoint {
  return {
    id: "turn-1",
    path: "",
    before: null,
    after: "",
    createdAt: "2026-10-13T08:00:00.000Z",
    kind: "turn",
    files,
  }
}

describe("Git turn diffs", () => {
  it("renders added, deleted, and edited text files with independent statistics", () => {
    const diff = checkpointGitDiff(
      checkpoint([
        {
          path: "new.ts",
          before: null,
          after: "first\nsecond\n",
          afterMode: 0o755,
        },
        { path: "removed.ts", before: "old\n", after: null, mode: 0o644 },
        { path: "edited.ts", before: "before\n", after: "after\n" },
      ])
    )
    const files = workspaceGitDiffFiles(diff)
    expect(diff.additions).toBe(3)
    expect(diff.deletions).toBe(2)
    expect(
      files.map(({ path, additions, deletions, content }) => ({
        path,
        additions,
        deletions,
        kind: content.kind,
        type: content.kind === "text" ? content.file.type : null,
      }))
    ).toEqual([
      { path: "new.ts", additions: 2, deletions: 0, kind: "text", type: "new" },
      {
        path: "removed.ts",
        additions: 0,
        deletions: 1,
        kind: "text",
        type: "deleted",
      },
      {
        path: "edited.ts",
        additions: 1,
        deletions: 1,
        kind: "text",
        type: "change",
      },
    ])
    if (files[0]!.content.kind !== "text") throw new Error("Expected text")
    expect(files[0]!.content.file.mode).toBe("100755")
  })

  it("retains empty added/deleted files and permission-only changes as cards", () => {
    const diff = checkpointGitDiff(
      checkpoint([
        { path: "empty-new.txt", before: null, after: "" },
        { path: "empty-old.txt", before: "", after: null },
        {
          path: "run.sh",
          before: "#!/bin/sh\n",
          after: "#!/bin/sh\n",
          mode: 0o644,
          afterMode: 0o755,
        },
      ])
    )
    const files = workspaceGitDiffFiles(diff)
    expect(
      files.map((file) => ({ path: file.path, kind: file.content.kind }))
    ).toEqual([
      { path: "empty-new.txt", kind: "empty" },
      { path: "empty-old.txt", kind: "empty" },
      { path: "run.sh", kind: "empty" },
    ])
    expect(diff.additions).toBe(0)
    expect(diff.deletions).toBe(0)
    expect(diff.diff).toContain("new file mode 100644")
    expect(diff.diff).toContain("deleted file mode 100644")
    expect(diff.diff).toContain("old mode 100644\nnew mode 100755")
  })

  it("keeps binary changes independent from highlighted text", () => {
    const diff = checkpointGitDiff(
      checkpoint([
        { path: "图像.png", before: "AA==", after: "AQ==", encoding: "base64" },
        {
          path: "新增图片.png",
          before: null,
          after: "AA==",
          encoding: "base64",
        },
        { path: "main.ts", before: "a\n", after: "b\n" },
      ])
    )
    const files = workspaceGitDiffFiles(diff)
    expect(
      files.map((file) => ({ path: file.path, kind: file.content.kind }))
    ).toEqual([
      { path: "图像.png", kind: "binary" },
      { path: "新增图片.png", kind: "binary" },
      { path: "main.ts", kind: "text" },
    ])
    expect(diff.additions).toBe(1)
    expect(diff.deletions).toBe(1)
    expect(files[0]!.binary).toBe(true)
  })

  it("preserves Unicode, spaces, quotes, tabs, and repository prefixes in paths", () => {
    const paths = ["测试 file.ts", 'a/quoted"file.ts', "b/tab\tfile.ts"]
    const diff = checkpointGitDiff(
      checkpoint(
        paths.map((path) => ({
          path,
          before: "before\n",
          after: "after\n",
        }))
      )
    )
    const files = workspaceGitDiffFiles(diff)
    expect(files.map((file) => file.path)).toEqual(paths)
    expect(files.every((file) => file.content.kind === "text")).toBe(true)
    expect(diff.additions).toBe(3)
    expect(diff.deletions).toBe(3)
  })

  it("counts content that resembles patch file headers and has no terminal newline", () => {
    const diff = checkpointGitDiff(
      checkpoint([{ path: "headers.txt", before: "-- old", after: "++ new" }])
    )
    const files = workspaceGitDiffFiles(diff)
    expect(diff.additions).toBe(1)
    expect(diff.deletions).toBe(1)
    expect(files[0]!.content.kind).toBe("text")
    if (files[0]!.content.kind !== "text") throw new Error("Expected text")
    expect(files[0]!.content.file.additionLines).toEqual(["++ new"])
    expect(files[0]!.content.file.deletionLines).toEqual(["-- old"])
  })

  it("omits unchanged or nonexistent files and supports a direct file checkpoint", () => {
    const unchanged = checkpointGitDiff(
      checkpoint([
        { path: "same.ts", before: "same", after: "same" },
        { path: "same.png", before: "AA==", after: "AA==", encoding: "base64" },
        { path: "absent", before: null, after: null },
      ])
    )
    expect(unchanged.diff).toBe("")
    expect(workspaceGitDiffFiles(unchanged)).toEqual([])
    const direct = checkpointGitDiff({
      id: "tool-edit",
      path: "direct.ts",
      before: "before",
      after: "after",
      createdAt: "2026-10-13T08:00:00.000Z",
    })
    expect(workspaceGitDiffFiles(direct)[0]!.path).toBe("direct.ts")
    expect(direct.additions).toBe(1)
    expect(direct.deletions).toBe(1)
  })
})
