import { createHash } from "node:crypto"
import { constants } from "node:fs"
import {
  access,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises"
import path from "node:path"
import { executeBounded } from "./execution-process"
import { extractRuntimeArchive } from "./runtimes-archive"
import { getRuntimeArchive } from "./runtimes-manifest"
import type { ManagedRuntimeKind, RuntimeArchive } from "./runtimes-manifest"

export type { ManagedRuntimeKind, RuntimeArchive } from "./runtimes-manifest"
export { getRuntimeArchive } from "./runtimes-manifest"

type ManagedRuntimeStatus = {
  kind: ManagedRuntimeKind
  supported: boolean
  installed: boolean
  version: string | null
  executable?: string
  directory?: string
  message: string
}
export type ManagedRuntimeStatuses = {
  node: ManagedRuntimeStatus
  python: ManagedRuntimeStatus
}
export type RuntimeManager = {
  status: () => Promise<ManagedRuntimeStatuses>
  install: (
    kind: ManagedRuntimeKind,
    options?: { signal?: AbortSignal }
  ) => Promise<ManagedRuntimeStatus>
}

const MAX_DOWNLOAD_BYTES = 128 * 1024 * 1024
const installing = new Map<string, Promise<ManagedRuntimeStatus>>()

export function validateRuntimeDownloadURL(
  value: string,
  kind: ManagedRuntimeKind
) {
  const url = new URL(value)
  const hosts =
    kind === "node"
      ? ["nodejs.org"]
      : [
          "api.github.com",
          "github.com",
          "release-assets.githubusercontent.com",
          "objects.githubusercontent.com",
        ]
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !hosts.includes(url.hostname)
  )
    throw new Error("Untrusted runtime download origin")
  return url.href
}

export async function hashRuntimeFile(file: string) {
  const hash = createHash("sha256")
  const fileHandle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
  const stream = fileHandle.createReadStream({ autoClose: false })
  let bytes = 0
  try {
    if (!(await fileHandle.stat()).isFile())
      throw new Error("Invalid runtime file")
    for await (const chunk of stream) {
      bytes += chunk.length
      if (bytes > MAX_DOWNLOAD_BYTES)
        throw new Error("Runtime file exceeds size limit")
      hash.update(chunk)
    }
    return hash.digest("hex")
  } finally {
    stream.destroy()
    await fileHandle.close()
  }
}

export async function downloadRuntimeArchive(
  archive: RuntimeArchive,
  destination: string,
  signal?: AbortSignal,
  request: typeof globalThis.fetch = globalThis.fetch
) {
  const deadline = AbortSignal.timeout(120000)
  const abort = signal ? AbortSignal.any([deadline, signal]) : deadline
  let url = validateRuntimeDownloadURL(archive.url, archive.kind)
  let response: Awaited<ReturnType<typeof fetch>> | undefined
  for (let redirect = 0; redirect <= 5; redirect++) {
    if (abort.aborted)
      throw new Error("Runtime installation cancelled or timed out")
    response = await request(url, {
      redirect: "manual",
      signal: abort,
      headers: {
        "User-Agent": "FbaBuddy-Runtime-Installer",
        ...(archive.kind === "python"
          ? {
              Accept: "application/octet-stream",
              "X-GitHub-Api-Version": "2022-11-28",
            }
          : {}),
      },
    })
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location")
      await response.body?.cancel()
      if (!location || redirect === 5)
        throw new Error("Invalid runtime download redirect")
      url = validateRuntimeDownloadURL(
        new URL(location, url).href,
        archive.kind
      )
      continue
    }
    break
  }
  if (!response?.ok || !response.body)
    throw new Error(
      `Runtime download failed (${response?.status ?? "no response"})`
    )
  const length = response.headers.get("content-length")
  if (
    length &&
    (!/^\d+$/.test(length) || Number(length) > MAX_DOWNLOAD_BYTES)
  ) {
    await response.body.cancel()
    throw new Error("Runtime download exceeds size limit")
  }
  const file = await open(
    destination,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_NOFOLLOW,
    0o600
  )
  const reader = response.body.getReader()
  const hash = createHash("sha256")
  let bytes = 0
  try {
    for (;;) {
      if (abort.aborted)
        throw new Error("Runtime installation cancelled or timed out")
      const next = await reader.read()
      if (next.done) break
      bytes += next.value.length
      if (bytes > MAX_DOWNLOAD_BYTES)
        throw new Error("Runtime download exceeds size limit")
      hash.update(next.value)
      let written = 0
      while (written < next.value.length)
        written += (
          await file.write(next.value, written, next.value.length - written)
        ).bytesWritten
    }
    if (length && bytes !== Number(length))
      throw new Error("Truncated runtime download")
    if (hash.digest("hex") !== archive.sha256)
      throw new Error("Runtime SHA256 verification failed")
    await file.sync()
  } finally {
    await reader.cancel().catch(() => {})
    await file.close()
  }
}

function runtimeDirectory(root: string, archive: RuntimeArchive) {
  return path.join(
    root,
    `${archive.kind}-${archive.version}-${archive.platform}-${archive.arch}`
  )
}

