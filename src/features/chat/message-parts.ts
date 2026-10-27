import type {
  ChatMessage,
  ChatMessagePart,
  ChatPartTiming,
} from "@/lib/types/chat"

export function messageParts(message: ChatMessage): ChatMessagePart[] {
  if (message.parts) return message.parts
  return [
    ...(message.thinking
      ? [{ type: "reasoning" as const, text: message.thinking }]
      : []),
    ...(message.tools ?? []).map((tool) => ({
      type: "tool-call" as const,
      toolCallId: tool.id,
    })),
    ...(message.attachments ?? []).map((attachment) => ({
      type: "attachment" as const,
      attachmentId: attachment.id,
    })),
    ...(message.content
      ? [{ type: "text" as const, text: message.content }]
      : []),
  ]
}

export function appendMessageText(
  message: ChatMessage,
  type: "text" | "reasoning",
  delta: string
): ChatMessagePart[] {
  const parts = messageParts(message)
  const last = parts.at(-1)
  if (last?.type === type) {
    return [
      ...parts.slice(0, -1),
      {
        ...last,
        type,
        text: last.text + delta,
      },
    ]
  }
  return [...parts, { type, text: delta }]
}

export function appendToolPart(
  message: ChatMessage,
  toolCallId: string,
  timing?: ChatPartTiming
) {
  const parts = messageParts(message)
  const existing = parts.findIndex(
    (part) => part.type === "tool-call" && part.toolCallId === toolCallId
  )
  if (existing >= 0) {
    if (!timing || parts[existing]?.type !== "tool-call") return parts
    return parts.map((part, index) =>
      index === existing && part.type === "tool-call" && !part.timing
        ? { ...part, timing }
        : part
    )
  }
  return [
    ...parts,
    {
      type: "tool-call" as const,
      toolCallId,
      ...(timing ? { timing } : {}),
    },
  ]
}

export function updateToolPartTiming(
  message: ChatMessage,
  toolCallId: string,
  completedAt: number
): ChatMessagePart[] {
  return messageParts(message).map((part) =>
    part.type === "tool-call" && part.toolCallId === toolCallId && part.timing
      ? {
          ...part,
          timing: {
            ...part.timing,
            startedAt: part.timing?.startedAt ?? completedAt,
            completedAt,
          },
        }
      : part
  )
}
