import { createHash, randomUUID } from "node:crypto"
import { constants } from "node:fs"
import { mkdir, open, rename, rm, stat } from "node:fs/promises"
import path from "node:path"
import { workspacePath } from "./workspace-files"

const WORKSPACE_INPUT_MAX_FILE_BYTES = 10 * 1024 * 1024

function validateWorkspaceInputPath(input: string) {
  if (
    typeof input !== "string" ||
    input.length > 2048 ||
    /[\\:\0\r\n]/.test(input) ||
    !/^inbound\/[a-f0-9]{64}-[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(
      input
    ) ||
    input
      .split("/")
      .some(
        (part) =>
          !part ||
          part.endsWith(".") ||
          part.endsWith(" ") ||
          [".", "..", ".git"].includes(part.toLowerCase())
      )
  )
    throw new Error("附件导入路径无效")
  return input
}

export async function readWorkspaceInputFile(root: string, input: string) {
  const relativePath = validateWorkspaceInputPath(input)
  const target = await workspacePath(root, relativePath)
  const file = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const before = await file.stat()
    if (
      !before.isFile() ||
      before.nlink !== 1 ||
      before.size > WORKSPACE_INPUT_MAX_FILE_BYTES
    )
      throw new Error("附件只支持不超过 10 MiB 的普通文件")
    const data = Buffer.alloc(before.size + 1)
    let size = 0
    while (size < data.length) {
      const chunk = await file.read(data, size, data.length - size, null)
      if (!chunk.bytesRead) break
      size += chunk.bytesRead
    }
    const after = await file.stat()
    if (
      size !== before.size ||
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      after.ctimeMs !== before.ctimeMs
    )
      throw new Error("附件在读取期间发生变化，请重试")
    const bytes = data.subarray(0, size)
    return {
      relative_path: relativePath,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      size,
      data: bytes.toString("base64"),
    }
  } finally {
    await file.close()
  }
}

export async function writeWorkspaceInputFile(
  root: string,
  input: string,
  data: string,
  sha256: string,
  expectedLocalSha256: string | null
) {
  const relativePath = validateWorkspaceInputPath(input)
  if (
    typeof data !== "string" ||
    data.length > Math.ceil(WORKSPACE_INPUT_MAX_FILE_BYTES / 3) * 4 ||
    !/^[a-f0-9]{64}$/.test(sha256) ||
    (expectedLocalSha256 !== null &&
      !/^[a-f0-9]{64}$/.test(expectedLocalSha256))
  )
    throw new Error("附件内容或校验值无效")
  const bytes = Buffer.from(data, "base64")
  if (
    bytes.length > WORKSPACE_INPUT_MAX_FILE_BYTES ||
    bytes.toString("base64") !== data ||
    createHash("sha256").update(bytes).digest("hex") !== sha256
  )
    throw new Error("附件校验失败")
  const target = await workspacePath(root, relativePath, true)
  await mkdir(path.dirname(target), { recursive: true })
  await workspacePath(root, relativePath, true)
  const temporary = path.join(
    path.dirname(target),
    `.buddy-input-${randomUUID()}`
  )
  const file = await open(
    temporary,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_NOFOLLOW,
    0o600
  )
  try {
    await file.writeFile(bytes)
    await file.sync()
    const existing = await readWorkspaceInputFile(root, relativePath).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null
        throw error
      }
    )
    if ((existing?.sha256 ?? null) !== expectedLocalSha256)
      throw new Error("附件路径已有不同内容")
    if (existing) await file.chmod((await stat(target)).mode & 0o777)
    await workspacePath(root, relativePath, true)
    await rename(temporary, target)
    return {
      inputFile: { relative_path: relativePath, sha256, size: bytes.length },
    }
  } finally {
    await file.close()
    await rm(temporary, { force: true })
  }
}
