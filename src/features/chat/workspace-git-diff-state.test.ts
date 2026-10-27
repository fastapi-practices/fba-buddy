import { describe, expect, it } from "vitest"
import type { WorkspaceGitDiff } from "@/shared/workspace"
import {
  workspaceGitDiffContent,
  workspaceGitDiffFiles,
} from "./workspace-git-diff-state"

function diff(patch: string, truncated = false): WorkspaceGitDiff {
  return {
    repository: true,
    path: "src/example.ts",
    diff: patch,
    additions: 1,
    deletions: 1,
    truncated,
  }
}

const patch = [
  "diff --git a/src/example.ts b/src/example.ts",
  "index 1234567..7654321 100644",
  "--- a/src/example.ts",
  "+++ b/src/example.ts",
  "@@ -1 +1 @@",
  "-const message = 'before'",
  "+const message = 'after'",
  "",
].join("\n")

describe("Git diff rendering", () => {
  it("parses a textual Git patch for the highlighted diff renderer", () => {
    const content = workspaceGitDiffContent(diff(patch))
    expect(content.kind).toBe("files")
    if (content.kind !== "files") throw new Error("Expected parsed files")
    expect(content.files).toHaveLength(1)
    const file = content.files[0]!
    expect(file.path).toBe("src/example.ts")
    expect(file.additions).toBe(1)
    expect(file.deletions).toBe(1)
    if (file.content.kind !== "text") throw new Error("Expected parsed text")
    expect(file.content.file.hunks).toHaveLength(1)
  })

  it("preserves a truncated patch as raw text", () => {
    expect(workspaceGitDiffFiles(diff(patch, true))[0]!.content).toEqual({
      kind: "raw",
      text: patch,
    })
  })

  it("shows binary notices without sending binary patches to the text parser", () => {
    expect(
      workspaceGitDiffFiles(
        diff(
          "diff --git a/image.png b/image.png\nBinary files a/image.png and b/image.png differ\n"
        )
      )[0]!.content
    ).toEqual({ kind: "binary" })
    expect(
      workspaceGitDiffFiles(diff("GIT binary patch\nliteral 4\n"))[0]!.content
    ).toEqual({
      kind: "binary",
    })
    expect(workspaceGitDiffFiles(diff("invalid\0text"))[0]!.content).toEqual({
      kind: "binary",
    })
  })

  it("preserves malformed patch content and marks empty diffs explicitly", () => {
    const malformed = "diff --git a/example.ts b/example.ts\n@@ broken hunk\n"
    expect(workspaceGitDiffFiles(diff(malformed))[0]!.content).toEqual({
      kind: "raw",
      text: malformed,
    })
    expect(workspaceGitDiffContent(diff(" \n"))).toEqual({ kind: "empty" })
  })

  it("retains permission-only files in the multi-file list", () => {
    const files = workspaceGitDiffFiles(
      diff(
        "diff --git a/example.sh b/example.sh\nold mode 100644\nnew mode 100755\n"
      )
    )
    expect(files).toHaveLength(1)
    expect(files[0]).toMatchObject({
      path: "example.sh",
      content: { kind: "empty" },
    })
  })

  it("keeps text, binary, and mode changes as separate cards with per-file stats", () => {
    const added = [
      "diff --git a/new.ts b/new.ts",
      "new file mode 100644",
      "--- /dev/null",
      "+++ b/new.ts",
      "@@ -0,0 +1,2 @@",
      "+export const first = 1",
      "+export const second = 2",
      "",
    ].join("\n")
    const binary =
      "diff --git a/image.png b/image.png\nBinary files a/image.png and b/image.png differ\n"
    const mode =
      "diff --git a/run.sh b/run.sh\nold mode 100644\nnew mode 100755\n"
    const files = workspaceGitDiffFiles(diff(patch + binary + added + mode))
    expect(
      files.map(({ path, additions, deletions, content }) => ({
        path,
        additions,
        deletions,
        kind: content.kind,
      }))
    ).toEqual([
      { path: "src/example.ts", additions: 1, deletions: 1, kind: "text" },
      { path: "image.png", additions: 0, deletions: 0, kind: "binary" },
      { path: "new.ts", additions: 2, deletions: 0, kind: "text" },
      { path: "run.sh", additions: 0, deletions: 0, kind: "empty" },
    ])
    expect(files[0]!.searchText).toContain("before")
    expect(files[0]!.searchText).toContain("after")
    expect(files[1]!.binary).toBe(true)
  })

  it("preserves highlighted files before malformed or truncated trailing content", () => {
    const incomplete = [
      "diff --git a/incomplete.ts b/incomplete.ts",
      "--- a/incomplete.ts",
      "+++ b/incomplete.ts",
      "@@ -1,2 +1,2 @@",
      "-before",
      "+after",
    ].join("\n")
    for (const truncated of [false, true]) {
      const files = workspaceGitDiffFiles(diff(patch + incomplete, truncated))
      expect(files.map((file) => file.content.kind)).toEqual(["text", "raw"])
      expect(files[1]!.content).toEqual({ kind: "raw", text: incomplete })
    }
  })

  it("preserves rename paths and decodes Git quoted Unicode paths", () => {
    const rename =
      "diff --git a/old.ts b/new.ts\nsimilarity index 100%\nrename from old.ts\nrename to new.ts\n"
    const quoted = patch
      .replaceAll(
        "a/src/example.ts",
        '"a/\\346\\265\\213\\350\\257\\225 file.ts"'
      )
      .replaceAll(
        "b/src/example.ts",
        '"b/\\346\\265\\213\\350\\257\\225 file.ts"'
      )
    const files = workspaceGitDiffFiles(diff(rename + quoted))
    expect(files[0]).toMatchObject({
      path: "new.ts",
      prevPath: "old.ts",
      content: { kind: "empty" },
    })
    expect(files[1]!.path).toBe("测试 file.ts")
    if (files[1]!.content.kind !== "text")
      throw new Error("Expected parsed text")
    expect(files[1]!.content.file.name).toBe("测试 file.ts")
  })

  it("keeps repository directories named a and b when resolving parsed paths", () => {
    for (const directory of ["a", "b"]) {
      const nested = patch.replaceAll(
        "src/example.ts",
        `${directory}/example.ts`
      )
      expect(workspaceGitDiffFiles(diff(nested))[0]!.path).toBe(
        `${directory}/example.ts`
      )
      expect(workspaceGitDiffFiles(diff(nested, true))[0]!.path).toBe(
        `${directory}/example.ts`
      )
    }
  })
})
