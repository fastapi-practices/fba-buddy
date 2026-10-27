import { createHash, randomUUID } from "node:crypto"
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises"
import { constants } from "node:fs"
import path from "node:path"
import type {
  WorkspaceCheckpoint,
  WorkspaceCheckpointFile,
  WorkspaceCheckpointSummary,
} from "../src/shared/workspace"
import { readWorkspaceFile, workspacePath } from "./workspace-files"

const bucket = (directory: string, root: string) =>
  path.join(directory, createHash("sha256").update(root).digest("hex"))
export async function checkpointBefore(root: string, input: string) {
  await workspacePath(root, input, true)
  try {
    return (await readWorkspaceFile(root, input, 1024 * 1024)).content
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
    throw error
  }
}
export async function recordCheckpoint(
  directory: string,
  root: string,
  input: string,
  before: string | null
) {
  const after = await readWorkspaceFile(root, input, 1024 * 1024)
  const entry: WorkspaceCheckpoint = {
    id: randomUUID(),
    path: after.path,
    before,
    after: after.content,
    createdAt: new Date().toISOString(),
  }
  await saveCheckpoint(directory, root, entry)
  return entry
}
export async function saveCheckpoint(
  directory: string,
  root: string,
  entry: WorkspaceCheckpoint
) {
  const folder = bucket(directory, root)
  await mkdir(folder, { recursive: true, mode: 0o700 })
  await writeFile(
    path.join(folder, entry.id + ".json"),
    JSON.stringify(entry),
    { mode: 0o600, flag: "wx" }
  )
  await saveCheckpointSummary(directory, root, entry)
  return entry
}
async function saveCheckpointSummary(
  directory: string,
  root: string,
  entry: WorkspaceCheckpoint
) {
  const summary: WorkspaceCheckpointSummary = {
    id: entry.id,
    createdAt: entry.createdAt,
    kind: entry.kind,
    restored: entry.restored,
    incomplete: entry.incomplete,
    runId: entry.runId,
    startedAt: entry.startedAt,
    captureError: entry.captureError,
    fileCount: entry.files?.length ?? 1,
    omittedCount: entry.omitted?.length ?? 0,
  }
  await writeFile(
    path.join(bucket(directory, root), entry.id + ".summary.json"),
    JSON.stringify(summary),
    { mode: 0o600 }
  )
}

export async function listCheckpoints(
  directory: string,
  root: string
): Promise<WorkspaceCheckpointSummary[]> {
  const folder = bucket(directory, root)
  const names = await readdir(folder).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
    throw error
  })
  const entries: WorkspaceCheckpointSummary[] = []
  for (const name of names.filter((name) =>
    /^[0-9a-f-]{36}\.summary\.json$/.test(name)
  )) {
    const content = await readFile(path.join(folder, name), "utf8")
    if (Buffer.byteLength(content) > 65536) throw new Error("快照索引过大")
    const entry = JSON.parse(content) as WorkspaceCheckpointSummary
    if (entry.id + ".summary.json" !== name) throw new Error("快照索引无效")
    entries.push(entry)
  }
  return entries
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 100)
}
export async function readCheckpoint(
  directory: string,
  root: string,
  id: string
): Promise<WorkspaceCheckpoint> {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("变更记录无效")
  return JSON.parse(
    await readFile(path.join(bucket(directory, root), id + ".json"), "utf8")
  ) as WorkspaceCheckpoint
}

const locks = new Set<string>()
export const workspaceRestoreActive = (root: string) => locks.has(root)
const bytes = (value: string | null, encoding?: string) =>
  value === null
    ? null
    : Buffer.from(value, encoding === "base64" ? "base64" : "utf8")
const equal = (left: Buffer | null, right: Buffer | null) =>
  left === null || right === null ? left === right : left.equals(right)
async function readCurrent(
  root: string,
  input: string
): Promise<Buffer | null> {
  try {
    const target = await workspacePath(root, input)
    const file = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW)
    try {
      const stat = await file.stat()
      if (!stat.isFile() || stat.nlink !== 1 || stat.size > 2 * 1024 * 1024)
        throw new Error("文件不适合安全恢复")
      const data = Buffer.alloc(stat.size + 1)
      let length = 0
      while (length < data.length) {
        const chunk = await file.read(
          data,
          length,
          data.length - length,
          length
        )
        if (!chunk.bytesRead) break
        length += chunk.bytesRead
      }
      if (length !== stat.size) throw new Error("文件正在修改")
      return data.subarray(0, length)
    } finally {
      await file.close()
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
    throw error
  }
}
async function replaceFile(
  root: string,
  input: string,
  value: Buffer | null,
  mode: number
) {
  const target = await workspacePath(root, input, true)
  if (value === null) {
    await rm(target, { force: true })
    return
  }
  await mkdir(path.dirname(target), { recursive: true })
  await workspacePath(root, input, true)
  const temporary = path.join(
    path.dirname(target),
    `.buddy-restore-${randomUUID()}`
  )
  try {
    const file = await open(
      temporary,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600
    )
    try {
      await file.writeFile(value)
      await file.chmod(mode)
      await file.sync()
    } finally {
      await file.close()
    }
    await workspacePath(root, input, true)
    await rename(temporary, target)
  } finally {
    await rm(temporary, { force: true })
  }
}

