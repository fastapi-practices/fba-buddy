import { messageWorkStatus } from "@/features/chat/work-timing"
import { messageParts } from "@/features/chat/message-parts"
import { attachmentKind, dataUrlToBase64 } from "@/features/chat/attachments"
import {
  threadErrorPayload,
  visibleAssistantContent,
} from "@/features/chat/message-error"
import type { ChatAttachment, ChatMessage, ChatToolCall } from "@/lib/types"
import type {
  ChatSubmission,
  CompleteAttachment,
  QueueMessagePart,
  QueueItemState,
  ThreadMessage,
  ThreadMessagePart,
  ToolCallMessagePartStatus,
} from "@/features/chat/thread-types"

type TextCarrier = { type: string; text?: string; image?: string }

function messageStatus(message: ChatMessage): ToolCallMessagePartStatus {
  if (message.status === "streaming") return { type: "running" }
  if (message.status === "awaiting-approval")
    return { type: "requires-action", reason: "interrupt" }
  if (message.status === "error")
    return {
      type: "incomplete",
      reason: "error",
      error: threadErrorPayload(message),
    }
  if (message.status === "stopped")
    return { type: "incomplete", reason: "cancelled" }
  return { type: "complete" }
}

/** 工具调用的真实状态：等待审批、执行中、已完成或已中断 */
function toolPartStatus(tool: ChatToolCall): ToolCallMessagePartStatus {
  if (tool.pendingApproval)
    return { type: "requires-action", reason: "interrupt" }
  if (tool.status === "running") return { type: "running" }
  if (tool.status === "error" || tool.isError)
    return { type: "incomplete", reason: "error", error: tool.result }
  if (tool.status === "stopped" || tool.status === "declined")
    return { type: "incomplete", reason: "cancelled" }
  if (tool.status === "complete") return { type: "complete" }
  return tool.result != null ? { type: "complete" } : { type: "running" }
}

function toCompleteAttachment(attachment: ChatAttachment): CompleteAttachment {
  const dataUrl =
    attachment.sourceType === "id"
      ? attachment.data
      : (attachment.url ?? `data:${attachment.mime};base64,${attachment.data}`)
  if (attachment.kind === "image" && attachment.sourceType !== "id") {
    return {
      id: attachment.id,
      type: "image",
      name: attachment.name,
      contentType: attachment.mime,
      content: [
        {
          type: "image",
          image: dataUrl,
          filename: attachment.name,
          mimeType: attachment.mime,
          size: attachment.size,
        },
      ],
      status: { type: "complete" },
    }
  }
  return {
    id: attachment.id,
    type: "document",
    name: attachment.name,
    contentType: attachment.mime,
    content: [
      {
        type: "file",
        filename: attachment.name,
        data: dataUrl,
        ...(attachment.sourceType ? { sourceType: attachment.sourceType } : {}),
        mimeType: attachment.mime,
        size: attachment.size,
      },
    ],
    status: { type: "complete" },
  }
}

const PARTIAL_FIELD =
  /"([A-Za-z_][\w-]*)"\s*:\s*(?:"((?:[^"\\]|\\.)*)"|(-?\d+(?:\.\d+)?)|(true|false|null))/g

function unescapePartialString(value: string): string {
  return value.replace(/\\(u[\da-fA-F]{4}|.)/g, (_, code: string) => {
    if (code.startsWith("u"))
      return String.fromCharCode(Number.parseInt(code.slice(1), 16))
    switch (code) {
      case "n":
        return "\n"
      case "t":
        return "\t"
      case "r":
        return "\r"
      case "b":
        return "\b"
      case "f":
        return "\f"
      default:
        return code
    }
  })
}

/**
 * 参数还在流式写入时，先取出已经能读到的字段，
 * 标题和字数只增不减，不会因为一次解析失败就消失
 */
function partialArgsFields(args: string): Record<string, unknown> {
  const fields: Record<string, unknown> = {}
  for (const match of args.matchAll(PARTIAL_FIELD)) {
    const key = match[1]
    if (!key || fields[key] !== undefined) continue
    if (match[2] !== undefined) {
      fields[key] = unescapePartialString(match[2])
      continue
    }
    if (match[3] !== undefined) {
      fields[key] = Number(match[3])
      continue
    }
    if (match[4] === "true") fields[key] = true
    else if (match[4] === "false") fields[key] = false
    else if (match[4] === "null") fields[key] = null
  }
  return fields
}

