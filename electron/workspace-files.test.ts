import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { mkdtemp, mkdir, writeFile, rm, symlink, link } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import {
  readWorkspaceAsset,
  readWorkspaceFile,
  findWorkspaceFiles,
} from "./workspace-files"

describe("workspace preview files", () => {
  let directory: string, root: string
  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "buddy-preview-"))
    root = path.join(directory, "workspace")
    await mkdir(root)
  })
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })
  it("preserves binary media bytes without weakening text checkpoint validation", async () => {
    const binary = Buffer.from([137, 80, 78, 71, 0, 255])
    await writeFile(path.join(root, "image.png"), binary)
    const asset = await readWorkspaceAsset(root, "/workspace/image.png")
    expect(asset.mimeType).toBe("image/png")
    expect(Buffer.from(asset.data, "base64")).toEqual(binary)
    await expect(readWorkspaceFile(root, "image.png")).rejects.toThrow()
    await writeFile(path.join(root, "README.md"), "# 中文")
    expect((await readWorkspaceAsset(root, "README.md")).mimeType).toBe(
      "text/markdown"
    )
  })
  it("rejects escapes, links, unsupported binary files and oversized media", async () => {
    await writeFile(path.join(directory, "outside.png"), "outside")
    await symlink(
      path.join(directory, "outside.png"),
      path.join(root, "link.png")
    )
    await link(path.join(directory, "outside.png"), path.join(root, "hard.png"))
    await writeFile(path.join(root, "data.bin"), Buffer.from([0, 255]))
    await writeFile(
      path.join(root, "huge.png"),
      Buffer.alloc(20 * 1024 * 1024 + 1)
    )
    for (const input of [
      "../outside.png",
      "link.png",
      "hard.png",
      "data.bin",
      "huge.png",
    ])
      await expect(readWorkspaceAsset(root, input)).rejects.toThrow()
  })
  it("finds ambiguous bare names in workspace directories and skips dependency and symlink trees", async () => {
    for (const name of ["src", "docs", "node_modules", ".git"]) {
      await mkdir(path.join(root, name))
      await writeFile(path.join(root, name, "README.md"), "readme")
    }
    await symlink(path.join(root, "src"), path.join(root, "alias"))
    expect((await findWorkspaceFiles(root, "README.md")).paths).toEqual([
      "docs/README.md",
      "src/README.md",
    ])
    await expect(findWorkspaceFiles(root, "../README.md")).rejects.toThrow()
  })
})