export async function restoreCheckpoints(
  directory: string,
  root: string,
  ids: string[],
  commit?: () => Promise<void>
) {
  if (!ids.length || ids.length > 500 || new Set(ids).size !== ids.length)
    throw new Error("变更记录无效")
  if (locks.has(root)) throw new Error("工作区正在恢复")
  locks.add(root)
  try {
    const order = new Map(ids.map((id, index) => [id, index]))
    const entries = (
      await Promise.all(ids.map((id) => readCheckpoint(directory, root, id)))
    ).sort(
      (a, b) =>
        b.createdAt.localeCompare(a.createdAt) ||
        order.get(b.id)! - order.get(a.id)!
    )
    if (entries.some((entry) => entry.restored)) throw new Error("此变更已撤销")
    const states = new Map<
      string,
      {
        original: Buffer | null
        target: Buffer | null
        mode: number
        originalMode: number
      }
    >()
    // 先在内存中模拟整个恢复链，任何文件冲突都不会修改工作区
    for (const entry of entries) {
      const files: WorkspaceCheckpointFile[] = entry.files ?? [entry]
      for (const file of files) {
        const target = await workspacePath(root, file.path, true)
        let state = states.get(file.path)
        if (!state) {
          const original = await readCurrent(root, file.path)
          const mode = (await lstat(target).catch(() => null))?.mode ?? 0o644
          state = {
            original,
            target: original,
            mode: mode & 0o777,
            originalMode: mode & 0o777,
          }
          states.set(file.path, state)
        }
        if (!equal(state.target, bytes(file.after, file.encoding)))
          throw new Error(`文件已有后续修改，无法安全撤销：${file.path}`)
        if (
          file.after !== null &&
          file.afterMode !== undefined &&
          state.mode !== file.afterMode
        )
          throw new Error(`文件权限已有后续修改，无法安全撤销：${file.path}`)
        state.target = bytes(file.before, file.encoding)
        state.mode = file.mode ?? state.mode
      }
    }
    const applied: string[] = []
    const marked: WorkspaceCheckpoint[] = []
    try {
      for (const [file, state] of states) {
        if (!equal(await readCurrent(root, file), state.original))
          throw new Error(`文件正在修改：${file}`)
        const currentMode = (
          await lstat(await workspacePath(root, file, true)).catch(() => null)
        )?.mode
        if (
          state.original !== null &&
          currentMode !== undefined &&
          (currentMode & 0o777) !== state.originalMode
        )
          throw new Error(`文件权限正在修改：${file}`)
        await replaceFile(root, file, state.target, state.mode)
        applied.push(file)
      }
      for (const entry of entries) {
        entry.restored = true
        await writeFile(
          path.join(bucket(directory, root), entry.id + ".json"),
          JSON.stringify(entry),
          { mode: 0o600 }
        )
        marked.push(entry)
        await saveCheckpointSummary(directory, root, entry)
      }
      await commit?.()
    } catch (cause) {
      const failures: string[] = []
      for (const file of applied.reverse()) {
        const state = states.get(file)!
        try {
          if (!equal(await readCurrent(root, file), state.target))
            throw new Error("文件已有外部修改", { cause })
          if (
            state.target !== null &&
            ((await lstat(await workspacePath(root, file))).mode & 0o777) !==
              state.mode
          )
            throw new Error("文件权限已有外部修改", { cause })
          await replaceFile(root, file, state.original, state.originalMode)
        } catch {
          failures.push(file)
        }
      }
      for (const entry of marked) {
        delete entry.restored
        await writeFile(
          path.join(bucket(directory, root), entry.id + ".json"),
          JSON.stringify(entry),
          { mode: 0o600 }
        ).catch(() => {
          failures.push(entry.id)
        })
        await saveCheckpointSummary(directory, root, entry).catch(() => {
          failures.push(entry.id)
        })
      }
      if (failures.length)
        throw new Error(
          `恢复失败，以下项目需要手动检查：${failures.join("、")}`,
          { cause }
        )
      throw cause
    }
    return entries
  } finally {
    locks.delete(root)
  }
}

export async function restoreCheckpoint(
  directory: string,
  root: string,
  id: string
) {
  return (await restoreCheckpoints(directory, root, [id]))[0]!
}