function repairPartialJson(args: string): string {
  let candidate = args.trim()
  if (!candidate) return ""
  const stack: string[] = []
  let inString = false
  let escaped = false
  for (const character of candidate) {
    if (inString) {
      if (escaped) escaped = false
      else if (character === "\\") escaped = true
      else if (character === '"') inString = false
      continue
    }
    if (character === '"') inString = true
    else if (character === "{" || character === "[") stack.push(character)
    else if (character === "}" || character === "]") stack.pop()
  }
  if (inString) {
    // 末尾的转义符还没写完，先转义掉再收尾
    const trailing = /(\\+)$/.exec(candidate)
    if (trailing && trailing[1]!.length % 2 === 1) candidate += "\\"
    candidate += '"'
  }
  candidate = candidate.replace(/[,:]\s*$/, "")
  candidate += stack
    .reverse()
    .map((character) => (character === "{" ? "}" : "]"))
    .join("")
  return candidate
}

export function parsePartialToolArgs(args: string): unknown {
  try {
    return JSON.parse(args)
  } catch {
    const repaired = repairPartialJson(args)
    if (repaired) {
      try {
        return { ...partialArgsFields(args), ...JSON.parse(repaired) }
      } catch {
        // 修补失败时退回宽松解析
      }
    }
    return partialArgsFields(args)
  }
}

function threadMessageMetadata(message: ChatMessage) {
  const custom = {
    ...(message.sources?.length ? { sources: message.sources } : {}),
    ...(message.createdAt ? { createdAt: message.createdAt } : {}),
    ...(message.origin != null ? { origin: message.origin } : {}),
    ...(message.inputIntent ? { inputIntent: message.inputIntent } : {}),
    ...(message.createdBy != null ? { createdBy: message.createdBy } : {}),
    ...(message.attempt ? { attempt: message.attempt } : {}),
    ...(message.turnContext?.quote ? { quote: message.turnContext.quote } : {}),
    ...(message.pk != null ? { pk: message.pk } : {}),
    ...(message.turnContext ? { turnContext: message.turnContext } : {}),
    ...(message.role === "assistant"
      ? {
          workTiming: message.workTiming ?? {
            runId: message.id,
            status: messageWorkStatus(message),
          },
        }
      : {}),
  }
  const metadata = {
    ...(message.timing ? { timing: message.timing } : {}),
    ...(message.usage ? { usage: message.usage } : {}),
    ...(Object.keys(custom).length > 0 ? { custom } : {}),
  }
  if (Object.keys(metadata).length === 0) return undefined
  return metadata
}

export function threadMessagePk(message: {
  metadata?: { custom?: Record<string, unknown> }
}): number | null {
  const pk = message.metadata?.custom?.pk
  return typeof pk === "number" && Number.isSafeInteger(pk) && pk > 0
    ? pk
    : null
}

function hasPendingApproval(message: ChatMessage): boolean {
  return (
    message.role === "assistant" &&
    Boolean(message.tools?.some((tool) => tool.pendingApproval))
  )
}

function withoutGeneratedTurnContext(
  context: NonNullable<ChatMessage["turnContext"]>
) {
  const next = { ...context }
  delete next.ag_ui_activities
  delete next.agent_state
  delete next.agent_state_delta
  delete next.custom_events
  delete next.lifecycle_events
  delete next.raw_events
  return next
}

