import { constants } from "node:fs"
import { access, lstat, open, realpath, stat } from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
import path from "node:path"
import { executeBounded } from "./execution-process"

export type ExecutionBackend = "local"
export type ExecutionPermissionMode = "default" | "full"
type ExecutionCapability = {
  available: boolean
  isolation: "seatbelt" | "bubblewrap" | null
  message: string
}
export type ExecutionCapabilities = {
  platform: NodeJS.Platform
  local: ExecutionCapability
}
export type LocalIsolation = {
  executable: string
  shell: string
  node: string
  readRoots: string[]
  readFiles?: string[]
  kind: "seatbelt" | "bubblewrap"
}
export type ExecutionLaunch = {
  executable: string
  args: string[]
  env: NodeJS.ProcessEnv
  cwd: string
}

const SYSTEM_PATH = (process.env.PATH ?? "")
  .split(path.delimiter)
  .filter((directory) => path.isAbsolute(directory))
  .join(path.delimiter)
const MAC_READ_ROOTS = [
  "/bin",
  "/sbin",
  "/usr/bin",
  "/usr/sbin",
  "/usr/lib",
  "/usr/libexec",
  "/usr/share",
  "/usr/local",
  "/System",
  "/Library/Apple/System/Library",
]
const LINUX_READ_ROOTS = ["/usr", "/bin", "/sbin", "/lib", "/lib64", "/opt"]
const CONFIG_READ_PATHS = [
  "/etc/hosts",
  "/etc/resolv.conf",
  "/etc/nsswitch.conf",
  "/etc/ld.so.cache",
  "/etc/ssl",
  "/etc/localtime",
  "/private/etc/hosts",
  "/private/etc/resolv.conf",
  "/private/etc/ssl",
  "/private/etc/localtime",
]

export function containsPath(root: string, target: string) {
  const relative = path.relative(root, target)
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  )
}

export function resolveExecutionPath(value: unknown = ".") {
  if (
    typeof value !== "string" ||
    value.length > 4096 ||
    /[\0\r\n\\]/.test(value)
  )
    throw new Error("Invalid workspace path")
  const raw = value.trim() || "."
  if (raw.split("/").includes("..")) throw new Error("Path escapes workspace")
  const normalized = path.posix.normalize(
    raw.startsWith("/") ? raw : `/workspace/${raw}`
  )
  if (normalized !== "/workspace" && !normalized.startsWith("/workspace/"))
    throw new Error("Path escapes workspace")
  return normalized === "/workspace"
    ? "."
    : normalized.slice("/workspace/".length)
}

export async function validateExecutionWorkspace(value: string) {
  if (
    typeof value !== "string" ||
    !path.isAbsolute(value) ||
    /[\0\r\n,]/.test(value)
  )
    throw new Error("Workspace must be an absolute directory")
  const cwd = await realpath(value)
  if (!(await stat(cwd)).isDirectory())
    throw new Error("Workspace is not a directory")
  const home = await realpath(homedir())
  if (
    cwd === path.parse(cwd).root ||
    cwd === home ||
    [
      "/System",
      "/Library",
      "/usr",
      "/bin",
      "/sbin",
      "/etc",
      "/private/etc",
      "/dev",
      "/proc",
      "/sys",
    ].some((root) => containsPath(root, cwd))
  ) {
    throw new Error("Select a dedicated project workspace")
  }
  return cwd
}

export async function findExecutable(name: string, extra: string[] = []) {
  const names =
    process.platform === "win32" && !path.extname(name)
      ? [`${name}.exe`]
      : [name]
  const candidates = path.isAbsolute(name)
    ? [name]
    : [
        ...extra,
        ...SYSTEM_PATH.split(path.delimiter).flatMap((directory) =>
          names.map((file) => path.join(directory, file))
        ),
      ]
  for (const candidate of [...new Set(candidates)]) {
    try {
      await access(candidate, constants.X_OK)
      const resolved = await realpath(candidate)
      if ((await stat(resolved)).isFile()) return path.resolve(candidate)
    } catch {
      /* Continue searching installed tools. */
    }
  }
  return undefined
}

export function executionEnvironment(
  cwd: string,
  runtimeBins: string[] = []
): NodeJS.ProcessEnv {
  return {
    PATH: [...runtimeBins, ...SYSTEM_PATH.split(path.delimiter)].join(
      path.delimiter
    ),
    HOME: cwd,
    TMPDIR: cwd,
    TMP: cwd,
    TEMP: cwd,
    LANG: "en_US.UTF-8",
    LC_ALL: "en_US.UTF-8",
    PYTHONNOUSERSITE: "1",
    PYTHONDONTWRITEBYTECODE: "1",
    NODE_NO_WARNINGS: "1",
    OPENSSL_CONF: "/dev/null",
  }
}

