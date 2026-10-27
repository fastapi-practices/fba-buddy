import { mkdir, mkdtemp, realpath, rm, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it } from "vitest"
import {
  beginWorkspaceRun,
  beginWorkspaceWrite,
  invalidateWorkspacePreparations,
  workspaceExecutionActive,
  workspaceRevision,
  workspaceWriteActive,
} from "./workspace-run"

let directory: string
let root: string
let alias: string
let run: Awaited<ReturnType<typeof beginWorkspaceRun>> | undefined
let releaseWrite: (() => void) | undefined

beforeEach(async () => {
  directory = await realpath(
    await mkdtemp(path.join(tmpdir(), "buddy-workspace-lock-"))
  )
  root = path.join(directory, "workspace")
  alias = path.join(directory, "alias")
  await mkdir(root)
  await symlink(root, alias, "dir")
})

afterEach(async () => {
  releaseWrite?.()
  await run?.finish()
  releaseWrite = undefined
  run = undefined
  await rm(directory, { recursive: true, force: true })
})

it("invalidates prepared revisions through either spelling of a workspace", async () => {
  const preparedRevision = workspaceRevision(root)
  invalidateWorkspacePreparations(alias)
  expect(workspaceRevision(root)).toBe(preparedRevision + 1)
  await expect(
    beginWorkspaceRun(root, undefined, preparedRevision)
  ).rejects.toThrow("工作区已切换")
  run = await beginWorkspaceRun(alias, undefined, workspaceRevision(root))
  expect(workspaceExecutionActive(root)).toBe(true)
})

it("shares execution and write locks across real and symlinked paths", async () => {
  run = await beginWorkspaceRun(alias)
  await expect(beginWorkspaceRun(root)).rejects.toThrow("已有执行")
  expect(() => beginWorkspaceWrite(root)).toThrow("仍有执行")
  await run.finish()
  expect(workspaceExecutionActive(alias)).toBe(false)
  releaseWrite = beginWorkspaceWrite(alias)
  expect(workspaceWriteActive(root)).toBe(true)
  expect(() => beginWorkspaceWrite(root)).toThrow("仍有执行")
  await expect(beginWorkspaceRun(root)).rejects.toThrow("正在恢复或写入")
  releaseWrite()
  expect(workspaceWriteActive(alias)).toBe(false)
})
