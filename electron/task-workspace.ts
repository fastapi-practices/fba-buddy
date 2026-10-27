import { lstat, mkdir } from "node:fs/promises"
import path from "node:path"

const TASK_WORKSPACE_SEGMENTS = [
  "inbound",
  "outbound",
  "tmp",
  ".fbabuddy",
] as const

export function defaultTaskWorkspaceRoot(
  home: string,
  platform = process.platform
): string {
  const paths = platform === "win32" ? path.win32 : path.posix
  return paths.join(home, ".fbabuddy")
}

function dateSegment(value: Date): {
  year: string
  month: string
  day: string
} {
  return {
    year: String(value.getFullYear()),
    month: String(value.getMonth() + 1).padStart(2, "0"),
    day: String(value.getDate()).padStart(2, "0"),
  }
}

function taskSegment(profileKey: string): string {
  const separator = profileKey.lastIndexOf(":")
  const account = separator > 0 ? profileKey.slice(0, separator) : ""
  const conversationId =
    separator > 0 ? profileKey.slice(separator + 1) : profileKey
  const safeConversationId = conversationId
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .slice(0, 96)
  const safeAccount = account.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 16)
  if (!safeConversationId) throw new Error("会话标识无效")
  return `task_${safeConversationId}${safeAccount ? `_${safeAccount}` : ""}`
}

export function taskWorkspaceDirectory(
  home: string,
  profileKey: string,
  now = new Date(),
  platform = process.platform
): string {
  if (!profileKey || profileKey.length > 512 || /[\0\r\n]/.test(profileKey))
    throw new Error("会话标识无效")
  const paths = platform === "win32" ? path.win32 : path.posix
  const date = dateSegment(now)
  return paths.join(
    defaultTaskWorkspaceRoot(home, platform),
    date.year,
    date.month,
    date.day,
    taskSegment(profileKey)
  )
}

export function validateTaskWorkspaceDirectory(
  profileKey: string,
  directory: string,
  platform = process.platform
): void {
  const paths = platform === "win32" ? path.win32 : path.posix
  const actual = paths.resolve(directory)
  const task = paths.basename(actual)
  const dayDirectory = paths.dirname(actual)
  const monthDirectory = paths.dirname(dayDirectory)
  const yearDirectory = paths.dirname(monthDirectory)
  const day = paths.basename(dayDirectory)
  const month = paths.basename(monthDirectory)
  const year = paths.basename(yearDirectory)
  if (
    !/^\d{4}$/.test(year) ||
    !/^\d{2}$/.test(month) ||
    !/^\d{2}$/.test(day)
  )
    throw new Error("自动对话工作区必须使用任务目录")
  const date = new Date(`${year}-${month}-${day}T12:00:00`)
  if (
    date.getFullYear() !== Number(year) ||
    date.getMonth() + 1 !== Number(month) ||
    date.getDate() !== Number(day)
  )
    throw new Error("自动对话工作区日期无效")
  const expectedTask = taskSegment(profileKey)
  if (
    platform === "win32"
      ? expectedTask.toLowerCase() !== task.toLowerCase()
      : expectedTask !== task
  )
    throw new Error("自动对话工作区与会话不匹配")
}

export async function ensureWorkspaceDirectory(
  directory: string
): Promise<void> {
  try {
    await mkdir(directory, { recursive: true, mode: 0o700 })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
  }
  const entry = await lstat(directory)
  if (!entry.isDirectory() || entry.isSymbolicLink())
    throw new Error("本地工作区必须是独立目录，不能是符号链接或文件")
}

export async function ensureTaskWorkspace(directory: string): Promise<void> {
  await ensureWorkspaceDirectory(directory)
  for (const segment of TASK_WORKSPACE_SEGMENTS)
    await ensureWorkspaceDirectory(path.join(directory, segment))
}