function gateApprovalMessage(
  message: ChatMessage,
  keepBeforePending: boolean
): ChatMessage {
  const tools = new Map((message.tools ?? []).map((tool) => [tool.id, tool]))
  const parts = messageParts(message)
  const firstPending = parts.findIndex(
    (part) =>
      part.type === "tool-call" && tools.get(part.toolCallId)?.pendingApproval
  )
  if (firstPending < 0) return message

  const visibleParts = parts.filter(
    (part, index) =>
      (keepBeforePending && index < firstPending) ||
      (part.type === "tool-call" &&
        tools.get(part.toolCallId)?.pendingApproval === true)
  )
  const visibleToolIds = new Set(
    visibleParts.flatMap((part) =>
      part.type === "tool-call" ? [part.toolCallId] : []
    )
  )
  for (const tool of message.tools ?? []) {
    if (
      tool.pendingApproval &&
      !visibleParts.some(
        (part) => part.type === "tool-call" && part.toolCallId === tool.id
      )
    ) {
      visibleParts.push({ type: "tool-call", toolCallId: tool.id })
      visibleToolIds.add(tool.id)
    }
  }
  const visibleAttachments = new Set(
    visibleParts.flatMap((part) =>
      part.type === "attachment" ? [part.attachmentId] : []
    )
  )
  const visibleTools = (message.tools ?? []).flatMap((tool) => {
    if (!visibleToolIds.has(tool.id)) return []
    if (!tool.pendingApproval) return [tool]
    return [
      {
        ...tool,
        result: undefined,
        isError: undefined,
        status: undefined,
      },
    ]
  })
  const content = visibleParts
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("")

  return {
    ...message,
    content,
    parts: visibleParts,
    thinking: undefined,
    tools: visibleTools.length ? visibleTools : undefined,
    attachments: message.attachments?.filter((attachment) =>
      visibleAttachments.has(attachment.id)
    ),
    sources: undefined,
    error: undefined,
    errorDetail: undefined,
    status: "awaiting-approval",
    isPlaceholder: false,
    agUiActivities: undefined,
    agUiActiveTextId: undefined,
    agUiActiveToolId: undefined,
    agUiActiveReasoningId: undefined,
    agUiReasoningSpans: undefined,
    agUiSubagents: undefined,
    reasoningMessageIds: undefined,
    workTiming: message.workTiming
      ? { ...message.workTiming, status: "awaiting-approval", endedAt: undefined }
      : undefined,
    turnContext: message.turnContext
      ? withoutGeneratedTurnContext(message.turnContext)
      : message.turnContext,
  }
}

function gateMessagesAtApproval(messages: ChatMessage[]): ChatMessage[] {
  if (!messages.some(hasPendingApproval)) return messages
  const gated: ChatMessage[] = []
  let approvalStarted = false
  for (const message of messages) {
    if (message.role === "user" && !approvalStarted) {
      gated.push(message)
      continue
    }
    const pending = hasPendingApproval(message)
    if (!approvalStarted && !pending) {
      gated.push(message)
      continue
    }
    if (!approvalStarted) {
      approvalStarted = true
      gated.push(gateApprovalMessage(message, true))
      continue
    }
    if (pending) gated.push(gateApprovalMessage(message, false))
  }
  return gated
}

export function toThreadMessages(messages: ChatMessage[]): ThreadMessage[] {
  return gateMessagesAtApproval(messages).map(toThreadMessage)
}

