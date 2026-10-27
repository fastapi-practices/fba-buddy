import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  symlink,
  chmod,
  stat,
} from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import {
  checkpointBefore,
  recordCheckpoint,
  restoreCheckpoint,
  readCheckpoint,
  restoreCheckpoints,
  saveCheckpoint,
} from "./workspace-checkpoints"
import { readWorkspaceFile, workspacePath } from "./workspace-files"
import {
  captureWorkspace,
  recordWorkspaceSnapshot,
} from "./workspace-snapshots"

describe("workspace checkpoints", () => {
  let directory: string, root: string, store: string
  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "buddy-checkpoint-"))
    root = path.join(directory, "workspace")
    store = path.join(directory, "checkpoints")
    await mkdir(root)
  })
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })
  it("restores an exact write and preserves executable mode", async () => {
    const file = path.join(root, "run.sh")
    await writeFile(file, "echo old\n")
    await chmod(file, 0o755)
    const before = await checkpointBefore(root, "run.sh")
    await writeFile(file, "echo new\n")
    const entry = await recordCheckpoint(store, root, "run.sh", before)
    await restoreCheckpoint(store, root, entry.id)
    expect(await readFile(file, "utf8")).toBe("echo old\n")
    expect((await stat(file)).mode & 0o777).toBe(0o755)
    expect((await readCheckpoint(store, root, entry.id)).restored).toBe(true)
    await expect(restoreCheckpoint(store, root, entry.id)).rejects.toThrow(
      "已撤销"
    )
  })
  it("refuses to overwrite edits made after the checkpoint", async () => {
    await writeFile(path.join(root, "a.txt"), "agent")
    const entry = await recordCheckpoint(store, root, "a.txt", "before")
    await writeFile(path.join(root, "a.txt"), "human")
    await expect(restoreCheckpoint(store, root, entry.id)).rejects.toThrow(
      "后续修改"
    )
    expect(await readFile(path.join(root, "a.txt"), "utf8")).toBe("human")
  })
  it("undoes newly created files only if unchanged", async () => {
    expect(await checkpointBefore(root, "new.txt")).toBeNull()
    await writeFile(path.join(root, "new.txt"), "new")
    const entry = await recordCheckpoint(store, root, "new.txt", null)
    await restoreCheckpoint(store, root, entry.id)
    await expect(readFile(path.join(root, "new.txt"))).rejects.toMatchObject({
      code: "ENOENT",
    })
  })
  it("rejects outside paths, symlinks, malformed checkpoint ids and binary data", async () => {
    await writeFile(path.join(directory, "outside.txt"), "private")
    await symlink(
      path.join(directory, "outside.txt"),
      path.join(root, "link.txt")
    )
    await expect(workspacePath(root, "../outside.txt")).rejects.toThrow()
    await expect(readWorkspaceFile(root, "link.txt")).rejects.toThrow()
    await expect(
      readCheckpoint(store, root, "../outside.txt")
    ).rejects.toThrow()
    await writeFile(path.join(root, "binary.dat"), Buffer.from([255, 254, 123]))
    await expect(checkpointBefore(root, "binary.dat")).rejects.toThrow()
  })
  it("binds checkpoints to the original workspace", async () => {
    await writeFile(path.join(root, "a.txt"), "after")
    const entry = await recordCheckpoint(store, root, "a.txt", "before")
    const other = path.join(directory, "other")
    await mkdir(other)
    await expect(readCheckpoint(store, other, entry.id)).rejects.toMatchObject({
      code: "ENOENT",
    })
  })
  it("prevalidates every file before batch restore and rolls back a failing commit", async () => {
    await writeFile(path.join(root, "a"), "a1")
    await writeFile(path.join(root, "b"), "b1")
    const a = await recordCheckpoint(store, root, "a", "a0")
    const b = await recordCheckpoint(store, root, "b", "b0")
    await writeFile(path.join(root, "b"), "human")
    await expect(restoreCheckpoints(store, root, [a.id, b.id])).rejects.toThrow(
      "后续修改"
    )
    expect(await readFile(path.join(root, "a"), "utf8")).toBe("a1")
    await writeFile(path.join(root, "b"), "b1")
    await expect(
      restoreCheckpoints(store, root, [a.id, b.id], async () => {
        throw new Error("history write failed")
      })
    ).rejects.toThrow("history write failed")
    expect(await readFile(path.join(root, "a"), "utf8")).toBe("a1")
    expect(await readFile(path.join(root, "b"), "utf8")).toBe("b1")
    expect((await readCheckpoint(store, root, a.id)).restored).toBeUndefined()
  })
  it("restores command changes, deletion and binary bytes from one turn snapshot", async () => {
    await writeFile(path.join(root, "removed"), "old")
    await writeFile(path.join(root, "binary"), Buffer.from([0, 255, 1]))
    const before = await captureWorkspace(root)
    await rm(path.join(root, "removed"))
    await writeFile(path.join(root, "binary"), Buffer.from([0, 254, 2]))
    await mkdir(path.join(root, "nested"))
    await writeFile(path.join(root, "nested/new"), "created")
    const entry = await recordWorkspaceSnapshot(store, root, before)
    expect(entry?.files).toHaveLength(3)
    expect(entry?.files?.find((file) => file.path === "binary")?.encoding).toBe(
      "base64"
    )
    await restoreCheckpoint(store, root, entry!.id)
    expect(await readFile(path.join(root, "removed"), "utf8")).toBe("old")
    expect(await readFile(path.join(root, "binary"))).toEqual(
      Buffer.from([0, 255, 1])
    )
    await expect(readFile(path.join(root, "nested/new"))).rejects.toMatchObject(
      { code: "ENOENT" }
    )
  })
  it("does not misidentify an omitted preexisting file as newly created", async () => {
    await writeFile(path.join(root, "large"), Buffer.alloc(2 * 1024 * 1024 + 1))
    const before = await captureWorkspace(root)
    await writeFile(path.join(root, "large"), "now small")
    expect(await recordWorkspaceSnapshot(store, root, before)).toMatchObject({
      files: [],
      incomplete: true,
      omitted: ["large"],
    })
  })
  it("retains an incomplete empty snapshot, while normal excluded directories do not block restore", async () => {
    await mkdir(path.join(root, ".git"))
    await mkdir(path.join(root, "node_modules"))
    await writeFile(path.join(root, "file"), "old")
    const before = await captureWorkspace(root)
    expect(before.incomplete).toBe(false)
    await writeFile(path.join(root, "file"), "new")
    const entry = await recordWorkspaceSnapshot(store, root, before)
    expect(entry).toMatchObject({
      incomplete: false,
      omitted: [".git/", "node_modules/"],
    })
    await restoreCheckpoints(store, root, [entry!.id])
    expect(await readFile(path.join(root, "file"), "utf8")).toBe("old")
  })
  it("refuses to overwrite later permission changes", async () => {
    await writeFile(path.join(root, "script"), "old")
    await chmod(path.join(root, "script"), 0o644)
    const before = await captureWorkspace(root)
    await writeFile(path.join(root, "script"), "new")
    const entry = await recordWorkspaceSnapshot(store, root, before)
    await chmod(path.join(root, "script"), 0o755)
    await expect(restoreCheckpoints(store, root, [entry!.id])).rejects.toThrow(
      "权限已有后续修改"
    )
    expect(await readFile(path.join(root, "script"), "utf8")).toBe("new")
  })
  it("never snapshots or restores a linked worktree Git pointer", async () => {
    const pointer = path.join(root, ".git")
    await writeFile(pointer, "gitdir: /source/.git/worktrees/task\n")
    await writeFile(path.join(root, "file"), "old")
    const before = await captureWorkspace(root)
    expect(before.files.has(".git")).toBe(false)
    expect(before.incomplete).toBe(false)
    await writeFile(pointer, "gitdir: /source/.git/worktrees/changed\n")
    await writeFile(path.join(root, "file"), "new")
    const entry = await recordWorkspaceSnapshot(store, root, before)
    expect(entry).toMatchObject({ incomplete: false, omitted: [".git"] })
    expect(entry!.files!.map((file) => file.path)).toEqual(["file"])
    await restoreCheckpoints(store, root, [entry!.id])
    expect(await readFile(pointer, "utf8")).toContain("/changed")
    expect(await readFile(path.join(root, "file"), "utf8")).toBe("old")
  })
  it("restores same-path chains in reverse input order when timestamps tie", async () => {
    const timestamp = "2026-10-10T00:00:00.000Z"
    const first = {
      id: "11111111-1111-4111-8111-111111111111",
      path: "file",
      before: "zero",
      after: "one",
      createdAt: timestamp,
    }
    const second = {
      id: "22222222-2222-4222-8222-222222222222",
      path: "file",
      before: "one",
      after: "two",
      createdAt: timestamp,
    }
    await saveCheckpoint(store, root, first)
    await saveCheckpoint(store, root, second)
    await writeFile(path.join(root, "file"), "two")
    await restoreCheckpoints(store, root, [first.id, second.id])
    expect(await readFile(path.join(root, "file"), "utf8")).toBe("zero")
  })
})
