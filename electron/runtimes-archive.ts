import { constants, createReadStream } from "node:fs"
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  open,
  realpath,
  symlink,
} from "node:fs/promises"
import path from "node:path"
import { pipeline } from "node:stream/promises"
import { createGunzip } from "node:zlib"

const MAX_EXPANDED_BYTES = 512 * 1024 * 1024
const MAX_ENTRY_BYTES = 128 * 1024 * 1024
const MAX_ENTRIES = 30000

export function validateRuntimeArchivePath(value: string, root: string) {
  if (
    !value ||
    value.length > 4096 ||
    /[\0\r\n\\]/.test(value) ||
    value.startsWith("/")
  )
    throw new Error("Unsafe runtime archive path")
  const trimmed = value.replace(/^\.\//, "").replace(/\/$/, "")
  const parts = trimmed.split("/")
  if (
    parts.some((part) => !part || part === "." || part === "..") ||
    parts[0] !== root
  )
    throw new Error("Runtime archive escapes its root")
  return parts.slice(1).join("/")
}

export function validateRuntimeArchiveLink(relative: string, target: string) {
  if (
    !target ||
    target.length > 4096 ||
    /[\0\r\n\\]/.test(target) ||
    path.posix.isAbsolute(target)
  )
    throw new Error("Unsafe runtime archive link")
  const resolved = path.posix.normalize(
    path.posix.join(path.posix.dirname(relative), target)
  )
  if (
    resolved === ".." ||
    resolved.startsWith("../") ||
    resolved.startsWith("/")
  )
    throw new Error("Runtime archive link escapes its root")
  return resolved
}

function numberField(buffer: Buffer) {
  const text = buffer.toString("ascii").replace(/\0/g, "").trim()
  if (text && !/^[0-7]+$/.test(text)) throw new Error("Invalid tar number")
  const value = text ? parseInt(text, 8) : 0
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error("Invalid tar number")
  return value
}

function textField(buffer: Buffer) {
  const end = buffer.indexOf(0)
  return buffer.subarray(0, end < 0 ? buffer.length : end).toString("utf8")
}

function parsePax(buffer: Buffer) {
  const fields: Record<string, string> = {}
  let offset = 0
  while (offset < buffer.length) {
    const space = buffer.indexOf(32, offset)
    if (
      space < 0 ||
      !/^\d+$/.test(buffer.subarray(offset, space).toString("ascii"))
    )
      throw new Error("Invalid PAX record")
    const length = Number(buffer.subarray(offset, space).toString("ascii"))
    if (
      !Number.isSafeInteger(length) ||
      length <= space - offset + 2 ||
      offset + length > buffer.length ||
      buffer[offset + length - 1] !== 10
    )
      throw new Error("Invalid PAX length")
    const record = buffer
      .subarray(space + 1, offset + length - 1)
      .toString("utf8")
    const equal = record.indexOf("=")
    if (equal < 1 || record.startsWith("GNU.sparse"))
      throw new Error("Unsupported PAX record")
    fields[record.slice(0, equal)] = record.slice(equal + 1)
    offset += length
  }
  return fields
}

export async function extractRuntimeArchive(
  archive: string,
  destination: string,
  archiveRoot: string,
  signal?: AbortSignal
) {
  const dest = await realpath(destination)
  if ((await lstat(destination)).isSymbolicLink())
    throw new Error("Unsafe extraction destination")
  const source = createReadStream(archive)
  const unzip = createGunzip()
  const completion = pipeline(source, unzip)
  void completion.catch(() => {})
  const iterator = unzip[Symbol.asyncIterator]()
  let pending = Buffer.alloc(0)
  let expanded = 0
  let count = 0
  const kinds = new Map<string, string>()
  const links: { relative: string; target: string; kind: string }[] = []
  let pax: Record<string, string> = {}
  const take = async (bytes: number): Promise<Buffer> => {
    if (signal?.aborted) throw new Error("Runtime installation cancelled")
    while (pending.length < bytes) {
      const next = await iterator.next()
      if (next.done) throw new Error("Truncated runtime archive")
      expanded += next.value.length
      if (expanded > MAX_EXPANDED_BYTES)
        throw new Error("Expanded runtime exceeds size limit")
      pending = Buffer.concat([pending, next.value])
    }
    const output = pending.subarray(0, bytes)
    pending = pending.subarray(bytes)
    return output
  }
  try {
    for (;;) {
      const header = await take(512)
      if (header.every((byte) => byte === 0)) {
        const second = await take(512)
        if (!second.every((byte) => byte === 0))
          throw new Error("Invalid tar terminator")
        if (pending.some((byte) => byte !== 0))
          throw new Error("Unexpected trailing tar data")
        for await (const chunk of { [Symbol.asyncIterator]: () => iterator }) {
          expanded += chunk.length
          if (
            expanded > MAX_EXPANDED_BYTES ||
            chunk.some((byte: number) => byte !== 0)
          )
            throw new Error("Unexpected trailing tar data")
        }
        break
      }
      let checksum = 0
      for (let i = 0; i < 512; i++)
        checksum += i >= 148 && i < 156 ? 32 : header[i]
      if (checksum !== numberField(header.subarray(148, 156)))
        throw new Error("Invalid tar header checksum")
      if (++count > MAX_ENTRIES)
        throw new Error("Runtime archive exceeds entry limit")
      const size = numberField(header.subarray(124, 136))
      if (size > MAX_ENTRY_BYTES)
        throw new Error("Runtime archive entry exceeds size limit")
      const kind = String.fromCharCode(header[156])
      const padding = (512 - (size % 512)) % 512
      if (kind === "x" || kind === "g") {
        if (size > 64 * 1024) throw new Error("PAX record exceeds size limit")
        const fields = parsePax(await take(size))
        if (padding) await take(padding)
        if (kind === "g") {
          if (fields.path || fields.linkpath || fields.size)
            throw new Error("Unsafe global PAX record")
        } else pax = fields
        continue
      }
      if (kind === "L" || kind === "K") {
        if (size > 4096) throw new Error("Long tar path exceeds size limit")
        pax[kind === "L" ? "path" : "linkpath"] = textField(
          await take(size)
        ).replace(/\n$/, "")
        if (padding) await take(padding)
        continue
      }
      const prefix = textField(header.subarray(345, 500))
      const name =
        pax.path ??
        (prefix
          ? `${prefix}/${textField(header.subarray(0, 100))}`
          : textField(header.subarray(0, 100)))
      if (pax.size !== undefined && Number(pax.size) !== size)
        throw new Error("Unsupported PAX size override")
      const relative = validateRuntimeArchivePath(name, archiveRoot)
      const target = pax.linkpath ?? textField(header.subarray(157, 257))
      pax = {}
      if (!["0", "\0", "5", "2", "1"].includes(kind))
        throw new Error("Special runtime archive entries are not allowed")
      if (!relative && kind !== "5")
        throw new Error("Invalid runtime archive root entry")
      if (kinds.has(relative) && (kind !== "5" || kinds.get(relative) !== "5"))
        throw new Error("Duplicate runtime archive entry")
      kinds.set(relative, kind)
      const full = path.join(dest, relative)
      if (kind === "5") {
        if (size) throw new Error("Directory tar entry has content")
        await mkdir(full, { recursive: true, mode: 0o755 })
      } else if (kind === "2" || kind === "1") {
        if (size) throw new Error("Link tar entry has content")
        const resolved =
          kind === "1"
            ? validateRuntimeArchivePath(target, archiveRoot)
            : validateRuntimeArchiveLink(relative, target)
        links.push({ relative, target: resolved, kind })
      } else {
        await mkdir(path.dirname(full), { recursive: true, mode: 0o755 })
        const file = await open(
          full,
          constants.O_WRONLY |
            constants.O_CREAT |
            constants.O_EXCL |
            constants.O_NOFOLLOW,
          0o600
        )
        try {
          let remaining = size
          while (remaining) {
            const chunk = await take(Math.min(remaining, 64 * 1024))
            let written = 0
            while (written < chunk.length)
              written += (
                await file.write(chunk, written, chunk.length - written)
              ).bytesWritten
            remaining -= chunk.length
          }
        } finally {
          await file.close()
        }
        await chmod(full, numberField(header.subarray(100, 108)) & 0o755)
      }
      if (padding) await take(padding)
    }
    for (const link of links) {
      for (const entry of kinds.keys()) {
        if (entry.startsWith(`${link.relative}/`))
          throw new Error("Archive traverses a link directory")
      }
      if (!kinds.has(link.target) && link.target !== ".")
        throw new Error("Archive link target does not exist")
      await mkdir(path.dirname(path.join(dest, link.relative)), {
        recursive: true,
        mode: 0o755,
      })
    }
    for (const link of links.filter((entry) => entry.kind === "1")) {
      if (!["0", "\0"].includes(kinds.get(link.target) ?? ""))
        throw new Error("Unsafe archive hard link")
      await copyFile(
        path.join(dest, link.target),
        path.join(dest, link.relative),
        constants.COPYFILE_EXCL
      )
    }
    for (const link of links.filter((entry) => entry.kind === "2")) {
      const relativeTarget =
        path.posix.relative(path.posix.dirname(link.relative), link.target) ||
        "."
      await symlink(relativeTarget, path.join(dest, link.relative))
    }
    await completion
  } finally {
    source.destroy()
    unzip.destroy()
    await completion.catch(() => {})
  }
}
