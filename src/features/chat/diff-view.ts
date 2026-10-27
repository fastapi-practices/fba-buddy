import { parsePatch, structuredPatch, type StructuredPatch } from "diff"

export type DiffSource = {
  path: string
  before?: string | null
  after?: string | null
  patch?: string
  binary?: boolean
}
export type DiffLine = {
  text: string
  kind: "context" | "added" | "removed" | "hunk"
  oldLine?: number
  newLine?: number
}
export type DiffPair = { left?: DiffLine; right?: DiffLine; header?: string }

export function diffLinesForView(source: DiffSource): DiffLine[] | null {
  let patches: StructuredPatch[]
  try {
    if (source.patch) patches = parsePatch(source.patch)
    else {
      const patch = structuredPatch(
        source.path,
        source.path,
        source.before ?? "",
        source.after ?? "",
        undefined,
        undefined,
        { context: 3, maxEditLength: 20000, timeout: 1000 }
      )
      if (!patch) return null
      patches = [patch]
    }
  } catch {
    return null
  }
  const rows: DiffLine[] = []
  for (const patch of patches) {
    for (const hunk of patch.hunks) {
      rows.push({
        kind: "hunk",
        text: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
      })
      let oldLine = hunk.oldStart
      let newLine = hunk.newStart
      for (const line of hunk.lines) {
        if (line.startsWith("\\")) continue
        const text = line.slice(1)
        if (line.startsWith("+"))
          rows.push({ kind: "added", text, newLine: newLine++ })
        else if (line.startsWith("-"))
          rows.push({ kind: "removed", text, oldLine: oldLine++ })
        else
          rows.push({
            kind: "context",
            text,
            oldLine: oldLine++,
            newLine: newLine++,
          })
      }
    }
  }
  return rows
}

export function pairDiffLines(rows: readonly DiffLine[]): DiffPair[] {
  const pairs: DiffPair[] = []
  let removed: DiffLine[] = []
  let added: DiffLine[] = []
  const flush = () => {
    for (let i = 0; i < Math.max(removed.length, added.length); i++)
      pairs.push({ left: removed[i], right: added[i] })
    removed = []
    added = []
  }
  for (const row of rows) {
    if (row.kind === "removed") {
      if (added.length) flush()
      removed.push(row)
    } else if (row.kind === "added") added.push(row)
    else {
      flush()
      pairs.push(
        row.kind === "hunk" ? { header: row.text } : { left: row, right: row }
      )
    }
  }
  flush()
  return pairs
}

export function diffLineMatches(row: DiffLine | undefined, query: string) {
  return Boolean(
    query &&
    row &&
    row.kind !== "hunk" &&
    row.text.toLocaleLowerCase().includes(query.toLocaleLowerCase())
  )
}
