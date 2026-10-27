import { constants } from "node:fs"
import { lstat, open, readdir, realpath } from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"
import type {
  WorkspaceCheckpoint,
  WorkspaceCheckpointFile,
} from "../src/shared/workspace"
import { workspacePath } from "./workspace-files"
import { saveCheckpoint } from "./workspace-checkpoints"

const OMIT = new Set([
  ".git",
  "node_modules",
  ".venv",
  "venv",
  "__pycache__",
  ".next",
  "dist",
  "build",
  ".codegraph",
])
const MAX_FILE = 2 * 1024 * 1024
const MAX_TOTAL = 64 * 1024 * 1024
type SnapshotFile = { data: string; mode: number }
export type WorkspaceSnapshot = {
  files: Map<string, SnapshotFile>
  omitted: string[]
  incomplete: boolean
}

export async function captureWorkspace(
  root: string
): Promise<WorkspaceSnapshot> {
  const base = await realpath(root)
  const result: WorkspaceSnapshot = {
    files: new Map(),
    omitted: [],
    incomplete: false,
  }
  const folders = [base]
  let total = 0
  let examined = 0
  while (folders.length) {
    const folder = folders.pop()!
    if (++examined > 10000) {
      result.incomplete = true
      result.omitted.push(path.relative(base, folder) || ".")
      continue
    }
    if ((await realpath(folder).catch(() => "")) !== folder) {
      result.incomplete = true
      result.omitted.push(path.relative(base, folder))
      continue
    }
    const entries = await readdir(folder, { withFileTypes: true }).catch(
      () => null
    )
    if (!entries) {
      result.incomplete = true
      result.omitted.push(path.relative(base, folder))
      continue
    }
    for (const entry of entries) {
      const target = path.join(folder, entry.name)
      const relative = path.relative(base, target)
      if (
        entry.name === ".git" ||
        (entry.isDirectory() && OMIT.has(entry.name))
      ) {
        result.omitted.push(relative + (entry.isDirectory() ? "/" : ""))
        continue
      }
      if (entry.isDirectory()) {
        folders.push(target)
        continue
      }
      if (++examined > 10000 || !entry.isFile() || total >= MAX_TOTAL) {
        result.incomplete = true
        result.omitted.push(relative)
        continue
      }
      try {
        await workspacePath(base, relative)
        const file = await open(
          target,
          constants.O_RDONLY | constants.O_NOFOLLOW
        )
        try {
          const stat = await file.stat()
          if (
            !stat.isFile() ||
            stat.nlink !== 1 ||
            stat.size > MAX_FILE ||
            total + stat.size > MAX_TOTAL
          )
            throw new Error("Snapshot limit")
          const bytes = Buffer.alloc(stat.size + 1)
          let length = 0
          while (length < bytes.length) {
            const chunk = await file.read(
              bytes,
              length,
              bytes.length - length,
              length
            )
            if (!chunk.bytesRead) break
            length += chunk.bytesRead
          }
          const after = await file.stat()
          if (
            length !== stat.size ||
            after.mtimeMs !== stat.mtimeMs ||
            after.size !== stat.size ||
            after.ctimeMs !== stat.ctimeMs ||
            after.mode !== stat.mode
          )
            throw new Error("File changed during snapshot")
          const targetStat = await lstat(target)
          await workspacePath(base, relative)
          if (targetStat.ino !== stat.ino || targetStat.dev !== stat.dev)
            throw new Error("File replaced during snapshot")
          result.files.set(relative, {
            data: bytes.subarray(0, length).toString("base64"),
            mode: stat.mode & 0o777,
          })
          total += length
        } finally {
          await file.close()
        }
      } catch {
        result.incomplete = true
        result.omitted.push(relative)
      }
    }
  }
  return result
}

function excluded(file: string, omitted: string[]) {
  return omitted.some(
    (item) =>
      item === "." ||
      file === item ||
      file.startsWith(item.endsWith("/") ? item : item + "/")
  )
}
export async function recordWorkspaceSnapshot(
  directory: string,
  root: string,
  before: WorkspaceSnapshot,
  run?: { runId: string; startedAt: string }
) {
  const after = await captureWorkspace(root)
  const omitted = [...new Set([...before.omitted, ...after.omitted])].sort()
  const files: WorkspaceCheckpointFile[] = []
  for (const file of new Set([...before.files.keys(), ...after.files.keys()])) {
    if (excluded(file, omitted)) continue
    const old = before.files.get(file)
    const next = after.files.get(file)
    if (old?.data === next?.data && old?.mode === next?.mode) continue
    let encoding: "utf8" | "base64" = "utf8"
    let oldText = old?.data ?? null
    let newText = next?.data ?? null
    try {
      const decode = (data: string | null) => {
        if (data === null) return null
        const buffer = Buffer.from(data, "base64")
        if (buffer.includes(0)) throw new Error("Binary")
        return new TextDecoder("utf-8", { fatal: true }).decode(buffer)
      }
      oldText = decode(oldText)
      newText = decode(newText)
    } catch {
      encoding = "base64"
      oldText = old?.data ?? null
      newText = next?.data ?? null
    }
    files.push({
      path: file,
      before: oldText,
      after: newText,
      encoding,
      mode: old?.mode ?? next?.mode,
      afterMode: next?.mode,
    })
  }
  if (!run && !files.length && !before.incomplete && !after.incomplete)
    return null
  const entry: WorkspaceCheckpoint = {
    id: randomUUID(),
    path: files[0]?.path ?? "",
    before: files[0]?.before ?? null,
    after: files[0]?.after ?? "",
    files,
    kind: "turn",
    omitted,
    incomplete: before.incomplete || after.incomplete,
    createdAt: new Date().toISOString(),
    ...run,
  }
  await saveCheckpoint(directory, root, entry)
  return entry
}