async function statusFor(
  root: string,
  kind: ManagedRuntimeKind
): Promise<ManagedRuntimeStatus> {
  const archive = getRuntimeArchive(kind)
  const base: ManagedRuntimeStatus = {
    kind,
    supported: Boolean(archive),
    installed: false,
    version: archive?.version ?? null,
    message: archive
      ? "Not installed"
      : "Unsupported runtime platform or architecture",
  }
  if (!archive) return base
  try {
    const rootInfo = await lstat(root)
    if (
      !rootInfo.isDirectory() ||
      rootInfo.isSymbolicLink() ||
      rootInfo.mode & 0o022
    )
      throw new Error("Runtime directory must be private and not a symlink")
    const directory = runtimeDirectory(await realpath(root), archive)
    const directoryInfo = await lstat(directory)
    if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink())
      throw new Error("Invalid managed runtime directory")
    const receiptPath = path.join(directory, ".buddy-runtime.json")
    const receiptInfo = await lstat(receiptPath)
    if (
      !receiptInfo.isFile() ||
      receiptInfo.isSymbolicLink() ||
      receiptInfo.size > 8192
    )
      throw new Error("Invalid runtime installation receipt")
    const receipt = JSON.parse(await readFile(receiptPath, "utf8")) as Record<
      string,
      unknown
    >
    const executable = path.join(directory, archive.executable)
    const executableInfo = await lstat(executable)
    if (
      !executableInfo.isFile() ||
      executableInfo.isSymbolicLink() ||
      (await realpath(executable)) !== executable
    )
      throw new Error("Invalid managed runtime executable")
    await access(executable, constants.X_OK)
    if (
      receipt.kind !== kind ||
      receipt.version !== archive.version ||
      receipt.archiveSHA256 !== archive.sha256 ||
      receipt.platform !== archive.platform ||
      receipt.arch !== archive.arch ||
      receipt.executableSHA256 !== (await hashRuntimeFile(executable))
    )
      throw new Error("Managed runtime integrity check failed")
    return { ...base, installed: true, directory, executable, message: "" }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return base
    return {
      ...base,
      message:
        error instanceof Error ? error.message : "Managed runtime is invalid",
    }
  }
}

export function createRuntimeManager(options: {
  directory: string
  fetch?: typeof globalThis.fetch
}): RuntimeManager {
  if (
    typeof options.directory !== "string" ||
    !path.isAbsolute(options.directory) ||
    /[\0\r\n]/.test(options.directory) ||
    path.resolve(options.directory) === path.parse(options.directory).root
  )
    throw new Error("Select an absolute managed runtime directory")
  const root = path.resolve(options.directory)
  const install = async (
    kind: ManagedRuntimeKind,
    config: { signal?: AbortSignal } = {}
  ): Promise<ManagedRuntimeStatus> => {
    const archive = getRuntimeArchive(kind)
    if (!archive)
      throw new Error("Unsupported runtime platform or architecture")
    if (config.signal?.aborted)
      throw new Error("Runtime installation cancelled")
    const key = `${root}:${kind}`
    const pending = installing.get(key)
    if (pending) return pending
    const work = (async () => {
      const current = await statusFor(root, kind)
      if (current.installed) return current
      await mkdir(root, { recursive: true, mode: 0o700 })
      const rootInfo = await lstat(root)
      if (
        !rootInfo.isDirectory() ||
        rootInfo.isSymbolicLink() ||
        rootInfo.mode & 0o022 ||
        (process.getuid && rootInfo.uid !== process.getuid())
      )
        throw new Error(
          "Runtime directory must be private, owned by this user, and not a symlink"
        )
      const canonical = await realpath(root)
      const target = runtimeDirectory(canonical, archive)
      try {
        await lstat(target)
        throw new Error(
          "An invalid runtime installation already exists; it will not be overwritten"
        )
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
      }
      const temporary = await mkdtemp(path.join(canonical, `.install-${kind}-`))
      const signal = config.signal
        ? AbortSignal.any([config.signal, AbortSignal.timeout(300000)])
        : AbortSignal.timeout(300000)
      try {
        const download = path.join(temporary, "archive.tar.gz")
        const extracted = path.join(temporary, "runtime")
        await downloadRuntimeArchive(archive, download, signal, options.fetch)
        await mkdir(extracted, { mode: 0o700 })
        await extractRuntimeArchive(download, extracted, archive.root, signal)
        if (signal.aborted)
          throw new Error("Runtime installation cancelled or timed out")
        const executable = path.join(extracted, archive.executable)
        const info = await lstat(executable)
        if (
          !info.isFile() ||
          info.isSymbolicLink() ||
          (await realpath(executable)) !== executable
        )
          throw new Error("Runtime executable is not a regular file")
        const version = await executeBounded({
          executable,
          args: ["--version"],
          cwd: extracted,
          env: {
            PATH: "/usr/bin:/bin",
            HOME: extracted,
            PYTHONNOUSERSITE: "1",
            PYTHONDONTWRITEBYTECODE: "1",
          },
          deadlineMs: 10000,
          maxOutputBytes: 8192,
          signal,
        })
        const expected =
          kind === "node" ? `v${archive.version}` : `Python ${archive.version}`
        if (
          version.code !== 0 ||
          (version.stdout + version.stderr).trim() !== expected
        )
          throw new Error("Runtime version or architecture verification failed")
        await writeFile(
          path.join(extracted, ".buddy-runtime.json"),
          JSON.stringify({
            kind,
            version: archive.version,
            platform: archive.platform,
            arch: archive.arch,
            archiveSHA256: archive.sha256,
            executableSHA256: await hashRuntimeFile(executable),
          }),
          { flag: "wx", mode: 0o444 }
        )
        if (signal.aborted)
          throw new Error("Runtime installation cancelled or timed out")
        await rename(extracted, target)
        const installed = await statusFor(canonical, kind)
        if (!installed.installed) throw new Error(installed.message)
        return installed
      } finally {
        await rm(temporary, { recursive: true, force: true })
      }
    })()
    installing.set(key, work)
    try {
      return await work
    } finally {
      installing.delete(key)
    }
  }
  return {
    status: async () => {
      const [node, python] = await Promise.all([
        statusFor(root, "node"),
        statusFor(root, "python"),
      ])
      return { node, python }
    },
    install,
  }
}
