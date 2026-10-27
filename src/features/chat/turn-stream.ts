import type {
  ThreadMessage,
  ThreadMessagePart,
  ToolCallMessagePart,
} from "@/features/chat/thread-types"
import {
  isPersistentLifecycleEvent,
  isPersistentToolResult,
  readRichEvents,
  type RichEvent,
} from "./rich-events"
import { isDeclinedToolApproval } from "./tool-approvals"

/**
 * 回合内片段的四种形态：
 * - reasoning 思考
 * - tool-call 工具调用
 * - text 文本
 * - media 图片/文件
 */
type TurnSegmentKind = "reasoning" | "tool-call" | "text" | "media"

type TurnSegment = {
  messageId: string
  index: number
  kind: TurnSegmentKind
  part: ThreadMessagePart
}

export type TurnStream = {
  /** 按时间顺序排列的回合片段 */
  segments: TurnSegment[]
  /** 属于最终答复的片段下标：messageId -> part 下标 */
  finalParts: Record<string, number[]>
  /** 最终答复所在消息，最终答复还没开始时为空 */
  finalId?: string
  /** 最终答复是否已经开始输出 */
  finalReplyStarted: boolean
  /** 回合是否存在执行过程 */
  hasWork: boolean
}

export type TurnStreamOptions = {
  /** 持久化工具结果，这些工具渲染在执行过程之外，不参与分段 */
  persistentTools?: Record<string, string[]>
  /** 回合生命周期事件 */
  lifecycleEvents?: Record<string, RichEvent[]>
}

function segmentKind(part: ThreadMessagePart): TurnSegmentKind | undefined {
  if (part.type === "reasoning") return "reasoning"
  if (part.type === "tool-call") return "tool-call"
  if (part.type === "text") return part.text.trim() ? "text" : undefined
  if (part.type === "image" || part.type === "file") return "media"
  return undefined
}

/**
 * 只是向用户提问的工具属于对话而不是执行，
 * 它前面的文本仍然是给用户看的最终答复。
 */
const INTERACTION_TOOL_NAMES = new Set(["ask_user"])

function interactionToolIds(messages: readonly ThreadMessage[]) {
  const ids = new Set<string>()
  for (const message of messages) {
    const context = message.metadata?.custom?.turnContext as
      Record<string, unknown> | undefined
    for (const event of readRichEvents(context?.lifecycle_events)) {
      if (event.name !== "buddy.user_input") continue
      const id = event.value.tool_call_id
      if (typeof id === "string") ids.add(id)
    }
  }
  return ids
}

function isInteractionTool(
  part: ToolCallMessagePart,
  interactionIds: ReadonlySet<string>
) {
  return (
    INTERACTION_TOOL_NAMES.has(part.toolName) ||
    interactionIds.has(part.toolCallId)
  )
}

function isPersistentTool(
  options: TurnStreamOptions,
  messageId: string,
  part: ToolCallMessagePart
) {
  const persisted = options.persistentTools?.[messageId]
  if (persisted) return persisted.includes(part.toolCallId)
  return isPersistentToolResult(part.result)
}

function lifecycleHasWork(
  options: TurnStreamOptions,
  messages: readonly ThreadMessage[]
) {
  const events = Object.values(options.lifecycleEvents ?? {}).flat()
  if (
    events.some(
      (event) =>
        event.name !== "buddy.coding.approval" &&
        event.name !== "buddy.coding.approval_resolved" &&
        !isPersistentLifecycleEvent(event)
    )
  )
    return true
  return messages.some((message) => {
    const context = message.metadata?.custom?.turnContext as
      Record<string, unknown> | undefined
    return readRichEvents(context?.lifecycle_events).some(
      (event) =>
        event.name === "buddy.user_input" && event.value.status !== "pending"
    )
  })
}

/**
 * 按真实流式顺序切分一轮对话：
 * 最后一个执行片段（思考或工具）之后才是最终答复，
 * 出现在执行片段之前的文本属于过程铺垫，不会被当成最终答复。
 */
export function turnStream(
  messages: readonly ThreadMessage[],
  options: TurnStreamOptions = {}
): TurnStream {
  const segments: TurnSegment[] = []
  for (const message of messages) {
    message.content.forEach((part, index) => {
      const kind = segmentKind(part)
      if (!kind) return
      segments.push({ messageId: message.id, index, kind, part })
    })
  }

  const interactionIds = interactionToolIds(messages)
  let lastWork = -1
  segments.forEach((segment, position) => {
    if (segment.kind === "reasoning") {
      lastWork = position
      return
    }
    if (segment.kind !== "tool-call") return
    const part = segment.part as ToolCallMessagePart
    if (isPersistentTool(options, segment.messageId, part)) return
    if (isInteractionTool(part, interactionIds)) return
    if (isDeclinedToolApproval(part)) return
    lastWork = position
  })

  const trailing = segments.slice(lastWork + 1)
  // 最终答复只认最后一条包含它的消息，更早的同类内容留在执行过程里
  const finalId = trailing.findLast(
    (segment) => segment.kind === "text" || segment.kind === "media"
  )?.messageId
  const finalParts: Record<string, number[]> = {}
  if (finalId) {
    finalParts[finalId] = trailing
      .filter(
        (segment) =>
          segment.messageId === finalId &&
          (segment.kind === "text" || segment.kind === "media")
      )
      .map((segment) => segment.index)
  }

  const finalReplyStarted = Boolean(finalId)
  const hasWork =
    segments.some((segment) => {
      if (segment.kind === "reasoning") return true
      if (segment.kind !== "tool-call") return false
      const part = segment.part as ToolCallMessagePart
      if (isPersistentTool(options, segment.messageId, part)) return false
      return (
        !isInteractionTool(part, interactionIds) &&
        !isDeclinedToolApproval(part)
      )
    }) ||
    segments.some(
      (segment) =>
        (segment.kind === "text" || segment.kind === "media") &&
        finalParts[segment.messageId]?.includes(segment.index) !== true
    ) ||
    lifecycleHasWork(options, messages)

  return { segments, finalParts, finalId, finalReplyStarted, hasWork }
}
