import { createHash } from "node:crypto"
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { gzipSync } from "node:zlib"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  createRuntimeManager,
  downloadRuntimeArchive,
  getRuntimeArchive,
  validateRuntimeDownloadURL,
} from "./runtimes"
import {
  extractRuntimeArchive,
  validateRuntimeArchiveLink,
  validateRuntimeArchivePath,
} from "./runtimes-archive"

const directories: string[] = []
async function temporary() {
  const dir = await mkdtemp(path.join(tmpdir(), "buddy-runtime-test-"))
  directories.push(dir)
  return dir
}
afterEach(async () => {
  vi.unstubAllGlobals()
  await Promise.all(
    directories
      .splice(0)
      .map((dir) => rm(dir, { recursive: true, force: true }))
  )
})

type TarEntry = {
  name: string
  data?: string
  kind?: string
  target?: string
  size?: number
  mode?: number
}
function tarArchive(entries: TarEntry[]) {
  const chunks: Buffer[] = []
  for (const entry of entries) {
    const data = Buffer.from(entry.data ?? "")
    const header = Buffer.alloc(512)
    header.write(entry.name, 0, 100)
    header.write(
      (entry.mode ?? 0o755).toString(8).padStart(7, "0") + "\0",
      100,
      8
    )
    header.write("0000000\0", 108, 8)
    header.write("0000000\0", 116, 8)
    header.write(
      (entry.size ?? data.length).toString(8).padStart(11, "0") + "\0",
      124,
      12
    )
    header.fill(32, 148, 156)
    header.write(entry.kind ?? "0", 156, 1)
    if (entry.target) header.write(entry.target, 157, 100)
    header.write("ustar\0", 257, 6)
    const checksum = header.reduce((sum, byte) => sum + byte, 0)
    header.write(checksum.toString(8).padStart(6, "0") + "\0 ", 148, 8)
    chunks.push(header, data, Buffer.alloc((512 - (data.length % 512)) % 512))
  }
  chunks.push(Buffer.alloc(1024))
  return gzipSync(Buffer.concat(chunks))
}
async function extract(entries: TarEntry[]) {
  const dir = await temporary()
  const archive = path.join(dir, "archive.tar.gz")
  const destination = path.join(dir, "extract")
  await mkdir(destination, { mode: 0o700 })
  await writeFile(archive, tarArchive(entries))
  await extractRuntimeArchive(archive, destination, "runtime")
  return destination
}

