import { parsePatchFiles, type FileDiffMetadata } from "@pierre/diffs"
import type { WorkspaceGitDiff } from "@/shared/workspace"

export type WorkspaceGitDiffFile = {
  path: string
  prevPath?: string
  additions: number
  deletions: number
  binary: boolean
  searchText: string
  content:
    | { kind: "text"; file: FileDiffMetadata }
    | { kind: "empty" | "binary" }
    | { kind: "raw"; text: string }
}

export type WorkspaceGitDiffContent =
  { kind: "empty" } | { kind: "files"; files: WorkspaceGitDiffFile[] }

function decodePatchPath(value: string) {
  const path = value.replace(/^"|"$/g, "")
  if (!path.includes("\\")) return path
  const encoder = new TextEncoder()
  const bytes: number[] = []
  const escapes: Record<string, string> = {
    t: "\t",
    n: "\n",
    r: "\r",
    b: "\b",
    f: "\f",
    '"': '"',
    "\\": "\\",
  }
  let offset = 0
  for (const match of path.matchAll(/\\([0-7]{1,3}|[tnrbf"\\])/g)) {
    bytes.push(...encoder.encode(path.slice(offset, match.index)))
    const escaped = match[1]!
    if (/^[0-7]/.test(escaped)) bytes.push(Number.parseInt(escaped, 8))
    else bytes.push(...encoder.encode(escapes[escaped]!))
    offset = match.index + match[0].length
  }
  bytes.push(...encoder.encode(path.slice(offset)))
  return new TextDecoder().decode(new Uint8Array(bytes))
}

function patchPath(text: string, fallback: string) {
  const renamed = /^rename to (.+)$/m.exec(text)?.[1]
  if (renamed) return decodePatchPath(renamed)
  const header =
    /^diff --git (?:"(?:\\.|[^"])*"|a\/.*?) ("(?:\\.|[^"])*"|b\/.*)$/m.exec(
      text
    )?.[1]
  if (header) return decodePatchPath(header.trim()).replace(/^[ab]\//, "")
  const newName = /^\+\+\+ (.+)$/m.exec(text)?.[1]
  const oldName = /^--- (.+)$/m.exec(text)?.[1]
  const name = newName === "/dev/null" ? oldName : newName
  return name
    ? decodePatchPath(name.split("\t")[0]!).replace(/^[ab]\//, "")
    : fallback
}

function patchStats(text: string) {
  let additions = 0
  let deletions = 0
  let inHunk = false
  for (const line of text.split("\n")) {
    if (line.startsWith("@@")) inHunk = true
    else if (inHunk && line.startsWith("+")) additions += 1
    else if (inHunk && line.startsWith("-")) deletions += 1
  }
  return { additions, deletions }
}

function fileStats(file: FileDiffMetadata) {
  return file.hunks.reduce(
    (stats, hunk) => ({
      additions: stats.additions + hunk.additionLines,
      deletions: stats.deletions + hunk.deletionLines,
    }),
    { additions: 0, deletions: 0 }
  )
}

function parseFileSection(
  text: string,
  fallbackPath: string,
  truncated: boolean
): WorkspaceGitDiffFile[] {
  const path = patchPath(text, fallbackPath)
  const binary =
    /^Binary files |^GIT binary patch/m.test(text) || text.includes("\0")
  const stats = binary ? { additions: 0, deletions: 0 } : patchStats(text)
  const raw = (): WorkspaceGitDiffFile[] => [
    {
      path,
      ...stats,
      binary,
      searchText: `${path}\n${binary ? "" : text}`,
      content: binary ? { kind: "binary" } : { kind: "raw", text },
    },
  ]
  if (binary || truncated) return raw()
  try {
    const files = parsePatchFiles(text, undefined, true).flatMap(
      (patch) => patch.files
    )
    if (!files.length) return raw()
    if (/^@@/m.test(text) && !files.some((file) => file.hunks.length))
      return raw()
    if (
      !files.some((file) => file.hunks.length) &&
      !/^(?:old mode|new mode|new file mode|deleted file mode|rename from|rename to|copy from|copy to|similarity index|dissimilarity index) /m.test(
        text
      )
    )
      return raw()
    return files.map((file) => {
      const filePath = decodePatchPath(file.name)
      const prevPath = file.prevName
        ? decodePatchPath(file.prevName)
        : undefined
      return {
        path: filePath,
        ...(prevPath && prevPath !== filePath ? { prevPath } : {}),
        ...fileStats(file),
        binary: false,
        searchText: `${filePath}\n${prevPath ?? ""}\n${file.deletionLines.join("")}${file.additionLines.join("")}`,
        content: file.hunks.length
          ? {
              kind: "text",
              file: { ...file, name: filePath, prevName: prevPath },
            }
          : { kind: "empty" },
      }
    })
  } catch {
    return raw()
  }
}

export function workspaceGitDiffFiles(
  diff: WorkspaceGitDiff
): WorkspaceGitDiffFile[] {
  if (!diff.diff.trim()) return []
  const sections = diff.diff
    .split(/(?=^diff --git )/m)
    .filter((text) => text.trim())
  return sections.flatMap((text, index) =>
    parseFileSection(
      text,
      diff.path ?? "diff",
      diff.truncated && index === sections.length - 1
    )
  )
}

export function workspaceGitDiffContent(
  diff: WorkspaceGitDiff
): WorkspaceGitDiffContent {
  const files = workspaceGitDiffFiles(diff)
  return files.length ? { kind: "files", files } : { kind: "empty" }
}
