export type SearchResult = {
  kind: "conversation" | "message"
  conversation_id: string
  title: string
  is_archived?: boolean
  message_id?: number
  snapshot_id?: string
  role?: string
  text?: string
  excerpt?: string
  occurrence?: number
}

export type ConversationSearchPage = {
  items: SearchResult[]
  has_more: boolean
  next_cursor: string | null
  complete: boolean
  scanned_conversations?: number
}

export const normalizeSearchText = (text: string) =>
  text.trim().replace(/\s+/gu, " ").toLowerCase()

export function searchExcerpt(text: string, query: string, size = 240) {
  const display = text.trim().replace(/\s+/gu, " ")
  const index = normalizeSearchText(display).indexOf(normalizeSearchText(query))
  let sourceIndex = 0,
    normalizedIndex = 0
  for (const character of display) {
    if (normalizedIndex >= index) break
    normalizedIndex += character.toLowerCase().length
    sourceIndex += character.length
  }
  const start = Math.max(0, sourceIndex - 80)
  const end = Math.min(display.length, start + Math.max(size, query.length))
  return `${start ? "…" : ""}${display.slice(start, end)}${end < display.length ? "…" : ""}`
}

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
const hiddenKey =
  /^(?:data|base64|local_blob|api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|authorization|cookie|credentials)$/i

export function conversationSearchTarget<T>(
  message: T,
  messages: readonly T[]
): T {
  const value = object(message)
  const toolId = value.tool_call_id ?? value.toolCallId
  if (value.role !== "tool" || !toolId) return message
  return (
    messages.find((candidate) => {
      const parent = object(candidate)
      if (parent.role !== "assistant") return false
      const calls = parent.tool_calls ?? parent.toolCalls
      return (
        Array.isArray(calls) && calls.some((call) => object(call).id === toolId)
      )
    }) ?? message
  )
}

function searchableValue(value: unknown, depth = 0): string {
  if (depth > 12 || value == null) return ""
  if (typeof value === "string") {
    if (/^data:/i.test(value)) return ""
    if (value.trim().startsWith("{") || value.trim().startsWith("[")) {
      try {
        return searchableValue(JSON.parse(value), depth + 1)
      } catch {
        /* 文本不是 JSON 时保留原文 */
      }
    }
    return value
  }
  if (Array.isArray(value))
    return value.map((item) => searchableValue(item, depth + 1)).join("\n")
  if (typeof value === "object")
    return Object.entries(value)
      .flatMap(([key, item]) =>
        hiddenKey.test(key) ? [] : [key, searchableValue(item, depth + 1)]
      )
      .join("\n")
  return String(value)
}

// 只提取会话中可见的内容字段，不遍历元数据、凭据或附件字节
export function conversationSearchText(value: unknown): string {
  const message = object(value)
  const partText = (input: unknown): string => {
    if (typeof input === "string") return searchableValue(input)
    const part = object(input)
    const type = String(part.type ?? part.part_kind ?? part.partKind ?? "")
      .toLowerCase()
      .replace(/[_-]/g, "")
    if (
      [
        "file",
        "image",
        "imageurl",
        "document",
        "audio",
        "video",
        "binary",
        "attachment",
      ].includes(type)
    )
      return String(
        part.filename ?? part.name ?? object(part.metadata).filename ?? ""
      )
    if (type === "source") return String(part.title ?? part.url ?? "")
    if (["toolcall", "tooluse", "toolresult", "toolreturn"].includes(type)) {
      const fn = object(part.function)
      return [
        part.toolName ?? part.tool_name ?? part.name ?? fn.name,
        part.argsText || part.args || part.arguments || fn.arguments,
        part.result ?? part.content ?? part.text,
      ]
        .map((item) => searchableValue(item))
        .join("\n")
    }
    return searchableValue(
      part.text ??
        part.content ??
        part.thinking ??
        part.reasoning ??
        part.summary
    )
  }
  const content = Array.isArray(message.content)
    ? message.content
    : [message.content]
  const parts = Array.isArray(message.parts) ? message.parts : []
  const tools = [
    ...(Array.isArray(message.tool_calls ?? message.toolCalls)
      ? ((message.tool_calls ?? message.toolCalls) as unknown[])
      : []),
    ...(Array.isArray(message.tools) ? message.tools : []),
  ]
  const attachments = Array.isArray(message.attachments)
    ? message.attachments
    : []
  return [
    ...content.map(partText),
    ...parts.map(partText),
    ...[
      message.thinking,
      message.reasoning,
      message.reasoning_content,
      message.reasoningContent,
    ].map((item) => searchableValue(item)),
    ...tools.map((item) => {
      const tool = object(item)
      return partText({ ...tool, type: "tool-call" })
    }),
    ...attachments.map((item) =>
      String(object(item).name ?? object(item).filename ?? "")
    ),
  ]
    .filter(Boolean)
    .join("\n")
}