it("pins independent SHA256 hashes for all supported Python and Node targets", () => {
  for (const kind of ["node", "python"] as const) {
    for (const platform of ["darwin", "linux"] as const) {
      for (const arch of ["arm64", "x64"] as const) {
        const archive = getRuntimeArchive(kind, platform, arch)!
        expect(archive.sha256).toMatch(/^[a-f0-9]{64}$/)
        expect(validateRuntimeDownloadURL(archive.url, kind)).toBe(archive.url)
        expect(archive.executable).toMatch(/^bin\//)
      }
    }
  }
  expect(getRuntimeArchive("node", "win32", "x64")).toBeUndefined()
  expect(getRuntimeArchive("python", "linux", "ia32")).toBeUndefined()
})

it("rejects plaintext, credentials, ports and foreign redirect origins", () => {
  for (const url of [
    "http://nodejs.org/file",
    "https://user@nodejs.org/file",
    "https://nodejs.org:444/file",
    "https://nodejs.org.attacker.test/file",
    "https://github.com/file",
  ]) {
    expect(() => validateRuntimeDownloadURL(url, "node")).toThrow()
  }
  expect(
    validateRuntimeDownloadURL(
      "https://release-assets.githubusercontent.com/file",
      "python"
    )
  ).toContain("https://")
})

it("checks SHA256 before accepting a downloaded archive", async () => {
  const bytes = Buffer.from("archive")
  const sha256 = createHash("sha256").update(bytes).digest("hex")
  const archive = { ...getRuntimeArchive("node", "darwin", "arm64")!, sha256 }
  const fetchMock = vi.fn(async () => new Response(bytes))
  vi.stubGlobal("fetch", fetchMock)
  const dir = await temporary()
  await downloadRuntimeArchive(archive, path.join(dir, "valid.gz"))
  expect(await readFile(path.join(dir, "valid.gz"))).toEqual(bytes)
  await expect(
    downloadRuntimeArchive(
      { ...archive, sha256: "0".repeat(64) },
      path.join(dir, "bad.gz")
    )
  ).rejects.toThrow("SHA256")
})

it("rejects foreign redirects and cancels before any download", async () => {
  const fetchMock = vi.fn(
    async () =>
      new Response(null, {
        status: 302,
        headers: { location: "https://attacker.test/archive" },
      })
  )
  vi.stubGlobal("fetch", fetchMock)
  const dir = await temporary()
  const archive = getRuntimeArchive("python", "darwin", "arm64")!
  await expect(
    downloadRuntimeArchive(archive, path.join(dir, "bad.gz"))
  ).rejects.toThrow("origin")
  expect(fetchMock).toHaveBeenCalledTimes(1)
  const controller = new AbortController()
  controller.abort()
  await expect(
    downloadRuntimeArchive(
      archive,
      path.join(dir, "cancel.gz"),
      controller.signal
    )
  ).rejects.toThrow("cancelled")
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

it("status does not create directories, execute programs, or install silently", async () => {
  const parent = await temporary()
  const directory = path.join(parent, "not-created")
  const fetchMock = vi.fn()
  vi.stubGlobal("fetch", fetchMock)
  const manager = createRuntimeManager({ directory })
  const status = await manager.status()
  expect(status.node.installed).toBe(false)
  expect(status.python.installed).toBe(false)
  await expect(stat(directory)).rejects.toThrow()
  expect(fetchMock).not.toHaveBeenCalled()
  expect(() => createRuntimeManager({ directory: "relative" })).toThrow(
    "absolute"
  )
})

it("does not overwrite an invalid existing runtime installation", async () => {
  const root = await temporary()
  const archive = getRuntimeArchive("node")
  if (!archive) return
  const existing = path.join(
    root,
    `node-${archive.version}-${archive.platform}-${archive.arch}`
  )
  await mkdir(existing)
  await writeFile(path.join(existing, "user-file"), "keep")
  const fetchMock = vi.fn()
  vi.stubGlobal("fetch", fetchMock)
  await expect(
    createRuntimeManager({ directory: root }).install("node")
  ).rejects.toThrow("not be overwritten")
  expect(await readFile(path.join(existing, "user-file"), "utf8")).toBe("keep")
  expect(fetchMock).not.toHaveBeenCalled()
})

it("rejects shared and symlink runtime directories", async () => {
  const dir = await temporary()
  const root = path.join(dir, "runtimes")
  await mkdir(root)
  await chmod(root, 0o777)
  await expect(
    createRuntimeManager({ directory: root }).install("node")
  ).rejects.toThrow("private")
  const alias = path.join(dir, "alias")
  await symlink(root, alias)
  await expect(
    createRuntimeManager({ directory: alias }).install("python")
  ).rejects.toThrow("symlink")
})

it("extracts regular files and safe deferred links without special permission bits", async () => {
  const destination = await extract([
    { name: "runtime/", kind: "5" },
    { name: "runtime/bin/tool", data: "binary", mode: 0o6755 },
    { name: "runtime/bin/alias", kind: "2", target: "tool" },
    { name: "runtime/bin/copy", kind: "1", target: "runtime/bin/tool" },
  ])
  expect(await readFile(path.join(destination, "bin/alias"), "utf8")).toBe(
    "binary"
  )
  expect(await readFile(path.join(destination, "bin/copy"), "utf8")).toBe(
    "binary"
  )
  expect((await stat(path.join(destination, "bin/tool"))).mode & 0o7000).toBe(0)
})

it("rejects traversal, absolute paths, outside links, link directories and special entries", async () => {
  expect(() =>
    validateRuntimeArchivePath("runtime/../escape", "runtime")
  ).toThrow()
  expect(() => validateRuntimeArchivePath("/runtime/file", "runtime")).toThrow()
  expect(() => validateRuntimeArchiveLink("bin/tool", "../../escape")).toThrow()
  await expect(
    extract([{ name: "runtime/../../escape", data: "no" }])
  ).rejects.toThrow("root")
  await expect(
    extract([{ name: "runtime/bin/tool", kind: "2", target: "/etc/passwd" }])
  ).rejects.toThrow("link")
  await expect(
    extract([
      { name: "runtime/bin", kind: "2", target: "." },
      { name: "runtime/bin/tool", data: "no" },
    ])
  ).rejects.toThrow("link directory")
  await expect(extract([{ name: "runtime/fifo", kind: "6" }])).rejects.toThrow(
    "Special"
  )
  await expect(
    extract([{ name: "runtime/large", size: 129 * 1024 * 1024 }])
  ).rejects.toThrow("size limit")
})

it("cleans temporary installation data after a checksum failure", async () => {
  const root = await temporary()
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("wrong bytes"))
  )
  await expect(
    createRuntimeManager({ directory: root }).install("node")
  ).rejects.toThrow("SHA256")
  expect(await readdir(root)).toEqual([])
})

describe.runIf(process.env.BUDDY_RUNTIME_INSTALL_TEST === "1")(
  "managed official runtime installation",
  () => {
    it.each(["node", "python"] as const)(
      "installs and verifies standalone %s explicitly",
      async (kind) => {
        const root = await temporary()
        const manager = createRuntimeManager({ directory: root })
        const installed = await manager.install(kind)
        expect(installed.installed).toBe(true)
        const status = await manager.status()
        expect(status[kind].executable).toBe(installed.executable)
        expect(
          (await readdir(root)).some((name) => name.startsWith(".install"))
        ).toBe(false)
      },
      180000
    )
  }
)
