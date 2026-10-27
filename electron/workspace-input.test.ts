import { createHash } from "node:crypto"
import {
  link,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  readWorkspaceInputFile,
  writeWorkspaceInputFile,
} from "./workspace-input"

const digest = (data: Buffer) => createHash("sha256").update(data).digest("hex")

describe("workspace input files", () => {
  let directory: string
  let root: string
  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "buddy-sync-"))
    root = path.join(directory, "workspace")
    await mkdir(root)
  })
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it("round trips binary bytes and compares the actual local digest before overwriting", async () => {
    const input = `inbound/${"a".repeat(64)}-data.bin`
    const first = Buffer.from([0, 255, 192, 128])
    const next = Buffer.from("中文内容")
    await writeWorkspaceInputFile(
      root,
      input,
      first.toString("base64"),
      digest(first),
      null
    )
    expect(await readFile(path.join(root, input))).toEqual(first)
    expect(await readWorkspaceInputFile(root, input)).toEqual({
      relative_path: input,
      data: first.toString("base64"),
      size: first.length,
      sha256: digest(first),
    })
    await expect(
      writeWorkspaceInputFile(
        root,
        input,
        next.toString("base64"),
        digest(next),
        null
      )
    ).rejects.toThrow("附件路径已有不同内容")
    await writeWorkspaceInputFile(
      root,
      input,
      next.toString("base64"),
      digest(next),
      digest(first)
    )
    expect(await readFile(path.join(root, input))).toEqual(next)
    expect(await readdir(path.join(root, "inbound"))).toEqual([path.basename(input)])
  })

  it.each([
    `inbound/${"a".repeat(64)}-../outside`,
    `inbound/${"a".repeat(64)}-/absolute`,
    ".git/config",
    "notes.txt",
    `inbound/${"a".repeat(64)}-a\\b`,
    `inbound/${"a".repeat(64)}-a:b`,
  ])("rejects unsafe metadata/path %s for reads and writes", async (input) => {
    await expect(readWorkspaceInputFile(root, input)).rejects.toThrow()
    await expect(
      writeWorkspaceInputFile(root, input, "", digest(Buffer.alloc(0)), null)
    ).rejects.toThrow()
  })

  it("rejects symlinks, hardlinks, oversized content and invalid download digests", async () => {
    const outside = path.join(directory, "outside")
    await writeFile(outside, "private")
    const inbound = path.join(root, "inbound")
    await mkdir(inbound)
    const linked = `inbound/${"a".repeat(64)}-linked`
    const hard = `inbound/${"b".repeat(64)}-hard`
    const parent = `inbound/${"c".repeat(64)}-parent`
    const large = `inbound/${"d".repeat(64)}-large`
    await symlink(outside, path.join(root, linked))
    await link(outside, path.join(root, hard))
    await symlink(directory, path.join(root, parent))
    await writeFile(
      path.join(root, large),
      Buffer.alloc(10 * 1024 * 1024 + 1)
    )
    for (const input of [linked, hard, `${parent}/outside`, large])
      await expect(readWorkspaceInputFile(root, input)).rejects.toThrow()
    for (const input of [linked, hard, `${parent}/new`])
      await expect(
        writeWorkspaceInputFile(root, input, "", digest(Buffer.alloc(0)), null)
      ).rejects.toThrow()
    const invalidDigest = `inbound/${"e".repeat(64)}-bad`
    await expect(
      writeWorkspaceInputFile(
        root,
        invalidDigest,
        "aGk=",
        digest(Buffer.alloc(0)),
        null
      )
    ).rejects.toThrow("校验失败")
    await expect(
      writeWorkspaceInputFile(
        root,
        invalidDigest,
        "aGk=\n",
        digest(Buffer.from("hi")),
        null
      )
    ).rejects.toThrow("校验失败")
    expect(await readFile(outside, "utf8")).toBe("private")
  })
})
