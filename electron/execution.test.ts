import {
  chmod,
  copyFile,
  link,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import {
  createExecutionSession,
  getExecutionCapabilities,
  mapWorkspaceCommand,
} from "./execution"
import type { ExecutionSession } from "./execution"
import {
  createLocalLaunch,
  createSeatbeltProfile,
  executionEnvironment,
  resolveExecutionPath,
  resolveLocalIsolation,
  resolveMachODependencies,
  validateExecutionEnvironment,
  validateExecutionWorkspace,
} from "./execution-isolation"
import { executeBounded, launchExecutionProcess } from "./execution-process"
import { getRuntimeArchive, hashRuntimeFile } from "./runtimes"

let runtimeDirectory: string
async function seedRuntime(directory: string, kind: "node" | "python") {
  const archive = getRuntimeArchive(kind)!
  const root = path.join(
    directory,
    `${kind}-${archive.version}-${archive.platform}-${archive.arch}`
  )
  const executable = path.join(root, archive.executable)
  await mkdir(path.dirname(executable), { recursive: true, mode: 0o700 })
  if (kind === "node")
    await copyFile(await realpath(process.execPath), executable)
  else
    await writeFile(
      executable,
      `#!/bin/bash\nprintf 'Python ${archive.version}\\n'\n`
    )
  await chmod(executable, 0o755)
  await writeFile(
    path.join(root, ".buddy-runtime.json"),
    JSON.stringify({
      kind,
      version: archive.version,
      platform: archive.platform,
      arch: archive.arch,
      archiveSHA256: archive.sha256,
      executableSHA256: await hashRuntimeFile(executable),
    })
  )
}

beforeAll(async () => {
  runtimeDirectory = await realpath(
    await mkdtemp(path.join(tmpdir(), "buddy-execution-runtimes-"))
  )
  for (const kind of ["node", "python"] as const)
    await seedRuntime(runtimeDirectory, kind)
})
afterAll(async () => {
  await rm(runtimeDirectory, { recursive: true, force: true })
})

const directories: string[] = []
const sessions: ExecutionSession[] = []
async function temporary() {
  const cwd = await realpath(
    await mkdtemp(path.join(tmpdir(), "buddy-execution-test-"))
  )
  directories.push(cwd)
  return cwd
}
async function session(
  mode: "default" | "full" = "default",
  signal?: AbortSignal
) {
  const cwd = await temporary()
  const item = await createExecutionSession({
    backend: "local",
    workspaceDir: cwd,
    permissionMode: mode,
    runtimeDirectory,
    signal,
  })
  sessions.push(item)
  return item
}
afterEach(async () => {
  await Promise.all(sessions.splice(0).map((item) => item.stop()))
  await Promise.all(
    directories
      .splice(0)
      .map((dir) => rm(dir, { recursive: true, force: true }))
  )
})

it("maps only logical workspace file paths and rejects traversal and aliases", () => {
  expect(resolveExecutionPath("/workspace/src/file.ts")).toBe("src/file.ts")
  expect(resolveExecutionPath("src/./file.ts")).toBe("src/file.ts")
  expect(resolveExecutionPath("/workspace")).toBe(".")
  for (const value of [
    "../secret",
    "/etc/passwd",
    "/workspace-other/file",
    "/workspace/a/../../b",
    "a\\b",
    "\0",
    "a\nb",
  ])
    expect(() => resolveExecutionPath(value)).toThrow()
})

it("keeps host secrets out of command environments and rejects loader overrides", () => {
  const env = executionEnvironment("/workspace", ["/runtimes/node/bin"])
  expect(env.HOME).toBe("/workspace")
  expect(env.OPENSSL_CONF).toBe("/dev/null")
  expect(env).not.toHaveProperty("SSH_AUTH_SOCK")
  expect(env).not.toHaveProperty("ELECTRON_RUN_AS_NODE")
  expect(
    validateExecutionEnvironment({ PORT: "34567", NAME: "example" })
  ).toEqual({ PORT: "34567", NAME: "example" })
  for (const key of [
    "HOME",
    "PATH",
    "BASH_ENV",
    "NODE_OPTIONS",
    "NODE_PATH",
    "DYLD_INSERT_LIBRARIES",
    "LD_PRELOAD",
    "PYTHONPATH",
    "ELECTRON_RUN_AS_NODE",
    "OPENSSL_CONF",
    "OPENSSL_MODULES",
  ])
    expect(() => validateExecutionEnvironment({ [key]: "bad" })).toThrow(
      "Unsafe"
    )
})

it("full permission changes network policy without removing Seatbelt filesystem restrictions", () => {
  const normal = createSeatbeltProfile(
    "/private/tmp/workspace",
    ["/managed/node"],
    "default"
  )
  const full = createSeatbeltProfile(
    "/private/tmp/workspace",
    ["/managed/node"],
    "full"
  )
  expect(normal).toContain("(deny default)")
  expect(normal).not.toContain("network-outbound")
  expect(full).toBe(`${normal}\n(allow network-outbound (remote ip "*:*"))`)
  expect(full).not.toContain('(subpath "/Users")')
  expect(full).not.toContain("(allow default)")
})

it("builds Bubblewrap namespaces with read-only system mounts and workspace-only writable bind", async () => {
  const local = {
    executable: "/usr/bin/bwrap",
    shell: "/bin/bash",
    node: "/usr/bin/node",
    readRoots: [],
    kind: "bubblewrap" as const,
  }
  const normal = await createLocalLaunch(
    local,
    "/private/tmp/project",
    "default",
    "/bin/bash",
    ["-c", "true"]
  )
  const full = await createLocalLaunch(
    local,
    "/private/tmp/project",
    "full",
    "/bin/bash",
    ["-c", "true"]
  )
  expect(normal.args).toContain("--unshare-all")
  expect(normal.args).toContain("--die-with-parent")
  expect(normal.args).toContain("--clearenv")
  expect(normal.args).not.toContain("--share-net")
  expect(full.args).toContain("--share-net")
  expect(normal.args.filter((arg) => arg === "--bind")).toHaveLength(1)
  expect(normal.args).toContain("--ro-bind")
  expect(normal.args).toContain("--cap-drop")
})

it("mounts authorized Git metadata read-only without mounting the source workspace", async () => {
  const cwd = await temporary()
  const source = await temporary()
  const common = path.join(source, ".git")
  const metadata = path.join(common, "worktrees", "task")
  await mkdir(metadata, { recursive: true })
  const launch = await createLocalLaunch(
    {
      executable: "/usr/bin/bwrap",
      shell: "/bin/bash",
      node: "/usr/bin/node",
      readRoots: [],
      kind: "bubblewrap",
    },
    cwd,
    "full",
    "/bin/bash",
    ["-c", "true"],
    {},
    [common, metadata]
  )
  for (const root of [common, metadata]) {
    const index = launch.args.indexOf(root)
    expect(launch.args.slice(index - 1, index + 2)).toEqual([
      "--ro-bind",
      root,
      root,
    ])
  }
  expect(launch.args).not.toContain(source)
  expect(launch.args.filter((argument) => argument === "--bind")).toHaveLength(
    1
  )
  const alias = path.join(source, "alias")
  await symlink(common, alias)
  for (const unsafe of [cwd, source + "/..", alias])
    await expect(
      createLocalLaunch(
        {
          executable: "/usr/bin/bwrap",
          shell: "/bin/bash",
          node: "/usr/bin/node",
          readRoots: [],
          kind: "bubblewrap",
        },
        cwd,
        "default",
        "/bin/bash",
        ["-c", "true"],
        {},
        [unsafe]
      )
    ).rejects.toThrow()
})

it("maps quoted shell workspace paths without interpolating host directory names", async () => {
  const cwd = "/tmp/project with 'quotes' and $variables"
  for (const command of [
    "printf '%s' /workspace/file",
    'printf "%s" "/workspace/file"',
    "printf '%s' '/workspace/file'",
  ]) {
    const mapped = mapWorkspaceCommand(command, cwd)
    const result = await executeBounded({
      executable: "/bin/bash",
      args: ["--noprofile", "--norc", "-c", mapped],
      cwd: tmpdir(),
      env: { PATH: "/usr/bin:/bin" },
      deadlineMs: 2000,
      maxOutputBytes: 4096,
    })
    expect(result.stdout).toBe(`${cwd}/file`)
  }
  expect(
    mapWorkspaceCommand("printf '%s' https://example.test/workspace", cwd)
  ).toContain("https://example.test/workspace")
})

it("enforces process deadlines and output caps", async () => {
  const base = {
    executable: "/bin/bash",
    cwd: tmpdir(),
    env: { PATH: "/usr/bin:/bin" },
    deadlineMs: 80,
    maxOutputBytes: 2048,
  }
  const timed = await executeBounded({ ...base, args: ["-c", "sleep 10"] })
  expect(timed.reason).toBe("deadline")
  const capped = await executeBounded({
    ...base,
    deadlineMs: 5000,
    args: ["-c", "while true; do printf 0123456789; done"],
  })
  expect(capped.reason).toBe("output-limit")
  expect(Buffer.byteLength(capped.stdout + capped.stderr)).toBeLessThanOrEqual(
    2048
  )
})

it("cancels a process group and its descendants", async () => {
  const cwd = await temporary()
  const controller = new AbortController()
  const child = launchExecutionProcess({
    executable: "/bin/bash",
    args: ["-c", "sleep 60 & echo $! > child.pid; wait"],
    cwd,
    env: { PATH: "/usr/bin:/bin" },
    deadlineMs: 5000,
    maxOutputBytes: 2048,
    signal: controller.signal,
  })
  await child.started
  let descendant = 0
  await expect
    .poll(async () => {
      try {
        descendant = Number(await readFile(path.join(cwd, "child.pid"), "utf8"))
        return descendant > 0
      } catch {
        return false
      }
    })
    .toBe(true)
  controller.abort()
  expect((await child.result).reason).toBe("cancelled")
  await expect
    .poll(() => {
      try {
        process.kill(descendant, 0)
        return false
      } catch {
        return true
      }
    })
    .toBe(true)
})

it("rejects non-dedicated workspaces and pre-cancelled sessions", async () => {
  await expect(validateExecutionWorkspace("relative")).rejects.toThrow(
    "absolute"
  )
  await expect(validateExecutionWorkspace("/")).rejects.toThrow("dedicated")
  const controller = new AbortController()
  controller.abort()
  await expect(
    createExecutionSession({
      backend: "local",
      workspaceDir: tmpdir(),
      permissionMode: "default",
      runtimeDirectory,
      signal: controller.signal,
    })
  ).rejects.toThrow("cancelled")
})

it("requires managed Node and Python without falling back to host runtimes", async () => {
  const directory = await temporary()
  await expect(resolveLocalIsolation(directory)).rejects.toThrow(
    "Install the managed node runtime before local execution"
  )
  await seedRuntime(directory, "node")
  await expect(resolveLocalIsolation(directory)).rejects.toThrow(
    "Install the managed python runtime before local execution"
  )
  const missing = path.join(directory, "not-installed")
  const status = await getExecutionCapabilities({ runtimeDirectory: missing })
  expect(status.local).toMatchObject({
    available: false,
    message: "Install the managed node runtime before local execution",
  })
  await expect(stat(missing)).rejects.toMatchObject({ code: "ENOENT" })
})

function machOFixture(commands: [number, string][], universal = false) {
  const chunks = commands.map(([type, name]) => {
    const start = type === 0x8000001c ? 12 : 24
    const length = Math.ceil((start + Buffer.byteLength(name) + 1) / 8) * 8
    const chunk = Buffer.alloc(length)
    chunk.writeUInt32LE(type, 0)
    chunk.writeUInt32LE(length, 4)
    chunk.writeUInt32LE(start, 8)
    chunk.write(name, start)
    return chunk
  })
  const header = Buffer.alloc(32)
  header.writeUInt32LE(0xfeedfacf, 0)
  header.writeUInt32LE(commands.length, 16)
  header.writeUInt32LE(
    chunks.reduce((size, chunk) => size + chunk.length, 0),
    20
  )
  const image = Buffer.concat([header, ...chunks])
  if (!universal) return image
  const fat = Buffer.alloc(64)
  fat.writeUInt32BE(0xcafebabe, 0)
  fat.writeUInt32BE(1, 4)
  fat.writeUInt32BE(process.arch === "arm64" ? 0x0100000c : 0x01000007, 8)
  fat.writeUInt32BE(64, 16)
  fat.writeUInt32BE(image.length, 20)
  return Buffer.concat([fat, image])
}

it("resolves only Mach-O linked files through rpaths, symlinks and transitive dependencies", async () => {
  const root = await temporary()
  await mkdir(path.join(root, "lib"))
  const node = path.join(root, "node")
  const linked = path.join(root, "lib", "linked.dylib")
  const actual = path.join(root, "lib", "actual.dylib")
  const nested = path.join(root, "lib", "nested.dylib")
  const secret = path.join(root, "lib", "credentials")
  await writeFile(
    node,
    machOFixture(
      [
        [0x8000001c, "@executable_path/lib"],
        [0xc, "@rpath/linked.dylib"],
        [0x80000018, "@rpath/optional.dylib"],
        [0xc, "/usr/lib/libSystem.B.dylib"],
      ],
      true
    )
  )
  await writeFile(
    actual,
    machOFixture([
      [0x8000001c, "@loader_path"],
      [0xc, "@rpath/nested.dylib"],
    ])
  )
  await writeFile(nested, machOFixture([[0xc, "@rpath/linked.dylib"]]))
  await writeFile(secret, "do not expose")
  await symlink(actual, linked)
  const dependencies = await resolveMachODependencies(node)
  expect(new Set(dependencies)).toEqual(new Set([linked, actual, nested]))
  const profile = createSeatbeltProfile(
    "/workspace",
    [],
    "default",
    dependencies
  )
  for (const dependency of dependencies) {
    expect(profile).toContain(`(literal ${JSON.stringify(dependency)})`)
    expect(profile).not.toContain(`(subpath ${JSON.stringify(dependency)})`)
  }
  expect(profile).not.toContain(secret)
  expect(profile).not.toContain(`(subpath ${JSON.stringify(root)})`)
  expect(profile).not.toContain('(subpath "/opt/homebrew")')
})

it("fails closed on missing required libraries and malformed Mach-O metadata", async () => {
  const root = await temporary()
  const node = path.join(root, "node")
  await writeFile(node, machOFixture([[0xc, "@loader_path/missing.dylib"]]))
  await expect(resolveMachODependencies(node)).rejects.toThrow("Cannot resolve")
  const invalid = machOFixture([[0xc, "@loader_path/missing.dylib"]])
  invalid.writeUInt32LE(0xffffffff, 36)
  await writeFile(node, invalid)
  await expect(resolveMachODependencies(node)).rejects.toThrow("Invalid Mach-O")
  await writeFile(node, "not an executable")
  await expect(resolveMachODependencies(node)).rejects.toThrow(
    "Unsupported Mach-O"
  )
})

describe.runIf(process.platform === "darwin")("live Seatbelt execution", () => {
  it("reads only authorized worktree metadata and cannot write the source or metadata", async () => {
    const cwd = await temporary()
    const source = await temporary()
    const common = path.join(source, ".git")
    const metadata = path.join(common, "worktrees", "task")
    await mkdir(metadata, { recursive: true })
    await writeFile(path.join(common, "HEAD"), "common-head")
    await writeFile(path.join(metadata, "HEAD"), "worktree-head")
    await writeFile(path.join(source, "private.txt"), "private-source-content")
    const isolation = {
      executable: "/usr/bin/sandbox-exec",
      shell: "/bin/bash",
      node: "/usr/bin/false",
      readRoots: [],
      kind: "seatbelt" as const,
    }
    const launch = await createLocalLaunch(
      isolation,
      cwd,
      "full",
      isolation.shell,
      [
        "--noprofile",
        "--norc",
        "-c",
        `cat '${common}/HEAD'; cat '${metadata}/HEAD'; cat '${source}/private.txt'; ` +
          `printf changed > '${source}/private.txt'; printf changed > '${common}/HEAD'; ` +
          `printf changed > '${metadata}/HEAD'; printf allowed > local.txt`,
      ],
      {},
      [common, metadata]
    )
    const result = await executeBounded({
      ...launch,
      deadlineMs: 5000,
      maxOutputBytes: 4096,
    })
    expect(result.stdout).toBe("common-headworktree-head")
    expect(result.stdout + result.stderr).not.toContain(
      "private-source-content"
    )
    expect(await readFile(path.join(source, "private.txt"), "utf8")).toBe(
      "private-source-content"
    )
    expect(await readFile(path.join(common, "HEAD"), "utf8")).toBe(
      "common-head"
    )
    expect(await readFile(path.join(metadata, "HEAD"), "utf8")).toBe(
      "worktree-head"
    )
    expect(await readFile(path.join(cwd, "local.txt"), "utf8")).toBe("allowed")
  }, 15000)
  it("keeps sibling files private when allowing an exact runtime dependency", async () => {
    const cwd = await temporary()
    const outside = await temporary()
    const library = path.join(outside, "runtime.dylib")
    const secret = path.join(outside, "credentials")
    await writeFile(library, "allowed-runtime-file")
    await writeFile(secret, "private-marker")
    const isolation = await resolveLocalIsolation(runtimeDirectory)
    const launch = await createLocalLaunch(
      { ...isolation, readFiles: [...(isolation.readFiles ?? []), library] },
      cwd,
      "default",
      isolation.shell,
      ["--noprofile", "--norc", "-c", `cat '${library}'; cat '${secret}'`]
    )
    const result = await executeBounded({
      ...launch,
      deadlineMs: 5000,
      maxOutputBytes: 4096,
    })
    expect(result.stdout).toBe("allowed-runtime-file")
    expect(result.code).not.toBe(0)
    expect(result.stdout + result.stderr).not.toContain("private-marker")
  }, 15000)
  it("reports usable OS isolation", async () => {
    const status = await getExecutionCapabilities({ runtimeDirectory })
    expect(status.local).toMatchObject({
      available: true,
      isolation: "seatbelt",
    })
  }, 15000)

  it("matches backend file semantics and enforces file limits", async () => {
    const item = await session()
    expect(
      await item.handle("write_file", {
        path: "/workspace/src/a.txt",
        content: "first\nsecond\nthird\n",
      })
    ).toContain("src/a.txt")
    expect(
      await item.handle("read_file", { path: "src/a.txt", offset: 1, limit: 1 })
    ).toBe("2\tsecond")
    expect(
      await item.handle("read_file", { path: "src/a.txt", line_numbers: false })
    ).toBe("first\nsecond\nthird\n")
    expect(await item.handle("list_files", { path: "src" })).toEqual([
      { path: "src/a.txt", is_dir: false, size: 19 },
    ])
    await item.handle("edit_file", {
      path: "src/a.txt",
      old_text: "second",
      new_text: "edited",
    })
    expect(await item.handle("read_file", { path: "src/a.txt" })).toContain(
      "2\tedited"
    )
    await expect(
      item.handle("edit_file", {
        path: "src/a.txt",
        old_text: "missing",
        new_text: "x",
      })
    ).rejects.toThrow("not found")
    await item.handle("write_file", { path: "duplicate", content: "same same" })
    await expect(
      item.handle("edit_file", {
        path: "duplicate",
        old_text: "same",
        new_text: "x",
      })
    ).rejects.toThrow("unique")
    await expect(
      item.handle("write_file", {
        path: "big",
        content: "a".repeat(1024 * 1024 + 1),
      })
    ).rejects.toThrow("limit")
    await expect(
      item.handle("read_file", { path: "../secret" })
    ).rejects.toThrow("escapes")
  }, 20000)

  it("rejects leaf and directory symlinks, hard links and special files", async () => {
    const item = await session()
    const outside = await temporary()
    await writeFile(path.join(outside, "secret"), "outside-secret-marker")
    await symlink(path.join(outside, "secret"), path.join(item.cwd, "link"))
    await symlink(outside, path.join(item.cwd, "directory"))
    await link(path.join(outside, "secret"), path.join(item.cwd, "hard"))
    for (const name of ["link", "directory/secret", "hard"]) {
      await expect(item.handle("read_file", { path: name })).rejects.toThrow()
      await expect(
        item.handle("write_file", { path: name, content: "changed" })
      ).rejects.toThrow()
    }
    await expect(
      item.handle("write_file", { path: "directory/new", content: "changed" })
    ).rejects.toThrow()
    expect(await readFile(path.join(outside, "secret"), "utf8")).toBe(
      "outside-secret-marker"
    )
  }, 20000)

  it.each(["default", "full"] as const)(
    "blocks outside reads and writes in %s mode while preserving workspace operations",
    async (mode) => {
      const item = await session(mode)
      const outside = await temporary()
      await writeFile(path.join(outside, "secret"), "outside-secret-marker")
      const read = await item.handle("run_bash", {
        command: `cat '${outside}/secret'`,
      })
      expect(read).not.toContain("outside-secret-marker")
      expect(read).not.toMatch(/^exit 0/)
      const write = await item.handle("run_bash", {
        command: `printf changed > '${outside}/secret'`,
      })
      expect(write).not.toMatch(/^exit 0/)
      expect(await readFile(path.join(outside, "secret"), "utf8")).toBe(
        "outside-secret-marker"
      )
      expect(
        await item.handle("run_bash", {
          command:
            "printf workspace > /workspace/allowed; cat /workspace/allowed",
        })
      ).toBe("exit 0\nworkspace")
      const env = await item.handle("run_bash", {
        command: "printf '%s' \"$HOME|$SSH_AUTH_SOCK|$ELECTRON_RUN_AS_NODE\"",
      })
      expect(env).toBe(`exit 0\n${item.cwd}||`)
    },
    20000
  )

  it("denies outbound IP connections by default and outside Unix sockets even in full mode", async () => {
    const outside = await temporary()
    const tcp = createServer((socket) => socket.end())
    const unix = createServer((socket) => socket.end())
    await new Promise<void>((resolve) => tcp.listen(0, "127.0.0.1", resolve))
    await new Promise<void>((resolve) =>
      unix.listen(path.join(outside, "host.sock"), resolve)
    )
    const address = tcp.address()
    if (!address || typeof address === "string") throw new Error("No address")
    try {
      for (const mode of ["default", "full"] as const) {
        const item = await session(mode)
        const connect = `node -e 'const s=require("node:net").connect(${address.port},"127.0.0.1");s.on("connect",()=>{console.log("connected");s.end()});s.on("error",()=>console.log("blocked"))'`
        expect(await item.handle("run_bash", { command: connect })).toBe(
          `exit 0\n${mode === "default" ? "blocked" : "connected"}`
        )
        const socket = `node -e 'const s=require("node:net").connect(${JSON.stringify(path.join(outside, "host.sock"))});s.on("connect",()=>{console.log("connected");s.end()});s.on("error",()=>console.log("blocked"))'`
        expect(await item.handle("run_bash", { command: socket })).toBe(
          "exit 0\nblocked"
        )
      }
    } finally {
      await Promise.all(
        [tcp, unix].map(
          (server) =>
            new Promise<void>((resolve) => server.close(() => resolve()))
        )
      )
    }
  }, 20000)

  it("cannot remove its workspace root or hard-link a read-only runtime file into it", async () => {
    const item = await session("full")
    const removed = await item.handle("run_bash", { command: 'rmdir "$HOME"' })
    expect(removed).not.toMatch(/^exit 0/)
    const outside = await temporary()
    await writeFile(path.join(outside, "read-only-source"), "untouched")
    const isolation = await resolveLocalIsolation(runtimeDirectory)
    const spec = await createLocalLaunch(
      { ...isolation, readRoots: [...isolation.readRoots, outside] },
      item.cwd,
      "full",
      isolation.shell,
      [
        "--noprofile",
        "--norc",
        "-c",
        `ln '${outside}/read-only-source' ./alias && printf changed > ./alias`,
      ]
    )
    const result = await executeBounded({
      ...spec,
      deadlineMs: 3000,
      maxOutputBytes: 4096,
    })
    expect(result.code).not.toBe(0)
    expect(await readFile(path.join(outside, "read-only-source"), "utf8")).toBe(
      "untouched"
    )
  }, 15000)

  it("does not escape while an ancestor is repeatedly replaced with a symlink", async () => {
    const item = await session()
    const outside = await temporary()
    const directory = path.join(item.cwd, "changing")
    const held = path.join(item.cwd, "held")
    await mkdir(directory)
    await writeFile(path.join(directory, "new-file"), "within-workspace")
    let active = true
    const changing = (async () => {
      while (active) {
        await rename(directory, held)
        await symlink(outside, directory)
        await new Promise<void>((resolve) => setImmediate(resolve))
        await unlink(directory)
        await rename(held, directory)
      }
    })()
    try {
      for (let i = 0; i < 12; i++) {
        await item
          .handle("edit_file", {
            path: "changing/new-file",
            old_text: "within-workspace",
            new_text: "within-workspace",
          })
          .catch(() => {})
      }
    } finally {
      active = false
      await changing
    }
    await expect(stat(path.join(outside, "new-file"))).rejects.toThrow()
  }, 20000)

  it("only exposes registered, running, owned loopback ports and stops them on disconnect", async () => {
    const controller = new AbortController()
    const item = await session("default", controller.signal)
    const reserve = createServer()
    await new Promise<void>((resolve) =>
      reserve.listen(0, "127.0.0.1", resolve)
    )
    const address = reserve.address()
    if (!address || typeof address === "string") throw new Error("No address")
    const port = address.port
    await new Promise<void>((resolve) => reserve.close(() => resolve()))
    await expect(item.handle("get_endpoint", { port })).rejects.toThrow(
      "registered"
    )
    await item.handle("run_background", {
      command: `node -e 'require("node:http").createServer((req,res)=>res.end("preview")).listen(${port},"127.0.0.1")'`,
      port,
    })
    let endpoint = ""
    await expect
      .poll(
        async () => {
          try {
            const result = await item.handle("get_endpoint", { port })
            if (!result || typeof result !== "object" || !("url" in result))
              return false
            expect(result.headers).toEqual({})
            endpoint = result.url
            return true
          } catch {
            return false
          }
        },
        { timeout: 5000 }
      )
      .toBe(true)
    expect(endpoint).toBe(`http://127.0.0.1:${port}`)
    expect(await fetch(endpoint).then((response) => response.text())).toBe(
      "preview"
    )
    await expect(
      item.handle("get_endpoint", { port: port + 1 })
    ).rejects.toThrow("registered")
    controller.abort()
    await item.stop()
    await expect(item.handle("run_bash", { command: "true" })).rejects.toThrow(
      "stopped"
    )
    await expect(fetch(endpoint)).rejects.toThrow()
  }, 20000)
})
