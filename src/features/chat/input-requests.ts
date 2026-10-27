import { readRichEvents, type RichEvent } from "./rich-events"
import type { InputQuestion, InputRequest } from "@/shared/chat-input"

const INPUT_REQUEST_EVENT = "buddy.user_input"

type MessageLike = {
  id: string
  metadata?: { custom?: Record<string, unknown> }
}

export type InputRequestAnchor = {
  request: InputRequest
  messageId: string
}

const STATUS_RANK = {
  pending: 0,
  answered: 1,
  cancelled: 1,
} as const

function questionFromEvent(value: unknown): InputQuestion | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  if (typeof row.id !== "string" || !row.id) return null
  const options = Array.isArray(row.options)
    ? row.options.flatMap((option) => {
        if (!option || typeof option !== "object" || Array.isArray(option))
          return []
        const entry = option as Record<string, unknown>
        if (typeof entry.id !== "string" || !entry.id) return []
        return [
          {
            id: entry.id,
            label: typeof entry.label === "string" ? entry.label : entry.id,
          },
        ]
      })
    : []
  const kind =
    row.kind === "single" || row.kind === "multiple" ? row.kind : "text"
  return {
    id: row.id,
    prompt: typeof row.prompt === "string" ? row.prompt : row.id,
    kind,
    options,
    required: row.required !== false,
  }
}

/**
 * 归一化来自事件流或接口的输入请求，
 * 只保留渲染需要的字段，缺省值统一在这里补齐
 */
export function normalizeInputRequest(value: unknown): InputRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const requestId = row.request_id
  if (typeof requestId !== "string" || !requestId) return null
  const status =
    row.status === "answered" || row.status === "cancelled"
      ? row.status
      : "pending"
  const questions = Array.isArray(row.questions)
    ? row.questions.flatMap((question) => {
        const normalized = questionFromEvent(question)
        return normalized ? [normalized] : []
      })
    : []
  const secret =
    row.secret && typeof row.secret === "object" && !Array.isArray(row.secret)
      ? (row.secret as Record<string, unknown>)
      : undefined
  return {
    request_id: requestId,
    kind: row.kind === "secret" ? "secret" : "questions",
    status,
    title: typeof row.title === "string" ? row.title : null,
    questions,
    tool_call_id:
      typeof row.tool_call_id === "string" ? row.tool_call_id : null,
    expires_at:
      typeof row.expires_at === "number" ? row.expires_at : undefined,
    secret: secret
      ? {
          label: typeof secret.label === "string" ? secret.label : "",
          purpose: typeof secret.purpose === "string" ? secret.purpose : "",
        }
      : undefined,
  }
}

/**
 * 状态只能向前推进：已经回答或取消的请求不会被后来的待回答事件改回去
 */
function mergeInputRequest(
  current: InputRequest,
  next: InputRequest
): InputRequest {
  const status =
    STATUS_RANK[current.status] >= STATUS_RANK[next.status]
      ? current.status
      : next.status
  return {
    ...current,
    ...next,
    status,
  }
}

function inputRequestFromEvent(
  event: RichEvent
): InputRequest | null {
  if (event.name !== INPUT_REQUEST_EVENT) return null
  return normalizeInputRequest(event.value)
}

function turnContextOf(message: MessageLike | undefined) {
  const context = message?.metadata?.custom?.turnContext
  if (!context || typeof context !== "object") return undefined
  return context as Record<string, unknown>
}

/**
 * 一条消息正文里带到的输入请求，
 * 提问和回答都会落在同一条消息上，按 request_id 归并
 */
export function messageInputRequests(
  message: MessageLike | undefined
): InputRequest[] {
  const context = turnContextOf(message)
  if (!context) return []
  const requests = new Map<string, InputRequest>()
  for (const event of readRichEvents(context.lifecycle_events)) {
    const request = inputRequestFromEvent(event)
    if (!request) continue
    const current = requests.get(request.request_id)
    requests.set(
      request.request_id,
      current ? mergeInputRequest(current, request) : request
    )
  }
  return [...requests.values()]
}

/**
 * 对话里出现过的输入请求，附带它们所在的消息
 */
export function collectInputRequests(
  messages: readonly MessageLike[]
): InputRequestAnchor[] {
  const anchors = new Map<string, InputRequestAnchor>()
  for (const message of messages) {
    for (const request of messageInputRequests(message)) {
      const current = anchors.get(request.request_id)
      anchors.set(request.request_id, {
        request: current ? mergeInputRequest(current.request, request) : request,
        messageId: message.id,
      })
    }
  }
  return [...anchors.values()]
}

/**
 * 合并服务端待办列表和对话正文里的请求，
 * 已经在正文里出现过的请求由正文负责渲染
 */
export function mergeInputRequestLists(
  serverItems: readonly InputRequest[],
  anchored: readonly InputRequestAnchor[]
): InputRequest[] {
  const merged = new Map<string, InputRequest>()
  for (const item of serverItems) {
    const request = normalizeInputRequest(item)
    if (!request) continue
    merged.set(request.request_id, request)
  }
  for (const anchor of anchored) {
    const current = merged.get(anchor.request.request_id)
    merged.set(
      anchor.request.request_id,
      current
        ? mergeInputRequest(current, anchor.request)
        : anchor.request
    )
  }
  return [...merged.values()]
}

export function pendingInputRequests(
  requests: readonly InputRequest[]
): InputRequest[] {
  return requests.filter((request) => request.status === "pending")
}

export function hasPendingInputRequest(
  messages: readonly MessageLike[]
): boolean {
  return messages.some((message) =>
    messageInputRequests(message).some(
      (request) => request.status === "pending"
    )
  )
}
