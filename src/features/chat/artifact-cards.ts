import type { WorkspaceArtifactKind } from "@/lib/types"

type ArtifactChange = "created" | "updated"

export type ArtifactCardItem = {
  /** 同一产物在同一轮中的稳定标识 */
  id: string
  toolCallId: string
  artifactId?: string
  title: string
  kind: WorkspaceArtifactKind
  words: number
  generating: boolean
  generation: "write" | "delivery"
  change: ArtifactChange
  version: number
}

type ArtifactPartLike = {
  type?: string
  toolName?: string
  toolCallId?: string
  args?: unknown
  result?: unknown
  isError?: boolean
  status?: { type?: string } | string | null
}

export type ArtifactMessageLike = {
  role?: string
  content?: readonly ArtifactPartLike[]
}

const ARTIFACT_KINDS = new Set<WorkspaceArtifactKind>([
  "image",
  "video",
  "audio",
  "text",
  "document",
  "other",
])

const ARTIFACT_TOOL_NAMES = new Set(["write_artifact", "deliver_file"])

function record(value: unknown): Record<string, unknown> | null {
  let parsed = value
  if (typeof parsed === "string") {
    const text = parsed.trim()
    if (!text.startsWith("{")) return null
    try {
      parsed = JSON.parse(text)
    } catch {
      return null
    }
  }
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : null
}

function stringField(value: unknown, keys: string[]): string | null {
  const row = record(value)
  if (!row)
    return typeof value === "string" && value.trim() ? value.trim() : null
  for (const key of keys) {
    const found = row[key]
    if (typeof found === "string" && found.trim()) return found.trim()
  }
  return null
}

function idField(value: unknown, keys: string[]): string | null {
  const row = record(value)
  if (!row) return null
  for (const key of keys) {
    const found = row[key]
    if (
      (typeof found === "string" || typeof found === "number") &&
      String(found).trim()
    )
      return String(found).trim()
  }
  return null
}

function artifactId(args: unknown, result: unknown): string | null {
  return (
    idField(args, ["artifact_id", "artifactId", "id"]) ??
    idField(result, ["artifact_id", "artifactId", "id"]) ??
    (typeof result === "string" ? (/#(\d+)/.exec(result)?.[1] ?? null) : null)
  )
}

function artifactKind(value: unknown): WorkspaceArtifactKind {
  const found = stringField(value, ["kind", "artifact_kind", "artifactKind"])
  return found && ARTIFACT_KINDS.has(found as WorkspaceArtifactKind)
    ? (found as WorkspaceArtifactKind)
    : "text"
}

function fileName(path: string | null): string | null {
  return path?.split(/[\\/]/).filter(Boolean).at(-1) ?? null
}

/** 同时覆盖英文单词和中日韩逐字计数 */
export function artifactWordCount(content: string): number {
  const text = content.trim()
  if (!text) return 0
  const cjk = text.match(
    /\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}/gu
  )
  const words = text
    .replace(/\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}/gu, " ")
    .match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)
  return (cjk?.length ?? 0) + (words?.length ?? 0)
}

function statusType(value: ArtifactPartLike["status"]): string | null {
  return typeof value === "string" ? value : (value?.type ?? null)
}

export function artifactCardsFromMessages(
  messages: readonly ArtifactMessageLike[]
): ArtifactCardItem[] {
  const cards = new Map<string, ArtifactCardItem>()
  for (const message of messages) {
    if (message.role !== "assistant" || !message.content) continue
    for (const part of message.content) {
      if (
        part.type !== "tool-call" ||
        !ARTIFACT_TOOL_NAMES.has(part.toolName ?? "")
      )
        continue
      const status = statusType(part.status)
      if (
        part.isError ||
        ["error", "declined", "stopped"].includes(status ?? "")
      )
        continue

      const args = record(part.args) ?? {}
      const result = record(part.result) ?? {}
      const delivery = part.toolName === "deliver_file"
      const title = delivery
        ? (stringField(result, ["title", "name"]) ??
          stringField(args, ["title", "name"]) ??
          fileName(stringField(args, ["path", "file"])))
        : stringField(args, ["title", "name"])
      const content = delivery
        ? ""
        : (stringField(args, ["content", "text"]) ?? "")
      const id = artifactId(args, part.result)
      const key = id ? `artifact:${id}` : `tool:${part.toolCallId}`
      const previous = cards.get(key)
      const sameWrite = previous?.toolCallId === part.toolCallId
      const updated =
        !delivery &&
        (Boolean(idField(args, ["artifact_id", "artifactId"])) ||
          (Boolean(previous) && !sameWrite))

      cards.set(key, {
        id: key,
        toolCallId: part.toolCallId ?? key,
        artifactId: id ?? undefined,
        title: title || id || part.toolCallId || "artifact",
        kind: artifactKind(delivery ? (result.kind ?? args.kind) : args.kind),
        words: artifactWordCount(content),
        generating:
          status === "running" || (!part.result && status !== "complete"),
        generation: delivery ? "delivery" : "write",
        change: updated ? "updated" : "created",
        version:
          previous && !sameWrite
            ? previous.version + 1
            : (previous?.version ?? 1),
      })
    }
  }
  return [...cards.values()]
}
