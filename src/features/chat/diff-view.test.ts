import { describe, expect, it } from "vitest"
import { diffLinesForView, pairDiffLines, diffLineMatches } from "./diff-view"

describe("diff views", () => {
  it("keeps real line numbers while aligning unequal replacement blocks", () => {
    const lines = diffLinesForView({
      path: "a.ts",
      before: "same\nold\nend\n",
      after: "same\nnew\nextra\nend\n",
    })!
    expect(lines.find((row) => row.text === "old")).toMatchObject({
      kind: "removed",
      oldLine: 2,
    })
    expect(lines.find((row) => row.text === "extra")).toMatchObject({
      kind: "added",
      newLine: 3,
    })
    const pairs = pairDiffLines(lines)
    expect(pairs.find((row) => row.left?.text === "old")?.right?.text).toBe(
      "new"
    )
    expect(
      pairs.find((row) => row.right?.text === "extra")?.left
    ).toBeUndefined()
    expect(pairs.at(-1)?.left?.oldLine).toBe(3)
    expect(pairs.at(-1)?.right?.newLine).toBe(4)
  })
  it("handles additions, deletions and case insensitive search without hunk matches", () => {
    const added = diffLinesForView({
      path: "new",
      before: null,
      after: "Hello\n",
    })!
    expect(added.at(-1)).toMatchObject({ kind: "added", newLine: 1 })
    expect(diffLineMatches(added.at(-1), "hello")).toBe(true)
    expect(diffLineMatches(added[0], "@@")).toBe(false)
    expect(
      diffLinesForView({ path: "old", before: "Hello\n", after: null })!.at(-1)
    ).toMatchObject({ kind: "removed", oldLine: 1 })
  })
})