export function validateExecutionEnvironment(
  value: unknown
): Record<string, string> {
  if (value === undefined || value === null) return {}
  if (typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid command environment")
  const result: Record<string, string> = {}
  const entries = Object.entries(value)
  if (entries.length > 64) throw new Error("Too many environment variables")
  for (const [key, val] of entries) {
    if (
      !/^[A-Z_][A-Z0-9_]*$/i.test(key) ||
      /^(PATH|HOME|TMPDIR|TMP|TEMP|BASH_ENV|ENV|SHELLOPTS|BASHOPTS|LD_.*|DYLD_.*|NODE_OPTIONS|NODE_PATH|ELECTRON_.*|PYTHONPATH|PYTHONHOME|OPENSSL_.*)$/i.test(
        key
      ) ||
      typeof val !== "string" ||
      val.length > 8192 ||
      val.includes("\0")
    )
      throw new Error("Unsafe command environment")
    result[key] = val
  }
  return result
}

function seatbeltString(value: string) {
  return JSON.stringify(value)
}

export function createSeatbeltProfile(
  cwd: string,
  readRoots: string[],
  mode: ExecutionPermissionMode,
  readFiles: string[] = [],
  readOnlyRoots: string[] = []
) {
  const read = [
    ...new Set([...MAC_READ_ROOTS, ...CONFIG_READ_PATHS, ...readRoots, cwd]),
  ]
  const filters = [
    ...read.map((root) => `(subpath ${seatbeltString(root)})`),
    ...new Set(readFiles.map((file) => `(literal ${seatbeltString(file)})`)),
  ].join(" ")
  const readOnlyFilters = readOnlyRoots
    .map((root) => `(subpath ${seatbeltString(root)})`)
    .join(" ")
  return [
    "(version 1)",
    "(deny default)",
    "(allow process-exec process-fork)",
    "(allow signal (target self) (target children) (target same-sandbox))",
    "(allow sysctl-read file-read-metadata)",
    `(allow file-read* ${filters} ${readOnlyFilters} (literal "/") (literal "/dev/null") (literal "/dev/random") (literal "/dev/urandom"))`,
    `(allow file-map-executable ${filters})`,
    `(allow file-write* (subpath ${seatbeltString(cwd)}) (literal "/dev/null"))`,
    "(deny file-link)",
    `(deny file-write-unlink file-write-create (literal ${seatbeltString(cwd)}))`,
    '(allow network-bind network-inbound (local ip "localhost:*"))',
    ...(mode === "full" ? ['(allow network-outbound (remote ip "*:*"))'] : []),
  ].join("\n")
}

export async function createLocalLaunch(
  isolation: LocalIsolation,
  cwd: string,
  mode: ExecutionPermissionMode,
  executable: string,
  args: string[],
  extraEnv: Record<string, string> = {},
  readOnlyRoots: string[] = []
): Promise<ExecutionLaunch> {
  for (const root of readOnlyRoots) {
    if (
      !path.isAbsolute(root) ||
      containsPath(cwd, root) ||
      containsPath(root, cwd) ||
      (await realpath(root)) !== root ||
      !(await lstat(root)).isDirectory()
    )
      throw new Error(
        "Read-only Git metadata must be separate from the workspace"
      )
  }
  const env = {
    ...executionEnvironment(cwd, [
      path.dirname(isolation.node),
      ...isolation.readRoots.map((root) => path.join(root, "bin")),
    ]),
    ...extraEnv,
  }
  if (isolation.kind === "seatbelt") {
    return {
      executable: isolation.executable,
      args: [
        "-p",
        createSeatbeltProfile(
          cwd,
          isolation.readRoots,
          mode,
          isolation.readFiles,
          readOnlyRoots
        ),
        executable,
        ...args,
      ],
      cwd,
      env,
    }
  }
  const mounts: string[] = []
  for (const root of [
    ...new Set([
      ...LINUX_READ_ROOTS,
      ...CONFIG_READ_PATHS,
      ...isolation.readRoots,
      ...readOnlyRoots,
    ]),
  ]) {
    if (containsPath(cwd, root))
      throw new Error("Runtime must be outside the workspace")
    try {
      const info = await lstat(root)
      if (info.isSymbolicLink())
        mounts.push(
          "--symlink",
          await import("node:fs/promises").then((fs) => fs.readlink(root)),
          root
        )
      else mounts.push("--ro-bind", root, root)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    }
  }
  return {
    executable: isolation.executable,
    args: [
      "--die-with-parent",
      "--new-session",
      "--unshare-all",
      ...(mode === "full" ? ["--share-net"] : []),
      "--cap-drop",
      "ALL",
      ...mounts,
      "--proc",
      "/proc",
      "--dev",
      "/dev",
      "--bind",
      cwd,
      "/workspace",
      "--chdir",
      "/workspace",
      "--clearenv",
      ...Object.entries({
        ...env,
        HOME: "/workspace",
        TMPDIR: "/workspace",
        TMP: "/workspace",
        TEMP: "/workspace",
      }).flatMap(([key, val]) => ["--setenv", key, val!]),
      executable,
      ...args,
    ],
    cwd,
    env,
  }
}

async function machOLoadCommands(file: string) {
  const handle = await open(file, "r")
  try {
    const size = (await handle.stat()).size
    const read = async (offset: number, length: number) => {
      if (
        offset < 0 ||
        length < 0 ||
        offset + length > size ||
        length > 16 * 1024 * 1024
      )
        throw new Error("Invalid Mach-O runtime image")
      const buffer = Buffer.alloc(length)
      if ((await handle.read(buffer, 0, length, offset)).bytesRead !== length)
        throw new Error("Truncated Mach-O runtime image")
      return buffer
    }
    let offset = 0
    let header = await read(0, 8)
    const magic = header.readUInt32BE(0)
    if (magic === 0xcafebabe || magic === 0xcafebabf) {
      const count = header.readUInt32BE(4)
      if (count > 32) throw new Error("Invalid Mach-O architecture table")
      const stride = magic === 0xcafebabf ? 32 : 20
      const arches = await read(8, count * stride)
      const cpu = process.arch === "arm64" ? 0x0100000c : 0x01000007
      const index = Array.from({ length: count }, (_, i) => i * stride).find(
        (i) => arches.readUInt32BE(i) === cpu
      )
      if (index === undefined)
        throw new Error("Unsupported Mach-O runtime architecture")
      offset =
        stride === 32
          ? Number(arches.readBigUInt64BE(index + 8))
          : arches.readUInt32BE(index + 8)
      header = await read(offset, 8)
    }
    const little = header.readUInt32LE(0) === 0xfeedfacf
    if (!little && header.readUInt32BE(0) !== 0xfeedfacf)
      throw new Error("Unsupported Mach-O runtime image")
    const uint = (buffer: Buffer, position: number) =>
      little ? buffer.readUInt32LE(position) : buffer.readUInt32BE(position)
    header = await read(offset, 32)
    const commands = await read(offset + 32, uint(header, 20))
    const count = uint(header, 16)
    if (count > 65536) throw new Error("Invalid Mach-O load command count")
    const dependencies: { name: string; weak: boolean }[] = []
    const rpaths: string[] = []
    let position = 0
    for (let i = 0; i < count; i++) {
      if (position + 8 > commands.length)
        throw new Error("Invalid Mach-O load command")
      const command = uint(commands, position)
      const length = uint(commands, position + 4)
      if (length < 8 || position + length > commands.length)
        throw new Error("Invalid Mach-O load command size")
      const rpath = command === 0x8000001c
      if (
        rpath ||
        [0xc, 0x80000018, 0x8000001f, 0x20, 0x80000023].includes(command)
      ) {
        if (length < (rpath ? 12 : 24))
          throw new Error("Invalid Mach-O library command")
        const nameOffset = uint(commands, position + 8)
        const end = commands.indexOf(0, position + nameOffset)
        if (
          nameOffset < (rpath ? 12 : 24) ||
          end < 0 ||
          end >= position + length
        )
          throw new Error("Invalid Mach-O library name")
        const name = commands.toString("utf8", position + nameOffset, end)
        if (rpath) rpaths.push(name)
        else dependencies.push({ name, weak: command === 0x80000018 })
      }
      position += length
    }
    return { dependencies, rpaths }
  } finally {
    await handle.close()
  }
}

export async function resolveMachODependencies(
  executable: string
): Promise<string[]> {
  const root = await realpath(executable)
  const files = new Set<string>()
  const visited = new Set<string>()
  const system = (file: string) =>
    ["/usr/lib", "/System/Library", "/Library/Apple/System/Library"].some(
      (directory) => containsPath(directory, file)
    )
  const visit = async (file: string, inherited: string[]) => {
    if (visited.has(file)) return
    if (visited.size >= 512)
      throw new Error("Too many runtime dynamic libraries")
    visited.add(file)
    const { dependencies, rpaths } = await machOLoadCommands(file)
    const expand = (name: string) => {
      if (name === "@loader_path") return path.dirname(file)
      if (name === "@executable_path") return path.dirname(root)
      if (name.startsWith("@loader_path/"))
        return path.resolve(path.dirname(file), name.slice(13))
      if (name.startsWith("@executable_path/"))
        return path.resolve(path.dirname(root), name.slice(17))
      return path.isAbsolute(name) ? path.normalize(name) : undefined
    }
    const paths = [
      ...rpaths.map(expand).filter((item): item is string => !!item),
      ...inherited,
    ]
    for (const dependency of dependencies) {
      const candidates = dependency.name.startsWith("@rpath/")
        ? paths.map((directory) =>
            path.resolve(directory, dependency.name.slice(7))
          )
        : [expand(dependency.name)].filter((item): item is string => !!item)
      let found = false
      for (const candidate of candidates) {
        if (system(candidate)) {
          found = true
          break
        }
        let canonical: string
        try {
          canonical = await realpath(candidate)
          if (!(await stat(canonical)).isFile())
            throw new Error("Runtime dependency is not a file")
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") continue
          throw error
        }
        files.add(candidate)
        files.add(canonical)
        if (!system(canonical)) await visit(canonical, paths)
        found = true
        break
      }
      if (!found && !dependency.weak)
        throw new Error(
          `Cannot resolve a runtime dynamic library: ${dependency.name}`
        )
    }
  }
  await visit(root, [])
  return [...files]
}

export async function resolveLocalIsolation(
  runtimeDirectory: string
): Promise<LocalIsolation> {
  if (!runtimeDirectory)
    throw new Error("Install the managed node runtime before local execution")
  if (process.platform !== "darwin" && process.platform !== "linux")
    throw new Error("Local OS isolation is unavailable on this platform")
  const { createRuntimeManager } = await import("./runtimes")
  const status = await createRuntimeManager({
    directory: runtimeDirectory,
  }).status()
  const readRoots: string[] = []
  for (const runtime of [status.node, status.python]) {
    if (!runtime.installed || !runtime.directory || !runtime.executable)
      throw new Error(
        `Install the managed ${runtime.kind} runtime before local execution`
      )
    readRoots.push(runtime.directory)
  }
  const node = await realpath(status.node.executable!)
  const kind = process.platform === "darwin" ? "seatbelt" : "bubblewrap"
  const executable = await findExecutable(
    kind === "seatbelt" ? "sandbox-exec" : "bwrap",
    kind === "seatbelt" ? ["/usr/bin/sandbox-exec"] : []
  )
  const shell = await findExecutable("bash", ["/bin/bash"])
  if (!executable || !shell)
    throw new Error(
      `Local execution requires ${kind === "seatbelt" ? "sandbox-exec" : "bubblewrap"}`
    )
  const systemExecutable = await realpath(executable)
  const systemShell = await realpath(shell)
  for (const tool of [systemExecutable, systemShell]) {
    const info = await stat(tool)
    if (info.uid !== 0 || info.mode & 0o022)
      throw new Error("OS isolation tools must be installed by the system")
  }
  return {
    executable: systemExecutable,
    shell: systemShell,
    node,
    readRoots: [...new Set(readRoots)],
    ...(kind === "seatbelt"
      ? { readFiles: await resolveMachODependencies(node) }
      : {}),
    kind,
  }
}

export async function getExecutionCapabilities(options: {
  runtimeDirectory: string
}): Promise<ExecutionCapabilities> {
  let local: ExecutionCapability
  try {
    const isolation = await resolveLocalIsolation(options.runtimeDirectory)
    const cwd = await realpath(tmpdir())
    const launch = await createLocalLaunch(
      isolation,
      cwd,
      "default",
      isolation.shell,
      ["--noprofile", "--norc", "-c", "printf isolation-ok"]
    )
    const result = await executeBounded({
      ...launch,
      deadlineMs: 5000,
      maxOutputBytes: 8192,
    })
    if (result.code !== 0 || result.stdout !== "isolation-ok")
      throw new Error("OS sandbox initialization failed")
    local = { available: true, isolation: isolation.kind, message: "" }
  } catch (error) {
    local = {
      available: false,
      isolation: null,
      message:
        error instanceof Error ? error.message : "Local isolation unavailable",
    }
  }
  return { platform: process.platform, local }
}
