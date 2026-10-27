import { randomUUID } from "node:crypto"
import { realpathSync } from "node:fs"
import path from "node:path"
import {
  captureWorkspace,
  recordWorkspaceSnapshot,
} from "./workspace-snapshots"
import { saveCheckpoint, workspaceRestoreActive } from "./workspace-checkpoints"
import type { WorkspaceCheckpoint } from "../src/shared/workspace"

const active = new Map<string, number>()
const writes = new Set<string>()
const revisions = new Map<string, number>()

// Execution prepares use a real path while persisted profiles may retain a
// symlinked workspace path. Keep the lock and revision fence on one key so a
// handoff through either spelling invalidates the same preparation
function workspaceKey(root: string) {
  const resolved = path.resolve(root)
  try {
    return realpathSync.native(resolved)
  } catch {
    return resolved
  }
}

export function workspaceRevision(root: string) {
  return revisions.get(workspaceKey(root)) ?? 0
}

export function invalidateWorkspacePreparations(root: string) {
  const key = workspaceKey(root)
  revisions.set(key, (revisions.get(key) ?? 0) + 1)
}

export function workspaceWriteActive(root: string) {
  return writes.has(workspaceKey(root))
}

export function beginWorkspaceWrite(root: string) {
  const key = workspaceKey(root)
  if (
    workspaceExecutionActive(key) ||
    writes.has(key) ||
    workspaceRestoreActive(key)
  )
    throw new Error("工作区仍有执行、同步或恢复任务，请结束后再试")
  writes.add(key)
  return () => {
    writes.delete(key)
  }
}

export function workspaceExecutionActive(root: string) {
  return (active.get(workspaceKey(root)) ?? 0) > 0
}

export async function beginWorkspaceRun(
  root: string,
  directory?: string,
  expectedRevision?: number
) {
  const key = workspaceKey(root)
  if (
    expectedRevision !== undefined &&
    expectedRevision !== workspaceRevision(key)
  )
    throw new Error("工作区已切换，请重新发送以准备执行")
  if (workspaceExecutionActive(key))
    throw new Error("工作区已有执行任务，请结束后再试")
  if (workspaceRestoreActive(key) || writes.has(key))
    throw new Error("工作区正在恢复或写入")
  active.set(key, (active.get(key) ?? 0) + 1)
  const release = () => {
    const count = (active.get(key) ?? 1) - 1
    if (count > 0) active.set(key, count)
    else active.delete(key)
  }
  const run = { runId: randomUUID(), startedAt: new Date().toISOString() }
  let before: Awaited<ReturnType<typeof captureWorkspace>> | null
  try {
    before = directory ? await captureWorkspace(root) : null
  } catch (error) {
    release()
    throw error
  }
  let finishing: Promise<WorkspaceCheckpoint | null> | undefined
  return {
    finish: () =>
      (finishing ??= (async () => {
        if (!before || !directory) return null
        try {
          return await recordWorkspaceSnapshot(directory, root, before, run)
        } catch (cause) {
          return saveCheckpoint(directory, root, {
            id: randomUUID(),
            path: "",
            before: null,
            after: "",
            files: [],
            kind: "turn",
            incomplete: true,
            createdAt: new Date().toISOString(),
            ...run,
            captureError:
              cause instanceof Error ? cause.message : String(cause),
          })
        }
      })().finally(release)),
  }
}
