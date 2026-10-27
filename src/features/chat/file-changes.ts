import type {
  ToolCallMessagePart,
  ThreadMessage,
} from "@/features/chat/thread-types"

export type ChangedFile = {
  path: string
  name: string
  additions: number
  deletions: number
  calls: readonly ToolCallMessagePart[]
}

export const CHANGE_TOOL_NAMES = new Set([
  "write",
  "edit",
  "write_file",
  "edit_file",
  "write_artifact",
])

function filePath(args: unknown): string {
  if (!args || typeof args !== "object") return ""
  const record = args as Record<string, unknown>
  for (const key of ["path", "file", "target"]) {
    const value = record[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return ""
}

/** 从工具结果里读出增删行数 */
export function changeStatsFromResult(value: unknown): {
  additions?: number
  deletions?: number
} {
  let parsed = value
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value)
    } catch {
      const additions = value.match(
        /(?:added|additions|insertions?)\D+(\d+)/i
      )?.[1]
      const deletions = value.match(
        /(?:removed|deletions?|deletions?)\D+(\d+)/i
      )?.[1]
      return {
        ...(additions ? { additions: Number(additions) } : {}),
        ...(deletions ? { deletions: Number(deletions) } : {}),
      }
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {}
  }
  const record = parsed as Record<string, unknown>
  const numberFor = (keys: string[]) => {
    for (const key of keys) {
      const value = record[key]
      if (typeof value === "number" && Number.isFinite(value)) return value
      if (
        typeof value === "string" &&
        value.trim() &&
        Number.isFinite(Number(value))
      ) {
        return Number(value)
      }
    }
    return undefined
  }
  return {
    additions: numberFor(["additions", "added", "insertions", "linesAdded"]),
    deletions: numberFor(["deletions", "removed", "linesRemoved"]),
  }
}

type ChangeToolPart = ToolCallMessagePart

export function fileChanges(tools: readonly ChangeToolPart[]) {
  const files = new Map<string, ChangedFile>()
  const seen = new Set<string>()
  for (const part of tools) {
    if (!CHANGE_TOOL_NAMES.has(part.toolName) || seen.has(part.toolCallId)) continue
    const lifecycle = part.providerMetadata?.buddy?.status
    if (
      part.isError ||
      (part.status && part.status.type !== "complete") ||
      (lifecycle != null && lifecycle !== "complete") ||
      (part.result === undefined && part.status?.type !== "complete")
    )
      continue
    const path = filePath(part.args).replaceAll("\\", "/").replace(/^\.\//, "")
    if (!path || path === ".") continue
    seen.add(part.toolCallId)
    const stats = changeStatsFromResult(part.result)
    const previous = files.get(path)
    files.set(path, {
      path,
      name: path.split("/").at(-1)!,
      calls: [...(previous?.calls ?? []), part],
      additions: (previous?.additions ?? 0) + Math.max(0, stats.additions ?? 0),
      deletions: (previous?.deletions ?? 0) + Math.max(0, stats.deletions ?? 0),
    })
  }
  return {
    files: [...files.values()].sort((a, b) => a.path.localeCompare(b.path)),
    fileCount: files.size,
    totalAdditions: [...files.values()].reduce(
      (sum, file) => sum + (file.additions ?? 0),
      0
    ),
    totalDeletions: [...files.values()].reduce(
      (sum, file) => sum + (file.deletions ?? 0),
      0
    ),
  }
}

// 按用户消息划分轮次，变更详情归属这一轮最后一条助手消息
export function turnFileChanges(
  messages: readonly ThreadMessage[],
  messageId?: string
) {
  const index =
    messageId === undefined
      ? messages.length - 1
      : messages.findIndex((message) => message.id === messageId)
  let start = index
  while (start >= 0 && messages[start]?.role !== "user") start--
  let end = index + 1
  while (end < messages.length && messages[end]?.role !== "user") end++
  const assistants = messages
    .slice(start + 1, end)
    .filter((message) => message.role === "assistant")
  const last = assistants.at(-1)
  const checkpointContext = assistants
    .map(
      (message) =>
        message.metadata?.custom?.turnContext as
          Record<string, unknown> | undefined
    )
    .findLast((context) => typeof context?.checkpoint_id === "string")
  const recorded = Array.isArray(checkpointContext?.checkpoint_files)
    ? checkpointContext.checkpoint_files.flatMap((value) => {
        if (
          !value ||
          typeof value !== "object" ||
          typeof value.path !== "string"
        )
          return []
        return [
          {
            path: value.path,
            name: value.path.split(/[\\/]/).at(-1)!,
            additions:
              typeof value.additions === "number" ? value.additions : 0,
            deletions:
              typeof value.deletions === "number" ? value.deletions : 0,
            calls: [],
          } satisfies ChangedFile,
        ]
      })
    : []
  const changes = recorded.length
    ? {
        files: recorded,
        fileCount: recorded.length,
        totalAdditions: recorded.reduce((sum, file) => sum + file.additions, 0),
        totalDeletions: recorded.reduce((sum, file) => sum + file.deletions, 0),
      }
    : fileChanges(
        assistants.flatMap((message) =>
          message.content.flatMap((part) =>
            part.type === "tool-call" ? [part] : []
          )
        )
      )
  return {
    ...changes,
    checkpointId:
      typeof checkpointContext?.checkpoint_id === "string"
        ? checkpointContext.checkpoint_id
        : null,
    messageId: last?.id,
    pending:
      last?.status?.type === "running" ||
      last?.status?.type === "requires-action",
  }
}
