import { constants } from "node:fs"
import { lstat, open, realpath, readdir } from "node:fs/promises"
import path from "node:path"
import { fileMimeType } from "../src/shared/file-reference"

export async function workspacePath(
  root: string,
  input: string,
  allowMissing = false
) {
  if (
    typeof input !== "string" ||
    !input ||
    input.length > 4096 ||
    /[\0\r\n]/.test(input)
  )
    throw new Error("文件路径无效")
  const base = await realpath(root)
  const normalized = input.replace(/^\/workspace(?:\/|$)/, "")
  const target = path.resolve(base, normalized)
  const relative = path.relative(base, target)
  if (
    !relative ||
    relative.startsWith(".." + path.sep) ||
    relative === ".." ||
    path.isAbsolute(relative)
  )
    throw new Error("只能访问本次对话工作区内的文件")
  let current = base
  const segments = relative.split(path.sep)
  for (let i = 0; i < segments.length; i++) {
    current = path.join(current, segments[i]!)
    try {
      const stat = await lstat(current)
      if (
        stat.isSymbolicLink() ||
        (i < segments.length - 1 && !stat.isDirectory())
      )
        throw new Error("不支持符号链接或特殊文件")
      if (i === segments.length - 1 && (!stat.isFile() || stat.nlink !== 1))
        throw new Error("不支持特殊文件或硬链接")
    } catch (error) {
      if (allowMissing && (error as NodeJS.ErrnoException).code === "ENOENT")
        return target
      throw error
    }
  }
  if ((await realpath(path.dirname(target))) !== path.dirname(target))
    throw new Error("文件目录已更改")
  return target
}

async function readWorkspaceBytes(
  root: string,
  input: string,
  maximum = 20 * 1024 * 1024
) {
  const target = await workspacePath(root, input)
  const file = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const stat = await file.stat()
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > maximum)
      throw new Error("文件超过预览限制或不是普通文件")
    // 按上限读取，避免校验后文件持续增长导致无界分配
    const chunks: Buffer[] = []
    let length = 0
    while (length <= maximum) {
      const chunk = Buffer.allocUnsafe(
        Math.min(64 * 1024, maximum + 1 - length)
      )
      const { bytesRead } = await file.read(chunk, 0, chunk.length, null)
      if (!bytesRead) break
      chunks.push(chunk.subarray(0, bytesRead))
      length += bytesRead
    }
    if (length > maximum) throw new Error("文件超过预览限制")
    const buffer = Buffer.concat(chunks, length)
    return {
      path: path.relative(await realpath(root), target),
      buffer,
      size: buffer.length,
    }
  } finally {
    await file.close()
  }
}

export async function readWorkspaceFile(
  root: string,
  input: string,
  maximum = 20 * 1024 * 1024
) {
  const { buffer, ...file } = await readWorkspaceBytes(root, input, maximum)
  if (buffer.includes(0)) throw new Error("此文件需要用外部应用查看")
  return {
    ...file,
    content: new TextDecoder("utf-8", { fatal: true }).decode(buffer),
  }
}

export async function readWorkspaceAsset(root: string, input: string) {
  const { buffer, ...file } = await readWorkspaceBytes(root, input)
  const mimeType = fileMimeType(file.path)
  if (mimeType.startsWith("text/")) {
    if (buffer.includes(0)) throw new Error("此文件需要用外部应用查看")
    new TextDecoder("utf-8", { fatal: true }).decode(buffer)
  }
  return { ...file, mimeType, data: buffer.toString("base64") }
}

export async function findWorkspaceFiles(root: string, name: string) {
  if (
    !name ||
    name.length > 255 ||
    /[\\/\0\r\n]/.test(name) ||
    name === "." ||
    name === ".."
  )
    throw new Error("文件名无效")
  const base = await realpath(root)
  const directories = [base]
  const paths: string[] = []
  let examined = 0
  while (directories.length && examined < 10000 && paths.length < 50) {
    const directory = directories.shift()!
    const stat = await lstat(directory).catch(() => null)
    if (
      !stat?.isDirectory() ||
      stat.isSymbolicLink() ||
      (await realpath(directory)) !== directory
    )
      continue
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (++examined > 10000) break
      if (entry.isSymbolicLink()) continue
      const target = path.join(directory, entry.name)
      if (
        entry.isDirectory() &&
        ![".git", "node_modules", ".venv", "vendor"].includes(entry.name)
      )
        directories.push(target)
      else if (entry.isFile() && entry.name === name && paths.length < 50) {
        try {
          paths.push(path.relative(base, await workspacePath(base, target)))
        } catch {
          /* 跳过查找期间已变更的文件 */
        }
      }
    }
  }
  return { paths: paths.sort((a, b) => a.localeCompare(b)) }
}