export function toThreadMessage(message: ChatMessage): ThreadMessage {
  const metadata = threadMessageMetadata(message)
  if (message.role === "user") {
    return {
      id: message.id,
      role: "user",
      ...(message.createdAt ? { createdAt: new Date(message.createdAt) } : {}),
      content: message.content ? [{ type: "text", text: message.content }] : [],
      attachments: message.attachments?.map(toCompleteAttachment),
      ...(metadata ? { metadata } : {}),
    }
  }

  const content: ThreadMessagePart[] = []
  const visibleContent = visibleAssistantContent(message)
  const tools = new Map((message.tools ?? []).map((tool) => [tool.id, tool]))
  const attachments = new Map(
    (message.attachments ?? []).map((attachment) => [attachment.id, attachment])
  )
  for (const part of messageParts(message)) {
    if (part.type === "text") {
      if (visibleContent && part.text)
        content.push({ type: "text", text: part.text })
    } else if (part.type === "reasoning") {
      if (part.text)
        content.push({
          type: "reasoning",
          text: part.text,
          ...(part.timing ? { timing: part.timing } : {}),
        })
    } else if (part.type === "tool-call") {
      const tool = tools.get(part.toolCallId)
      if (!tool) continue
      content.push({
        type: "tool-call",
        toolCallId: tool.id,
        toolName: tool.name,
        status: toolPartStatus(tool),
        args: parsePartialToolArgs(tool.args),
        argsText: tool.args,
        ...(tool.result != null ? { result: tool.result } : {}),
        ...(tool.isError || tool.status === "error" ? { isError: true } : {}),
        ...(tool.status
          ? { providerMetadata: { buddy: { status: tool.status } } }
          : {}),
        ...(part.timing ? { timing: part.timing } : {}),
        ...(tool.hadApproval ? { hadApproval: true } : {}),
        ...(tool.pendingApproval
          ? {
              interrupt: {
                type: "human" as const,
                payload: {
                  toolCallId: tool.id,
                  ...(tool.approvalOptions
                    ? { options: tool.approvalOptions }
                    : {}),
                  ...(tool.approvalWarning
                    ? { warning: tool.approvalWarning }
                    : {}),
                  ...(tool.approvalUnavailableReason
                    ? { unavailableReason: tool.approvalUnavailableReason }
                    : {}),
                  ...(tool.approvalRequestId
                    ? { approvalRequestId: tool.approvalRequestId }
                    : {}),
                },
              },
            }
          : {}),
      })
    } else if (part.type === "attachment") {
      const attachment = attachments.get(part.attachmentId)
      if (!attachment) continue
      const dataUrl =
        attachment.sourceType === "id"
          ? attachment.data
          : (attachment.url ??
            `data:${attachment.mime};base64,${attachment.data}`)
      content.push(
        attachment.kind === "image" && attachment.sourceType !== "id"
          ? {
              type: "image",
              image: dataUrl,
              filename: attachment.name,
              mimeType: attachment.mime,
              size: attachment.size,
            }
          : {
              type: "file",
              filename: attachment.name,
              data: dataUrl,
              ...(attachment.sourceType
                ? { sourceType: attachment.sourceType }
                : {}),
              mimeType: attachment.mime,
              size: attachment.size,
            }
      )
    }
  }

  return {
    id: message.id,
    role: "assistant",
    ...(message.createdAt ? { createdAt: new Date(message.createdAt) } : {}),
    content,
    status: messageStatus(message),
    ...(metadata ? { metadata } : {}),
  }
}

export function extractComposerText(
  content: string | readonly TextCarrier[]
): string {
  if (typeof content === "string") return content
  return content
    .flatMap((part) => (part.type === "text" ? [part.text ?? ""] : []))
    .join("")
}

function queuePartsFromSubmission(
  submission: ChatSubmission
): QueueMessagePart[] {
  return [
    ...submission.attachments.map((attachment) => ({
      type: "file" as const,
      id: attachment.id,
      filename: attachment.name,
      mimeType: attachment.mime,
      size: attachment.size,
      data:
        attachment.url ??
        (attachment.data.startsWith("data:")
          ? attachment.data
          : `data:${attachment.mime};base64,${attachment.data}`),
    })),
    { type: "text" as const, text: submission.text },
  ]
}

export function queueItemFromSubmission(
  id: string,
  submission: ChatSubmission
): QueueItemState {
  return {
    id,
    prompt: submission.text,
    parts: queuePartsFromSubmission(submission),
  }
}

function attachmentFromQueuePart(
  part: QueueMessagePart,
  id = crypto.randomUUID()
): ChatAttachment | null {
  if (part.type !== "file") return null
  const mime = part.mimeType || "application/octet-stream"
  const dataUrl = part.data
  return {
    id: part.id ?? id,
    name: part.filename || "file",
    mime,
    size: part.size ?? 0,
    data: /^(https?:|blob:)/.test(dataUrl)
      ? ""
      : dataUrlToBase64(dataUrl),
    ...(/^(https?:|blob:)/.test(dataUrl) ? { url: dataUrl } : {}),
    kind: attachmentKind(mime),
  }
}

export function submissionFromQueueItem(item: QueueItemState): ChatSubmission {
  return {
    text: extractComposerText(item.parts),
    attachments: item.parts.flatMap((part) => {
      const attachment = attachmentFromQueuePart(part)
      return attachment ? [attachment] : []
    }),
  }
}
