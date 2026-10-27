import { createHash } from "node:crypto"
import {
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import {
  createExecutionSession,
  workspaceExecutionActive,
  type ExecutionSession,
} from "./execution"
import {
  listCheckpoints,
  readCheckpoint,
  restoreCheckpoint,
} from "./workspace-checkpoints"

// 保留真实进程与文件操作，仅用宿主适配替换平台沙箱启动
vi.mock("./execution-isolation", async (original) => {
  const actual = await original<typeof import("./execution-isolation")>()
  return {
    ...actual,
    resolveLocalIsolation: vi.fn(async () => ({
      kind: "seatbelt",
      executable: "/usr/bin/sandbox-exec",
      shell: "/bin/bash",
      node: process.execPath,
      readRoots: [],
    })),
    createLocalLaunch: vi.fn(
      async (_isolation, cwd, _permission, executable, args, env) => ({
        executable,
        args,
        cwd,
        env: { PATH: "/usr/bin:/bin", ...env },
      })
    ),
  }
})
let directory: string
let root: string
let checkpoints: string
let session: ExecutionSession | undefined
beforeEach(async () => {
  directory = await realpath(
    await mkdtemp(path.join(tmpdir(), "buddy-run-recovery-"))
  )
  root = path.join(directory, "workspace")
  checkpoints = path.join(directory, "checkpoints")
  await mkdir(root)
  await writeFile(path.join(root, "tracked.txt"), "before\n")
})
afterEach(async () => {
  await session?.stop()
  await rm(directory, { recursive: true, force: true })
  session = undefined
})
const start = () =>
  createExecutionSession({
    backend: "local",
    workspaceDir: root,
    runtimeDirectory: "/managed",
    permissionMode: "default",
    checkpointDirectory: checkpoints,
  })

it("persists an explicit incomplete record if the workspace disappears before final capture", async () => {
  session = await start()
  await rm(root, { recursive: true })
  await session.stop()
  const entries = await listCheckpoints(checkpoints, root)
  expect(entries).toHaveLength(1)
  expect(entries[0]).toMatchObject({
    kind: "turn",
    incomplete: true,
    fileCount: 0,
    captureError: expect.stringContaining("ENOENT"),
  })
  expect(workspaceExecutionActive(root)).toBe(false)
})

it.each(["completed", "failed", "cancelled"])(
  "persists one whole-run snapshot after %s and restores binary/add/delete changes",
  async (mode) => {
    await writeFile(path.join(root, "removed.bin"), Buffer.from([0, 255, 1]))
    session = await start()
    expect(workspaceExecutionActive(root)).toBe(true)
    const running = session.handle("run_bash", {
      command: `printf 'after\\n' > tracked.txt; rm removed.bin; printf '\\000\\377' > added.bin; ${mode === "cancelled" ? "sleep 30" : mode === "failed" ? "exit 7" : "true"}`,
    })
    await vi.waitFor(async () =>
      expect(await readFile(path.join(root, "tracked.txt"), "utf8")).toBe(
        "after\n"
      )
    )
    if (mode !== "cancelled") await running
    await Promise.all([session.stop(), session.stop()])
    await running
    expect(workspaceExecutionActive(root)).toBe(false)
    const summaries = await listCheckpoints(checkpoints, root)
    expect(summaries).toHaveLength(1)
    expect(summaries[0]).toMatchObject({
      kind: "turn",
      fileCount: 3,
      incomplete: false,
      runId: expect.any(String),
    })
    const snapshot = await readCheckpoint(checkpoints, root, summaries[0]!.id)
    expect(
      snapshot.files!.find((file) => file.path === "added.bin")
    ).toMatchObject({ before: null, encoding: "base64" })
    await writeFile(path.join(root, "tracked.txt"), "later edit")
    await expect(
      restoreCheckpoint(checkpoints, root, snapshot.id)
    ).rejects.toThrow("后续修改")
    expect(await readFile(path.join(root, "added.bin"))).toEqual(
      Buffer.from([0, 255])
    )
    await writeFile(path.join(root, "tracked.txt"), "after\n")
    await restoreCheckpoint(checkpoints, root, snapshot.id)
    expect(await readFile(path.join(root, "tracked.txt"), "utf8")).toBe(
      "before\n"
    )
    expect(await readFile(path.join(root, "removed.bin"))).toEqual(
      Buffer.from([0, 255, 1])
    )
    await expect(readFile(path.join(root, "added.bin"))).rejects.toMatchObject({
      code: "ENOENT",
    })
    expect((await listCheckpoints(checkpoints, root))[0]!.restored).toBe(true)
  }
)

it("imports exact binary bytes atomically and rejects invalid hashes, paths, oversized content and directory symlinks", async () => {
  session = await start()
  const bytes = Buffer.alloc(1024 * 1024 + 1, 255)
  const sha256 = createHash("sha256").update(bytes).digest("hex")
  const file = `inbound/${sha256}-data.bin`
  const params = {
    path: file,
    content_base64: bytes.toString("base64"),
    sha256,
  }
  expect(
    JSON.parse(String(await session.handle("write_input_file", params)))
  ).toEqual({ path: file, size: bytes.length, sha256 })
  expect(await readFile(path.join(root, file))).toEqual(bytes)
  await expect(
    session.handle("write_input_file", { ...params, content_base64: "AA==" })
  ).rejects.toThrow("Invalid input")
  await expect(
    session.handle("write_input_file", {
      ...params,
      path: `../${sha256}-data.bin`,
    })
  ).rejects.toThrow("Invalid input")
  await expect(
    session.handle("write_input_file", {
      ...params,
      content_base64: Buffer.alloc(10 * 1024 * 1024 + 1).toString("base64"),
    })
  ).rejects.toThrow("Invalid input")
  await rm(path.join(root, "inbound"), { recursive: true })
  const outside = path.join(directory, "outside")
  await mkdir(outside)
  await symlink(outside, path.join(root, "inbound"))
  await expect(session.handle("write_input_file", params)).rejects.toThrow(
    "Unsafe workspace directory"
  )
  await expect(
    readFile(path.join(outside, path.basename(file)))
  ).rejects.toMatchObject({ code: "ENOENT" })
}, 15000)
