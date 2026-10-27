import { attachmentKind } from "@/features/chat/attachments"
import type {
  ChatAttachment,
  ChatMessagePart,
  ChatToolCall,
  SnapshotMessage,
} from "@/lib/types"

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function text(value: unknown) {
  return typeof value === "string" ? value : ""
}

function serialized(value: unknown) {
  return typeof value === "string" ? value : (JSON.stringify(value) ?? "")
}

function reasoningText(part: Record<string, unknown>) {
  const direct = text(part.text) || text(part.reasoning) || text(part.thinking)
  if (direct) return direct
  const items = Array.isArray(part.thinking)
    ? part.thinking
    : Array.isArray(part.summary)
      ? part.summary
      : []
  return items.map((item) => text(item) || text(record(item).text)).join("")
}

export function snapshotAttachment(
  value: unknown,
  id: string
): ChatAttachment | null {
  const part = record(value)
  const source = record(part.source)
  const metadata = record(part.metadata)
  const type = part.type
  if (
    type !== "image" &&
    type !== "audio" &&
    type !== "video" &&
    type !== "document"
  )
    return null
  if (source.type !== "data" && source.type !== "url") return null
  const raw = text(source.value)
  if (!raw) return null
  const match = /^data:([^;,]+);base64,([\s\S]*)$/.exec(raw)
  const mime = text(source.mimeType) || match?.[1] || "application/octet-stream"
  const url = source.type === "url" && !match ? raw : undefined
  return {
    id: text(part.id) || id,
    name: text(metadata.filename) || (type === "image" ? "image" : "file"),
    mime,
    size: typeof metadata.size === "number" ? metadata.size : 0,
    data: url ? "" : (match?.[2] ?? raw),
    ...(url ? { url } : {}),
    kind: type,
  }
}

export function snapshotActivityAttachment(
  value: unknown,
  id: string
): ChatAttachment | null {
  const message = record(value)
  if (message.activityType !== "pydantic_ai_file") return null
  const content = record(message.content)
  const url = text(content.url)
  if (!url) return null
  const mime = text(content.media_type) || /^data:([^;,]+)[;,]/.exec(url)?.[1]
  return snapshotAttachment(
    {
      type: attachmentKind(mime || "application/octet-stream"),
      source: { type: "url", value: url, mimeType: mime },
    },
    id
  )
}

export function snapshotContent(message: SnapshotMessage) {
  const parts: ChatMessagePart[] = []
  const attachments: ChatAttachment[] = []
  const tools = new Map<string, ChatToolCall>()
  const values: unknown[] =
    Array.isArray(message.parts) && message.parts.length
      ? message.parts
      : typeof message.content === "string"
        ? [message.content]
        : Array.isArray(message.content)
          ? message.content
          : []
  for (const [index, value] of values.entries()) {
    const part = record(value)
    const kind = part.type ?? part.part_kind ?? part.partKind
    if (kind === "reasoning") {
      const thinking = reasoningText(part)
      if (thinking) parts.push({ type: "reasoning", text: thinking })
      continue
    }
    if (kind === "tool-call") {
      const name =
        text(part.toolName) || text(part.tool_name) || text(part.name)
      const id =
        text(part.toolCallId) || text(part.tool_call_id) || text(part.id)
      if (!id && !name) continue
      const toolId = id || `${message.id}-tool-${index}`
      const previous = tools.get(toolId)
      if (!tools.has(toolId))
        parts.push({ type: "tool-call", toolCallId: toolId })
      const status = text(part.status)
      tools.set(toolId, {
        ...previous,
        id: toolId,
        name: name || previous?.name || "",
        args:
          part.args !== undefined || part.arguments !== undefined
            ? serialized(part.args !== undefined ? part.args : part.arguments)
            : (previous?.args ?? ""),
        ...(part.result !== undefined
          ? { result: serialized(part.result) }
          : {}),
        ...(typeof part.isError === "boolean" ||
        typeof part.is_error === "boolean"
          ? { isError: part.isError === true || part.is_error === true }
          : {}),
        ...(["running", "complete", "error", "stopped", "declined"].includes(
          status
        )
          ? { status: status as ChatToolCall["status"] }
          : {}),
      })
      continue
    }
    const attachment = snapshotAttachment(
      value,
      `${message.id}-attachment-${index}`
    )
    if (attachment) {
      attachments.push(attachment)
      parts.push({ type: "attachment", attachmentId: attachment.id })
      continue
    }
    const rawText =
      typeof value === "string"
        ? value
        : kind === "text"
          ? text(part.text) || text(part.content)
          : ""
    if (!rawText) continue
    const segments = rawText.split(/(<think>[\s\S]*?<\/think>)/gi)
    for (const segment of segments) {
      const thought = /^<think>([\s\S]*?)<\/think>$/i.exec(segment)
      if (segment)
        parts.push({
          type: thought ? "reasoning" : "text",
          text: thought ? thought[1]!.trim() : segment,
        })
    }
  }
  const thinking =
    text(message.thinking) ||
    text(message.reasoning) ||
    text(message.reasoning_content) ||
    text(message.reasoningContent)
  const inlineThinking = parts
    .flatMap((part) => (part.type === "reasoning" ? [part.text] : []))
    .join("")
  if (thinking && thinking !== inlineThinking)
    parts.unshift({ type: "reasoning", text: thinking })
  return { parts, attachments, tools: [...tools.values()] }
}
