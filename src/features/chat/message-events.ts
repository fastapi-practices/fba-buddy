import { researchSources } from "./research-sources"
import {
  startWorkTiming,
  settleWorkTiming,
  settleMessageWork,
  snapshotWorkTiming,
} from "@/features/chat/work-timing"
import {
  appendMessageText,
  appendToolPart,
  messageParts,
  updateToolPartTiming,
} from "@/features/chat/message-parts"
import { snapshotActivityAttachment, snapshotContent } from "./snapshot-parts"
import { toolOutcome } from "./tool-outcome"
import { resolveToolApproval } from "./tool-approvals"
import { translateCurrent } from "@/lib/i18n"
import {
  estimateTextTokens,
  parseSnapshotUsage,
} from "@/features/chat/context-usage"
import { snapshotTurnContext } from "@/features/chat/turn-context"
import {
  readRichEvents,
  mergeRichEvent,
  persistentResourceUrl,
  lifecycleStatus,
} from "@/features/chat/rich-events"
import { snapshotMessageMetadata } from "@/features/chat/message-metadata"
import type {
  ChatMessage,
  ChatMessageTiming,
  ChatToolCall,
  SnapshotMessage,
} from "@/lib/types"
import jsonpatch, { type Operation } from "fast-json-patch"
import { ActivityMessageSchema } from "@ag-ui/core"

export function latestAgentState(messages: readonly ChatMessage[]): unknown {
  return (
    messages.findLast(
      (message) => message.turnContext && "agent_state" in message.turnContext
    )?.turnContext?.agent_state ?? {}
  )
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function splitThinkTags(content: string): { text: string; thinking: string } {
  const blocks = [...content.matchAll(/<think>([\s\S]*?)<\/think>/gi)]
  if (blocks.length === 0) {
    return { text: content, thinking: "" }
  }
  const thinking = blocks
    .map((match) => match[1]?.trim() ?? "")
    .filter(Boolean)
    .join("\n\n")
  const text = content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim()
  return { text, thinking }
}

export function extractSnapshotBody(message: {
  content?: unknown
  thinking?: unknown
}): { text: string; thinking: string } {
  const fieldThinking = stringField(message.thinking)

  const content = message.content
  if (typeof content === "string") {
    const split = splitThinkTags(content)
    return {
      text: split.text,
      thinking: [fieldThinking, split.thinking].filter(Boolean).join(""),
    }
  }

  let text = ""
  const thinking = fieldThinking
  for (const item of Array.isArray(content) ? content : []) {
    if (!item || typeof item !== "object") {
      continue
    }
    const part = item as Record<string, unknown>
    if (part.type === "text") text += stringField(part.text)
  }
  if (!thinking && text.includes("<think>")) {
    const split = splitThinkTags(text)
    return { text: split.text, thinking: split.thinking }
  }
  return { text, thinking }
}

function isReasoningSnapshot(message: SnapshotMessage): boolean {
  return message.role === "reasoning"
}

function snapshotTurnKey(message: SnapshotMessage): string {
  const pk = message.persisted_message_id ?? message.persistedMessageId
  if (pk != null) {
    return `pk:${pk}`
  }
  const match = /^(msg_\d+)/.exec(message.id)
  return match?.[1] ?? message.id
}

function snapshotTools(
  message: SnapshotMessage,
  suspended: boolean,
  inlineTools: readonly ChatToolCall[]
): ChatToolCall[] {
  const toolCalls = message.tool_calls ?? message.toolCalls ?? []
  const tools = new Map<string, ChatToolCall>()
  for (const [index, item] of toolCalls.entries()) {
    if (!item.id && !item.function?.name) continue
    const id = item.id || `${message.id}-tool-${index}`
    tools.set(id, {
      id,
      name: item.function?.name || "tool",
      args: item.function?.arguments || "",
    })
  }
  for (const inline of inlineTools) {
    const previous = tools.get(inline.id)
    tools.set(inline.id, {
      ...previous,
      ...inline,
      name: inline.name || previous?.name || "tool",
      args: inline.args || previous?.args || "",
    })
  }
  const context = snapshotTurnContext(message)
  const approvals = readRichEvents(context?.lifecycle_events)
  return [...tools.values()].map((tool) => {
    const event = approvals.findLast(
      (event) =>
        (event.name === "buddy.coding.approval" ||
          event.name === "buddy.coding.approval_resolved") &&
        event.value.call_id === tool.id
    )
    const terminal =
      tool.result !== undefined ||
      (tool.status !== undefined && tool.status !== "running")
    const pending = !terminal && event?.name === "buddy.coding.approval"
    return {
      ...tool,
      ...(event ? { hadApproval: true } : {}),
      ...((suspended && !terminal) || pending ? { pendingApproval: true } : {}),
      ...(suspended && !terminal ? { interruptId: `int-${tool.id}` } : {}),
      ...(pending
        ? {
            approvalRequestId: String(event.value.request_id),
            ...approvalMetadata(event.value),
          }
        : {}),
    }
  })
}

function approvalMetadata(
  value: Record<string, unknown>
): Partial<ChatToolCall> {
  const options = Array.isArray(value.options)
    ? value.options.filter(
        (option) =>
          option &&
          typeof option === "object" &&
          typeof option.id === "string" &&
          typeof option.kind === "string"
      )
    : undefined
  const unavailable = value.unavailable_reason ?? value.unavailableReason
  return {
    ...(options ? { approvalOptions: options } : {}),
    ...(typeof value.warning === "string"
      ? { approvalWarning: value.warning }
      : {}),
    ...(typeof unavailable === "string"
      ? { approvalUnavailableReason: unavailable }
      : value.can_respond === false
        ? {
            approvalUnavailableReason: translateCurrent(
              "common.approvalUnavailable"
            ),
          }
        : {}),
  }
}

function mergeAssistantFragment(
  target: ChatMessage,
  fragment: ChatMessage
): ChatMessage {
  const tools = [...(target.tools ?? [])]
  for (const tool of fragment.tools ?? []) {
    const index = tools.findIndex((item) => item.id === tool.id)
    if (index >= 0) {
      tools[index] = { ...tools[index], ...tool }
    } else {
      tools.push(tool)
    }
  }
  const statusRank: Record<NonNullable<ChatMessage["status"]>, number> = {
    streaming: 0,
    complete: 1,
    stopped: 2,
    "awaiting-approval": 3,
    error: 4,
  }
  const targetRank = statusRank[target.status ?? "complete"] ?? 1
  const fragmentRank = statusRank[fragment.status ?? "complete"] ?? 1
  const targetParts = messageParts(target)
  const previousToolIds = new Set(
    targetParts.flatMap((part) =>
      part.type === "tool-call" ? [part.toolCallId] : []
    )
  )
  return {
    ...target,
    ...(target.agUiActivities?.length || fragment.agUiActivities?.length
      ? {
          agUiActivities: [
            ...new Map(
              [
                ...(target.agUiActivities ?? []),
                ...(fragment.agUiActivities ?? []),
              ].map((activity) => [activity.id, activity])
            ).values(),
          ],
        }
      : {}),
    ...(target.sources?.length || fragment.sources?.length
      ? {
          sources: researchSources([
            ...(target.sources ?? []),
            ...(fragment.sources ?? []),
          ]),
        }
      : {}),
    ...(target.reasoningMessageIds?.length ||
    fragment.reasoningMessageIds?.length
      ? {
          reasoningMessageIds: [
            ...new Set([
              ...(target.reasoningMessageIds ?? []),
              ...(fragment.reasoningMessageIds ?? []),
            ]),
          ],
        }
      : {}),
    createdAt: target.createdAt ?? fragment.createdAt,
    origin: target.origin ?? fragment.origin,
    inputIntent: target.inputIntent ?? fragment.inputIntent,
    createdBy: target.createdBy ?? fragment.createdBy,
    attempt: fragment.attempt ?? target.attempt,
    content: `${target.content}${fragment.content}`,
    thinking: `${target.thinking ?? ""}${fragment.thinking ?? ""}` || undefined,
    tools: tools.length > 0 ? tools : undefined,
    parts: [
      ...targetParts,
      ...messageParts(fragment).filter(
        (part) =>
          part.type !== "tool-call" || !previousToolIds.has(part.toolCallId)
      ),
    ],
    attachments: [
      ...(target.attachments ?? []),
      ...(fragment.attachments ?? []),
    ],
    status: fragmentRank > targetRank ? fragment.status : target.status,
    error: fragment.error ?? target.error,
    errorDetail: fragment.errorDetail ?? target.errorDetail,
    usage: fragment.usage ?? target.usage,
    workTiming: fragment.workTiming ?? target.workTiming,
    turnContext:
      target.turnContext || fragment.turnContext
        ? {
            ...target.turnContext,
            ...fragment.turnContext,
            ...(target.turnContext?.lifecycle_events ||
            fragment.turnContext?.lifecycle_events
              ? {
                  lifecycle_events: [
                    ...readRichEvents(target.turnContext?.lifecycle_events),
                    ...readRichEvents(fragment.turnContext?.lifecycle_events),
                  ].reduce(
                    (events, item) => mergeRichEvent(events, item),
                    [] as import("@/features/chat/rich-events").RichEvent[]
                  ),
                }
              : {}),
          }
        : undefined,
  }
}

function attachToolResult(
  messages: ChatMessage[],
  toolCallId: string,
  result: string,
  isError = false,
  metadata: Partial<ChatToolCall> = {},
  completedAt?: number
) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role !== "assistant" || !message.tools) {
      continue
    }
    const toolIndex = message.tools.findIndex((tool) => tool.id === toolCallId)
    if (toolIndex < 0) {
      continue
    }
    const tools = message.tools.slice()
    const updated = {
      ...tools[toolIndex],
      result,
      pendingApproval: false,
      ...(tools[toolIndex]?.pendingApproval ||
      tools[toolIndex]?.approvalRequestId
        ? { hadApproval: true }
        : {}),
      ...(tools[toolIndex]?.approvalRequestId
        ? { approvalRequestId: undefined }
        : {}),
      ...(isError
        ? { isError: true, status: "error" as const }
        : { status: "complete" as const }),
      ...metadata,
    }
    tools[toolIndex] = updated
    if (completedAt !== undefined)
      messages[index] = {
        ...message,
        tools,
        parts: updateToolPartTiming(message, toolCallId, completedAt),
      }
    else messages[index] = { ...message, tools }
    return
  }
}

function meaningfulActivity(value: Record<string, unknown>) {
  if (value.activityType === "pydantic_ai_compaction") return true
  if (
    ["title", "summary", "content", "output", "task", "name"].some(
      (key) => typeof value[key] === "string" && value[key].trim()
    )
  )
    return true
  if (
    value.content &&
    typeof value.content === "object" &&
    Object.keys(value.content).length > 0
  )
    return true
  return (
    value.persistent === true ||
    Boolean(
      persistentResourceUrl(value) &&
      (typeof value.status === "string" ||
        typeof value.state === "string" ||
        typeof value.persistent === "boolean")
    )
  )
}
function activityOwner(
  messages: ChatMessage[],
  value: Record<string, unknown>
) {
  if (typeof value.id !== "string" || !value.id) return undefined
  return messages.findLast((message) =>
    readRichEvents(message.turnContext?.lifecycle_events).some(
      (event) => event.name === "buddy.activity" && event.value.id === value.id
    )
  )
}

function attachRichEvent(
  messages: ChatMessage[],
  event: { name: string; value: Record<string, unknown> },
  targetMessageId?: string
) {
  const target =
    (targetMessageId
      ? messages.find((message) => message.id === targetMessageId)
      : undefined) ??
    messages.findLast((message) => message.role === "assistant")
  const update = (current: ChatMessage): ChatMessage => ({
    ...current,
    turnContext: {
      ...current.turnContext,
      lifecycle_events: mergeRichEvent(
        readRichEvents(current.turnContext?.lifecycle_events),
        event
      ),
    },
  })
  return target
    ? patchMessage(messages, target.id, update)
    : [
        ...messages,
        update({
          id: targetMessageId || crypto.randomUUID(),
          role: "assistant",
          content: "",
          isPlaceholder: true,
          status: "streaming",
        }),
      ]
}

function applyJsonPatch(document: unknown, value: unknown): unknown {
  if (!Array.isArray(value)) throw new Error("Invalid AG-UI JSON Patch")
  return jsonpatch.applyPatch(
    structuredClone(document),
    structuredClone(value) as Operation[],
    true,
    false
  ).newDocument
}

export function snapshotToChatMessages(
  messages: SnapshotMessage[]
): ChatMessage[] {
  const attributed = messages.filter((message) => message.subagentRunId)
  if (attributed.length) {
    let parents = snapshotToChatMessages(
      messages.filter((message) => !message.subagentRunId)
    )
    for (const subagentRunId of new Set(
      attributed.map((message) => message.subagentRunId!)
    )) {
      const scoped = attributed.filter(
        (message) => message.subagentRunId === subagentRunId
      )
      const nested = snapshotToChatMessages(
        scoped.map((message) => ({ ...message, subagentRunId: undefined }))
      )
      const previousParent = messages
        .slice(0, messages.indexOf(scoped[0]!))
        .findLast(
          (message) => message.role === "assistant" && !message.subagentRunId
        )
      const owner = parents.findLast((message) =>
        readRichEvents(message.turnContext?.lifecycle_events).some(
          (item) =>
            item.name === "buddy.subagent" &&
            item.value.task_id === subagentRunId
        )
      ) ??
        parents.findLast(
          (message) =>
            message.id === previousParent?.id ||
            (previousParent?.persistedMessageId != null &&
              message.pk === previousParent.persistedMessageId)
        ) ??
        parents.findLast((message) => message.role === "assistant") ?? {
          id: crypto.randomUUID(),
          role: "assistant" as const,
          content: "",
          status: "complete" as const,
        }
      parents = upsertMessage(parents, {
        ...owner,
        agUiSubagents: { ...owner.agUiSubagents, [subagentRunId]: nested },
      })
      parents = attachRichEvent(
        parents,
        {
          name: "buddy.subagent",
          value: {
            task_id: subagentRunId,
            output: nested.map((message) => message.content).join("\n"),
            tool_calls: nested.flatMap((message) =>
              (message.tools ?? []).map((tool) => ({
                id: tool.id,
                name: tool.name,
                input: tool.args,
                output: tool.result,
                status: tool.isError
                  ? "failed"
                  : tool.result != null
                    ? "completed"
                    : "unknown",
              }))
            ),
          },
        },
        owner.id
      )
    }
    return parents
  }
  const result: ChatMessage[] = []
  let pendingThinking = ""
  let pendingThinkingIds: string[] = []
  let pendingReasoningParts: ChatMessage["parts"] = []
  let pendingThinkingKey: string | null = null
  const turnKeyByAssistantId = new Map<string, string>()

  for (const message of messages) {
    const body = extractSnapshotBody(message)
    const structured = snapshotContent(message)
    const structuredText = structured.parts
      .flatMap((part) => (part.type === "text" ? [part.text] : []))
      .join("")
    const text =
      typeof message.content === "string" && !message.parts?.length
        ? body.text
        : structuredText || body.text
    const structuredThinking = structured.parts
      .flatMap((part) => (part.type === "reasoning" ? [part.text] : []))
      .join("")
    if (text && !structured.parts.some((part) => part.type === "text"))
      structured.parts.push({ type: "text", text })
    if (
      body.thinking &&
      !structured.parts.some((part) => part.type === "reasoning")
    ) {
      structured.parts.unshift({ type: "reasoning", text: body.thinking })
    }
    const pk = message.persisted_message_id ?? message.persistedMessageId
    const role = message.role
    if (role === "activity") {
      const activityMessage = ActivityMessageSchema.parse({
        ...message,
        activityType: message.activityType,
      })
      const attachment = snapshotActivityAttachment(message, message.id)
      if (attachment) {
        const previous = result.at(-1)
        const target: ChatMessage =
          previous?.role === "assistant" && (pk == null || previous.pk === pk)
            ? previous
            : {
                id: message.id,
                role: "assistant" as const,
                content: "",
                status: "complete" as const,
                ...snapshotMessageMetadata(message),
                ...(pk != null ? { pk } : {}),
                ...(snapshotTurnContext(message)
                  ? { turnContext: snapshotTurnContext(message) }
                  : {}),
              }
        target.attachments = [...(target.attachments ?? []), attachment]
        target.agUiActivities = [
          ...(target.agUiActivities ?? []),
          activityMessage,
        ]
        const metadata = snapshotMessageMetadata(message)
        target.createdAt ??= metadata.createdAt
        target.origin ??= metadata.origin
        target.inputIntent ??= metadata.inputIntent
        target.createdBy ??= metadata.createdBy
        target.attempt ??= metadata.attempt
        target.turnContext ??= snapshotTurnContext(message)
        target.parts = [
          ...messageParts(target).filter(
            (part) =>
              part.type !== "attachment" || part.attachmentId !== attachment.id
          ),
          { type: "attachment", attachmentId: attachment.id },
        ]
        if (target !== previous) {
          result.push(target)
          turnKeyByAssistantId.set(target.id, snapshotTurnKey(message))
        }
        continue
      }
      const activity = message as unknown as Record<string, unknown>
      const previous = result.at(-1)
      const value = {
        id: message.id,
        activityType: activity.activityType ?? activity.activity_type,
        ...(typeof activity.content === "object" && activity.content
          ? activity.content
          : { content: activity.content }),
      }
      const existing = activityOwner(result, value)
      const target =
        existing ?? (previous?.role === "assistant" ? previous : undefined)
      const item = { name: "buddy.activity", value }
      if (target) {
        target.agUiActivities = [
          ...(target.agUiActivities ?? []),
          activityMessage,
        ]
        target.turnContext = {
          ...target.turnContext,
          lifecycle_events: mergeRichEvent(
            readRichEvents(target.turnContext?.lifecycle_events),
            item
          ),
        }
      } else
        result.push({
          id: message.id,
          role: "assistant",
          content: "",
          status: "complete",
          agUiActivities: [activityMessage],
          turnContext: { lifecycle_events: [item] },
        })
      continue
    }
    if (role === "user") {
      pendingThinking = ""
      pendingThinkingIds = []
      pendingReasoningParts = []
      pendingThinkingKey = null
      const turnContext = snapshotTurnContext(message)
      result.push({
        id: message.id,
        role: "user",
        ...snapshotMessageMetadata(message),
        content: text,
        ...(structured.attachments.length
          ? { attachments: structured.attachments }
          : {}),
        status: "complete",
        ...(pk != null ? { pk } : {}),
        ...(turnContext ? { turnContext } : {}),
      })
      continue
    }
    if (isReasoningSnapshot(message)) {
      pendingThinking += structuredThinking || body.thinking || text
      pendingThinkingIds.push(message.id)
      pendingReasoningParts.push({
        type: "reasoning",
        messageId: message.id,
        text: structuredThinking || body.thinking || text,
      })
      pendingThinkingKey = snapshotTurnKey(message)
      continue
    }
    if (role === "tool") {
      const toolCallId = message.tool_call_id ?? message.toolCallId
      if (toolCallId) {
        attachToolResult(
          result,
          toolCallId,
          text,
          isErrorSnapshot(message) ||
            message.isError === true ||
            message.is_error === true,
          {
            resultMessageId: message.id,
            ...toolOutcome(message.encryptedValue),
          }
        )
      }
      continue
    }
    if (role !== "assistant") {
      continue
    }
    const key = snapshotTurnKey(message)
    const suspended = isSuspendedSnapshot(message)
    const failed = isErrorSnapshot(message)
    const stopped = isStoppedSnapshot(message)
    const errorText = snapshotErrorText(message)
    const errorDetail = snapshotErrorDetail(message)
    const pending =
      !pendingThinkingKey || pendingThinkingKey === key ? pendingThinking : ""
    const thinking = `${pending}${structuredThinking || body.thinking}`
    const tools = snapshotTools(message, suspended, structured.tools)
    for (const tool of tools) {
      if (
        !structured.parts.some(
          (part) => part.type === "tool-call" && part.toolCallId === tool.id
        )
      ) {
        structured.parts.push({ type: "tool-call", toolCallId: tool.id })
      }
    }
    if (pending) structured.parts.unshift(...pendingReasoningParts)
    const usage = parseSnapshotUsage(message.usage, message.cost)
    const turnContext = snapshotTurnContext(message)
    const fragment: ChatMessage = {
      id: message.id,
      role: "assistant",
      ...(turnContext?.ag_ui_activities
        ? {
            agUiActivities: turnContext.ag_ui_activities.map((activity) =>
              ActivityMessageSchema.parse(activity)
            ),
          }
        : {}),
      ...(pending ? { reasoningMessageIds: pendingThinkingIds } : {}),
      ...snapshotMessageMetadata(message),
      content: failed && errorText && text === errorText ? "" : text,
      ...(tools.length > 0 ? { tools } : {}),
      parts: structured.parts.filter(
        (part) =>
          !(failed && errorText && text === errorText && part.type === "text")
      ),
      ...(structured.attachments.length
        ? { attachments: structured.attachments }
        : {}),
      status: snapshotAssistantStatus(suspended, failed, stopped),
      ...(thinking ? { thinking } : {}),
      ...(turnContext ? { turnContext } : {}),
      ...(failed
        ? {
            error:
              errorText || text || translateCurrent("common.generationFailed"),
            ...(errorDetail ? { errorDetail } : {}),
          }
        : {}),
      ...(pk != null ? { pk } : {}),
      ...(usage ? { usage } : {}),
      ...(message.timing ? { timing: message.timing } : {}),
      workTiming: snapshotWorkTiming(
        message,
        snapshotAssistantStatus(suspended, failed, stopped)
      ),
    }
    const last = result.at(-1)
    const lastKey = last ? turnKeyByAssistantId.get(last.id) : undefined
    if (
      last?.role === "assistant" &&
      lastKey === key &&
      last.attempt?.id === fragment.attempt?.id
    ) {
      result[result.length - 1] = mergeAssistantFragment(last, fragment)
    } else {
      result.push(fragment)
      turnKeyByAssistantId.set(fragment.id, key)
    }
    if (thinking) {
      pendingThinking = ""
      pendingThinkingIds = []
      pendingReasoningParts = []
      pendingThinkingKey = null
    }
  }
  if (pendingThinking) {
    const last = result.at(-1)
    if (last?.role === "assistant") {
      last.reasoningMessageIds = [
        ...new Set([
          ...(last.reasoningMessageIds ?? []),
          ...pendingThinkingIds,
        ]),
      ]
      last.parts = [...messageParts(last), ...pendingReasoningParts]
      last.thinking = `${last.thinking ?? ""}${pendingThinking}`
    }
  }
  return result.map((message) => {
    let resolved = [message]
    for (const activity of message.agUiActivities ?? []) {
      if (snapshotActivityAttachment(activity, activity.id)) continue
      resolved = reduceAgUiEvent(resolved, {
        type: "ACTIVITY_SNAPSHOT",
        messageId: activity.id,
        activityType: activity.activityType,
        content: activity.content,
      })
    }
    return resolved[0]!
  })
}

function upsertMessage(
  messages: ChatMessage[],
  next: ChatMessage
): ChatMessage[] {
  const index = messages.findIndex((item) => item.id === next.id)
  if (index < 0) {
    return [...messages, next]
  }
  const copy = messages.slice()
  copy[index] = next
  return copy
}

function patchMessage(
  messages: ChatMessage[],
  messageId: string,
  patch: (current: ChatMessage) => ChatMessage,
  fallback?: ChatMessage
): ChatMessage[] {
  const index = messages.findIndex((item) => item.id === messageId)
  if (index < 0) {
    return fallback ? [...messages, fallback] : messages
  }
  const copy = messages.slice()
  copy[index] = patch(copy[index])
  return copy
}

function emptyTiming(now: number): ChatMessageTiming {
  return {
    streamStartTime: now,
    totalChunks: 0,
    toolCallCount: 0,
  }
}

function ensureTiming(current: ChatMessage, now: number): ChatMessageTiming {
  return current.timing ?? emptyTiming(now)
}

function withTextChunk(
  current: ChatMessage,
  now: number,
  delta: string
): ChatMessageTiming {
  const timing = ensureTiming(current, now)
  const firstTokenTime =
    timing.firstTokenTime ??
    (delta ? Math.max(0, now - timing.streamStartTime) : undefined)
  return {
    ...timing,
    totalChunks: timing.totalChunks + 1,
    ...(firstTokenTime !== undefined ? { firstTokenTime } : {}),
  }
}

export function completeMessageTiming(
  message: ChatMessage,
  now = Date.now()
): ChatMessage {
  const timing = message.timing
  if (!timing || timing.totalStreamTime !== undefined) {
    return message
  }
  const totalStreamTime = Math.max(0, now - timing.streamStartTime)
  const tokenCount =
    message.usage?.outputTokens ?? estimateTextTokens(message.content)
  const seconds = totalStreamTime / 1000
  const tokensPerSecond =
    tokenCount > 0 && seconds > 0 ? tokenCount / seconds : undefined
  return {
    ...message,
    timing: {
      ...timing,
      totalStreamTime,
      tokenCount,
      ...(tokensPerSecond !== undefined ? { tokensPerSecond } : {}),
    },
  }
}

/**
 * 运行结束时仍在执行的工具要落到终态，
 * 否则执行过程和产物卡片会一直显示"执行中"
 */
export function settleRunningTools(
  tools: ChatToolCall[] | undefined,
  status: "complete" | "error" | "stopped"
): ChatToolCall[] | undefined {
  if (!tools) return tools
  let changed = false
  const next = tools.map((tool) => {
    if (tool.pendingApproval) return tool
    if (tool.result !== undefined) {
      if (tool.status !== "running") return tool
      changed = true
      return { ...tool, status: "complete" as const }
    }
    if (tool.status !== "running") return tool
    changed = true
    return {
      ...tool,
      status: status === "error" ? ("error" as const) : ("stopped" as const),
    }
  })
  return changed ? next : tools
}

export function settleStreamingMessages(
  messages: ChatMessage[],
  nextStatus: "complete" | "error" | "stopped",
  now = Date.now(),
  fallbackError = translateCurrent("common.generationFailed")
): ChatMessage[] {
  const settled = messages.map((item) => {
    if (
      item.status !== "streaming" &&
      !item.agUiActiveTextId &&
      !item.agUiActiveToolId &&
      !item.agUiActiveReasoningId &&
      !(
        item.status === "awaiting-approval" &&
        (nextStatus !== "complete" ||
          item.tools?.some((tool) => tool.approvalRequestId))
      )
    ) {
      return item
    }
    return completeMessageTiming(
      {
        ...item,
        status: nextStatus,
        agUiActiveTextId: undefined,
        agUiActiveToolId: undefined,
        agUiActiveReasoningId: undefined,
        parts: item.parts?.map((part) =>
          part.type === "reasoning" &&
          part.timing &&
          part.timing.completedAt === undefined
            ? { ...part, timing: { ...part.timing, completedAt: now } }
            : part
        ),
        ...(item.agUiSubagents
          ? {
              agUiSubagents: Object.fromEntries(
                Object.entries(item.agUiSubagents).map(([id, nested]) => [
                  id,
                  settleStreamingMessages(
                    nested,
                    nextStatus,
                    now,
                    fallbackError
                  ),
                ])
              ),
            }
          : {}),
        tools: item.tools?.map((tool) => {
          if (tool.result == null) {
            return {
              ...tool,
              status:
                nextStatus === "error"
                  ? ("error" as const)
                  : ("stopped" as const),
              pendingApproval: false,
              ...(tool.pendingApproval || tool.approvalRequestId
                ? { hadApproval: true }
                : {}),
              approvalRequestId: undefined,
            }
          }
          return tool.pendingApproval || tool.approvalRequestId
            ? {
                ...tool,
                pendingApproval: false,
                hadApproval: true,
                approvalRequestId: undefined,
              }
            : tool
        }),
        ...(nextStatus === "error" ? { error: fallbackError } : {}),
      },
      now
    )
  })
  return settled.map((message) => {
    const work = message.workTiming
    if (
      !work ||
      (work.status !== "running" && work.status !== "awaiting-approval")
    )
      return message
    if (message.status === "awaiting-approval" && nextStatus === "complete")
      return message
    const status =
      message.status === "error" || message.status === "stopped"
        ? message.status
        : nextStatus
    return { ...message, workTiming: settleWorkTiming(work, status, now) }
  })
}

export function mergeLiveMessageTiming(
  snapshot: ChatMessage[],
  live: ChatMessage[]
): ChatMessage[] {
  const liveAssistants = live.filter(
    (item) => item.role === "assistant" && item.timing
  )
  if (liveAssistants.length === 0) {
    return snapshot
  }

  const byId = new Map(
    liveAssistants.map((item) => [item.id, item.timing as ChatMessageTiming])
  )
  const usedIds = new Set<string>()
  const merged = snapshot.map((item) => {
    if (item.role !== "assistant") {
      return item
    }
    const timing = byId.get(item.id)
    if (!timing) {
      return item
    }
    usedIds.add(item.id)
    const match = liveAssistants.find((message) => message.id === item.id)
    return { ...item, timing, workTiming: item.workTiming ?? match?.workTiming }
  })

  const remaining = liveAssistants
    .filter((item) => !usedIds.has(item.id))
    .map((item) => item.timing as ChatMessageTiming)
  if (remaining.length === 0) {
    return merged
  }

  const unmatched: number[] = []
  merged.forEach((item, index) => {
    if (item.role === "assistant" && item.timing === undefined) {
      unmatched.push(index)
    }
  })
  const slots = unmatched.slice(-remaining.length)
  if (slots.length === 0) {
    return merged
  }
  const offset = remaining.length - slots.length
  const next = merged.slice()
  slots.forEach((index, i) => {
    next[index] = {
      ...next[index],
      timing: remaining[offset + i],
      workTiming:
        next[index]?.workTiming ??
        liveAssistants.filter((item) => !usedIds.has(item.id))[offset + i]
          ?.workTiming,
    }
  })
  return next
}

function lastIndexOf(
  messages: ChatMessage[],
  predicate: (item: ChatMessage) => boolean
): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (predicate(messages[index])) {
      return index
    }
  }
  return -1
}

function mergeErrorFields(
  snapshot: ChatMessage,
  live: ChatMessage
): ChatMessage {
  if (snapshot.status === "error" && snapshot.error) {
    return {
      ...snapshot,
      errorDetail: snapshot.errorDetail ?? live.errorDetail,
    }
  }
  return {
    ...snapshot,
    status: "error",
    error: snapshot.error || live.error,
    errorDetail: snapshot.errorDetail ?? live.errorDetail,
  }
}

export function overlayLiveErrors(
  snapshot: ChatMessage[],
  live: ChatMessage[]
): ChatMessage[] {
  const liveErrors = live.filter(
    (item) => item.role === "assistant" && item.status === "error"
  )
  if (liveErrors.length === 0) {
    return snapshot
  }

  const usedIds = new Set<string>()
  const merged = snapshot.map((item) => {
    if (item.role !== "assistant") {
      return item
    }
    const match = liveErrors.find((error) => error.id === item.id)
    if (!match) {
      return item
    }
    usedIds.add(item.id)
    return mergeErrorFields(item, match)
  })

  const remaining = liveErrors.filter((item) => !usedIds.has(item.id))
  if (remaining.length === 0) {
    return merged
  }

  const lastLive = remaining[remaining.length - 1]
  const lastAssistant = lastIndexOf(merged, (item) => item.role === "assistant")
  if (lastAssistant >= 0) {
    const next = merged.slice()
    next[lastAssistant] = mergeErrorFields(next[lastAssistant], lastLive)
    return next
  }
  return [...merged, lastLive]
}

function overlayProcessFields(
  snapshot: ChatMessage,
  live: ChatMessage
): ChatMessage {
  const thinking = snapshot.thinking || live.thinking
  const tools = snapshot.tools?.length
    ? snapshot.tools.map((tool) => {
        const previous = live.tools?.find((item) => item.id === tool.id)
        return previous
          ? {
              ...previous,
              ...tool,
              result: tool.result ?? previous.result,
              isError: tool.isError ?? previous.isError,
              status: tool.status ?? previous.status,
            }
          : tool
      })
    : live.tools
  const attachments = snapshot.attachments?.length
    ? snapshot.attachments
    : live.attachments
  const canKeepLiveOrder =
    live.parts &&
    snapshot.content === live.content &&
    (!snapshot.thinking || snapshot.thinking === live.thinking)
  const next = {
    ...snapshot,
    agUiActivities: snapshot.agUiActivities ?? live.agUiActivities,
    agUiSubagents: snapshot.agUiSubagents ?? live.agUiSubagents,
    agUiReasoningSpans: snapshot.agUiReasoningSpans ?? live.agUiReasoningSpans,
    agUiActiveTextId: live.agUiActiveTextId,
    agUiActiveToolId: live.agUiActiveToolId,
    agUiActiveReasoningId: live.agUiActiveReasoningId,
    turnContext: { ...live.turnContext, ...snapshot.turnContext },
    ...(snapshot.reasoningMessageIds?.length || live.reasoningMessageIds?.length
      ? {
          reasoningMessageIds: [
            ...new Set([
              ...(snapshot.reasoningMessageIds ?? []),
              ...(live.reasoningMessageIds ?? []),
            ]),
          ],
        }
      : {}),
    thinking,
    tools,
    attachments,
    workTiming: snapshot.workTiming ?? live.workTiming,
  }
  const parts = canKeepLiveOrder ? live.parts : messageParts(next)
  const missing: ChatMessage["parts"] = []
  for (const tool of tools ?? []) {
    if (
      !parts?.some(
        (part) => part.type === "tool-call" && part.toolCallId === tool.id
      )
    )
      missing.push({ type: "tool-call", toolCallId: tool.id })
  }
  for (const attachment of attachments ?? []) {
    if (
      !parts?.some(
        (part) =>
          part.type === "attachment" && part.attachmentId === attachment.id
      )
    )
      missing.push({ type: "attachment", attachmentId: attachment.id })
  }
  if (thinking && !parts?.some((part) => part.type === "reasoning"))
    missing.unshift(
      ...messageParts(live).filter((part) => part.type === "reasoning")
    )
  return { ...next, parts: [...(parts ?? []), ...missing] }
}

function mergeLiveMessageProcess(
  snapshot: ChatMessage[],
  live: ChatMessage[]
): ChatMessage[] {
  const liveAssistants = live.filter(
    (item) =>
      item.role === "assistant" &&
      (Boolean(item.parts?.length) ||
        Boolean(item.thinking) ||
        Boolean(item.turnContext) ||
        Boolean(item.agUiActivities?.length) ||
        Boolean(item.agUiSubagents) ||
        (item.tools?.length ?? 0) > 0 ||
        Boolean(item.attachments?.length))
  )
  if (liveAssistants.length === 0) {
    return snapshot
  }

  const byId = new Map(liveAssistants.map((item) => [item.id, item]))
  const usedIds = new Set<string>()
  const merged = snapshot.map((item) => {
    if (item.role !== "assistant") {
      return item
    }
    const match = byId.get(item.id)
    if (!match) {
      return item
    }
    usedIds.add(item.id)
    return overlayProcessFields(item, match)
  })

  const remaining = liveAssistants.filter((item) => !usedIds.has(item.id))
  if (remaining.length === 0) {
    return merged
  }

  const unmatched: number[] = []
  merged.forEach((item, index) => {
    if (
      item.role === "assistant" &&
      !item.thinking &&
      !(item.tools && item.tools.length > 0)
    ) {
      unmatched.push(index)
    }
  })
  const slots = unmatched.slice(-remaining.length)
  if (slots.length === 0) {
    return merged
  }
  const offset = remaining.length - slots.length
  const next = merged.slice()
  slots.forEach((index, i) => {
    next[index] = overlayProcessFields(next[index], remaining[offset + i])
  })
  return next
}

export function mergeSnapshotWithLive(
  snapshot: ChatMessage[],
  live: ChatMessage[]
): ChatMessage[] {
  // 空快照意味着后端尚未回填，此时以流式现场为准，不能把消息抹掉
  if (snapshot.length === 0) {
    return live
  }
  const withAttachments = snapshot.map((item) => {
    const match = live.find(
      (previous) =>
        previous.id === item.id || (item.pk != null && previous.pk === item.pk)
    )
    return match?.attachments?.length && !item.attachments?.length
      ? { ...item, attachments: match.attachments }
      : item
  })
  return overlayLiveErrors(
    mergeLiveMessageProcess(
      mergeLiveMessageTiming(withAttachments, live),
      live
    ),
    live
  )
}

function assistantForEvent(
  messages: ChatMessage[],
  event: Record<string, unknown>
) {
  const id = stringField(event.parentMessageId ?? event.messageId)
  if (id)
    return messages.find(
      (message) =>
        message.role === "assistant" &&
        (message.id === id || message.reasoningMessageIds?.includes(id))
    )
  return messages.findLast((message) => message.role === "assistant")
}

function toolResultFailed(event: Record<string, unknown>): boolean {
  if (
    event.isError === true ||
    event.is_error === true ||
    event.status === "failed" ||
    event.status === "error"
  )
    return true
  try {
    const value: unknown =
      typeof event.content === "string"
        ? JSON.parse(event.content)
        : event.content
    return Boolean(
      value &&
      typeof value === "object" &&
      (("isError" in value && value.isError === true) ||
        ("is_error" in value && value.is_error === true))
    )
  } catch {
    return false
  }
}

function reduceAgUiEvent(
  messages: ChatMessage[],
  event: Record<string, unknown>,
  now = Date.now()
): ChatMessage[] {
  const type = String(event.type ?? "")
  const messageId = stringField(event.messageId)
  const delta = stringField(event.delta)
  if (type === "ACTIVITY_SNAPSHOT" || type === "ACTIVITY_DELTA") {
    const owner =
      messages.findLast((message) =>
        message.agUiActivities?.some((item) => item.id === messageId)
      ) ?? messages.findLast((message) => message.role === "assistant")
    const previous = owner?.agUiActivities?.find(
      (item) => item.id === messageId
    )
    if (
      !previous &&
      messages.some(
        (message) => message.id === messageId && !message.isPlaceholder
      )
    )
      return messages
    if (type === "ACTIVITY_SNAPSHOT" && previous && event.replace === false)
      return messages
    if (type === "ACTIVITY_DELTA" && !previous)
      throw new Error(`AG-UI activity snapshot missing: ${messageId}`)
    const content =
      type === "ACTIVITY_DELTA"
        ? applyJsonPatch(previous?.content ?? {}, event.patch)
        : event.content
    const activity = ActivityMessageSchema.parse({
      id: messageId,
      role: "activity" as const,
      activityType: stringField(event.activityType),
      content,
    })
    const target = owner ?? {
      id: crypto.randomUUID(),
      role: "assistant" as const,
      content: "",
      isPlaceholder: true,
      status: "streaming" as const,
    }
    const prepared = upsertMessage(messages, {
      ...target,
      agUiActivities: [
        ...(target.agUiActivities ?? []).filter(
          (item) => item.id !== messageId
        ),
        activity,
      ],
      turnContext: {
        ...target.turnContext,
        lifecycle_events: readRichEvents(
          target.turnContext?.lifecycle_events
        ).filter(
          (item) =>
            item.name !== "buddy.activity" || item.value.id !== messageId
        ),
      },
    })
    return reduceAgUiEvent(
      prepared,
      {
        ...event,
        type: "ACTIVITY_RESOLVED",
        content,
        parentMessageId: target.id,
      },
      now
    )
  }
  if (type === "CUSTOM" && event.name === "buddy.citations") {
    const value = event.value as Record<string, unknown> | undefined
    if (!value || typeof value.message_id !== "string") return messages
    return patchMessage(messages, value.message_id, (current) => ({
      ...current,
      sources: researchSources([
        ...(current.sources ?? []),
        ...researchSources(value.sources),
      ]),
    }))
  }
  if (type === "RUN_STARTED") {
    const runId = stringField(event.runId)
    if (!runId) return messages
    const startedAt =
      typeof event.timestamp === "number" &&
      Number.isFinite(event.timestamp) &&
      event.timestamp >= 0
        ? event.timestamp
        : now
    const last = messages.at(-1)
    if (
      last?.role === "assistant" &&
      (last.isPlaceholder ||
        last.status === "streaming" ||
        last.status === "awaiting-approval")
    )
      return messages.map((current) => {
        if (
          current.id !== last.id &&
          (!last.workTiming ||
            current.workTiming?.runId !== last.workTiming.runId)
        )
          return current
        return {
          ...current,
          ...(current.id === last.id ? { status: "streaming" as const } : {}),
          workTiming:
            current.workTiming &&
            (current.workTiming.runId === runId ||
              current.workTiming.status === "running" ||
              current.workTiming.status === "awaiting-approval")
              ? {
                  ...current.workTiming,
                  runId,
                  status: "running" as const,
                  endedAt: undefined,
                }
              : startWorkTiming(runId, startedAt),
        }
      })
    return [
      ...messages,
      {
        id: runId,
        role: "assistant",
        content: "",
        isPlaceholder: true,
        status: "streaming",
        workTiming: startWorkTiming(runId, startedAt),
      },
    ]
  }
  if (type === "MESSAGES_SNAPSHOT" && Array.isArray(event.messages)) {
    const snapshots = event.messages as SnapshotMessage[]
    const activityIds = snapshots
      .filter((message) => message.role === "activity")
      .map((message) => message.id)
    const reasoningIds = snapshots
      .filter((message) => message.role === "reasoning")
      .map((message) => message.id)
    const live = messages.map((message) => ({
      ...message,
      ...(activityIds.length
        ? {
            agUiActivities: message.agUiActivities?.filter((activity) =>
              activityIds.includes(activity.id)
            ),
            turnContext: {
              ...message.turnContext,
              lifecycle_events: readRichEvents(
                message.turnContext?.lifecycle_events
              ).filter(
                (item) =>
                  item.name !== "buddy.activity" ||
                  !message.agUiActivities?.some(
                    (activity) => activity.id === item.value.id
                  )
              ),
            },
          }
        : {}),
      ...(reasoningIds.length
        ? {
            thinking: undefined,
            reasoningMessageIds: undefined,
            agUiReasoningSpans: undefined,
            agUiActiveReasoningId: undefined,
            parts: messageParts(message).filter(
              (part) => part.type !== "reasoning"
            ),
          }
        : {}),
    }))
    const next = mergeSnapshotWithLive(snapshotToChatMessages(snapshots), live)
    const active = messages.findLast(
      (message) =>
        message.workTiming?.status === "running" ||
        message.workTiming?.status === "awaiting-approval"
    )
    if (!active?.workTiming) return next
    const userIndex = next.findLastIndex((message) => message.role === "user")
    const assistantIndex = next.findLastIndex(
      (message) => message.role === "assistant"
    )
    if (assistantIndex > userIndex) {
      const assistant = next[assistantIndex]!
      next[assistantIndex] = {
        ...assistant,
        workTiming: assistant.workTiming ?? active.workTiming,
      }
      return next
    }
    return [...next, { ...active, isPlaceholder: true }]
  }
  if (type === "ACTIVITY_RESOLVED") {
    const attachment = snapshotActivityAttachment(event, messageId)
    if (attachment) {
      const target = assistantForEvent(messages, {
        parentMessageId: event.parentMessageId,
      })
      const current: ChatMessage = target ?? {
        id: messageId,
        role: "assistant",
        content: "",
        status: "streaming",
      }
      return upsertMessage(messages, {
        ...current,
        attachments: [
          ...(current.attachments ?? []).filter(
            (item) => item.id !== attachment.id
          ),
          attachment,
        ],
        parts: [
          ...messageParts(current).filter(
            (part) =>
              part.type !== "attachment" || part.attachmentId !== attachment.id
          ),
          { type: "attachment", attachmentId: attachment.id },
        ],
      })
    }
  }
  if (type === "STEP_STARTED" || type === "STEP_FINISHED") {
    return attachRichEvent(
      messages,
      {
        name: "buddy.activity",
        value: {
          id: stringField(event.stepName),
          name: stringField(event.stepName),
          title: stringField(event.stepName),
          status: type === "STEP_STARTED" ? "running" : "completed",
        },
      },
      stringField(event.parentMessageId) || undefined
    )
  }

  if (type === "SUBAGENT_STARTED") {
    const parent = messages.findLast(
      (message) =>
        message.agUiSubagents?.[stringField(event.parentSubagentRunId)] ||
        readRichEvents(message.turnContext?.lifecycle_events).some(
          (item) =>
            item.name === "buddy.subagent" &&
            item.value.task_id === event.parentSubagentRunId
        )
    )
    return attachRichEvent(
      messages,
      {
        name: "buddy.subagent",
        value: {
          ...((
            event.metadata as { buddy?: Record<string, unknown> } | undefined
          )?.buddy ?? {}),
          task_id: stringField(event.subagentRunId),
          agent_name: stringField(event.name),
          name: stringField(event.name),
          description: stringField(event.description),
          parent_tool_call_id: stringField(event.parentToolCallId),
          parent_subagent_run_id: stringField(event.parentSubagentRunId),
          parent_message_id: stringField(event.parentMessageId),
          status: "running",
        },
      },
      parent?.id || stringField(event.parentMessageId) || undefined
    )
  }

  if (type === "SUBAGENT_FINISHED" || type === "SUBAGENT_ERROR") {
    const outcome = event.outcome as { type?: string } | undefined
    const owner = messages.findLast((message) =>
      readRichEvents(message.turnContext?.lifecycle_events).some(
        (item) =>
          item.name === "buddy.subagent" &&
          item.value.task_id === event.subagentRunId
      )
    )
    return attachRichEvent(
      messages,
      {
        name: "buddy.subagent",
        value: {
          ...((
            event.metadata as { buddy?: Record<string, unknown> } | undefined
          )?.buddy ?? {}),
          task_id: stringField(event.subagentRunId),
          status:
            type === "SUBAGENT_ERROR"
              ? event.code === "cancelled"
                ? "cancelled"
                : "failed"
              : outcome?.type === "suspended"
                ? "queued"
                : "completed",
          ...(type === "SUBAGENT_ERROR"
            ? {
                error: stringField(event.message),
                code: stringField(event.code),
              }
            : {
                result: event.result,
                ...(event.result != null ? { output: event.result } : {}),
              }),
        },
      },
      owner?.id || stringField(event.parentMessageId) || undefined
    )
  }

  if (type === "STATE_SNAPSHOT" || type === "STATE_DELTA") {
    const previousState = latestAgentState(messages)
    const updateState = (current: ChatMessage): ChatMessage => ({
      ...current,
      turnContext: {
        ...current.turnContext,
        ...(type === "STATE_SNAPSHOT"
          ? { agent_state: event.snapshot }
          : {
              agent_state_delta: [
                ...(current.turnContext?.agent_state_delta ?? []),
                event.delta,
              ],
              agent_state: applyJsonPatch(previousState, event.delta),
            }),
      },
    })
    const target = messages.findLast((message) => message.role === "assistant")
    return target
      ? patchMessage(messages, target.id, updateState)
      : [
          ...messages,
          updateState({
            id: crypto.randomUUID(),
            role: "assistant",
            content: "",
            isPlaceholder: true,
            status: "streaming",
          }),
        ]
  }

  if (type === "RAW") {
    const updateRaw = (current: ChatMessage): ChatMessage => ({
      ...current,
      turnContext: {
        ...current.turnContext,
        raw_events: [...(current.turnContext?.raw_events ?? []), event.event],
      },
    })
    const target = messages.findLast((message) => message.role === "assistant")
    return target
      ? patchMessage(messages, target.id, updateRaw)
      : [
          ...messages,
          updateRaw({
            id: crypto.randomUUID(),
            role: "assistant",
            content: "",
            isPlaceholder: true,
            status: "streaming",
          }),
        ]
  }

  if (
    (type === "CUSTOM" &&
      [
        "buddy.planning",
        "buddy.subagent",
        "buddy.user_input",
        "buddy.compaction",
        "buddy.activity",
        "buddy.workspace_checkpoint",
      ].includes(String(event.name))) ||
    type === "ACTIVITY_RESOLVED"
  ) {
    const raw =
      type === "ACTIVITY_RESOLVED"
        ? {
            id: messageId,
            activityType: event.activityType,
            content: event.content,
            ...(typeof event.content === "object" && event.content
              ? event.content
              : {}),
          }
        : event.value
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return messages
    const value = raw as Record<string, unknown>
    const activity =
      type === "ACTIVITY_RESOLVED" || event.name === "buddy.activity"
    const existingActivity = activity
      ? activityOwner(messages, value)
      : undefined
    if (activity && !meaningfulActivity(value) && !existingActivity)
      return messages
    const id =
      stringField(event.parentMessageId) ||
      (typeof value.message_id === "string" ? value.message_id : messageId)
    const target =
      existingActivity ??
      messages.find((item) => item.id === id && item.role === "assistant") ??
      messages.findLast((item) => item.role === "assistant")
    const item = {
      name:
        type === "ACTIVITY_RESOLVED" ? "buddy.activity" : String(event.name),
      value,
    }
    const update = (current: ChatMessage): ChatMessage => ({
      ...current,
      turnContext: {
        ...current.turnContext,
        ...(event.name === "buddy.workspace_checkpoint"
          ? {
              checkpoint_id: value.checkpoint_id,
              checkpoint_error: value.checkpoint_error,
              checkpoint_files: value.checkpoint_files,
              checkpoint_omitted: value.checkpoint_omitted,
              checkpoint_incomplete: value.checkpoint_incomplete,
              checkpoint_checked:
                value.checkpoint_checked ?? !value.checkpoint_error,
            }
          : {}),
        lifecycle_events: mergeRichEvent(
          readRichEvents(current.turnContext?.lifecycle_events),
          item
        ),
      },
    })
    return target
      ? patchMessage(messages, target.id, update)
      : [
          ...messages,
          update({
            id: id || crypto.randomUUID(),
            role: "assistant",
            content: "",
            status: "streaming",
            isPlaceholder: true,
          }),
        ]
  }

  if (type === "TEXT_MESSAGE_START") {
    if (!messageId) return messages
    if (
      messages.some((message) =>
        message.agUiActivities?.some((activity) => activity.id === messageId)
      )
    )
      return messages
    messages = messages.map((message) =>
      message.agUiActiveTextId && message.agUiActiveTextId !== messageId
        ? { ...message, agUiActiveTextId: undefined }
        : message
    )
    if (event.role === "user")
      return upsertMessage(messages, {
        ...messages.find((message) => message.id === messageId),
        id: messageId,
        role: "user",
        content: "",
        status: "streaming",
        agUiActiveTextId: messageId,
      })
    const existing = messages.find((message) => message.id === messageId)
    if (existing)
      return patchMessage(messages, messageId, (current) => ({
        ...current,
        agUiActiveTextId: messageId,
        status: "streaming",
      }))
    const last = messages.at(-1)
    if (
      last?.role === "assistant" &&
      last.status === "streaming" &&
      (last.isPlaceholder ||
        (!last.content &&
          !last.thinking &&
          !last.tools?.length &&
          !last.attachments?.length &&
          last.pk == null))
    ) {
      return [
        ...messages.slice(0, -1),
        {
          ...last,
          id: messageId,
          agUiActiveTextId: messageId,
          parts: messageParts(last),
          isPlaceholder: false,
          timing: last.timing ?? emptyTiming(now),
        },
      ]
    }
    return upsertMessage(messages, {
      id: messageId,
      agUiActiveTextId: messageId,
      role: "assistant",
      content: "",
      parts: [],
      status: "streaming",
      timing: emptyTiming(now),
    })
  }

  if (type === "TEXT_MESSAGE_CONTENT" || type === "TEXT_MESSAGE_CHUNK") {
    if (messageId && !messages.some((message) => message.id === messageId)) {
      messages = reduceAgUiEvent(
        messages,
        { ...event, type: "TEXT_MESSAGE_START", role: "assistant" },
        now
      )
    }
    const textMessageId =
      messageId ||
      (type === "TEXT_MESSAGE_CHUNK"
        ? messages.findLast((message) => message.agUiActiveTextId)
            ?.agUiActiveTextId
        : undefined)
    if (!textMessageId) {
      return messages
    }
    messages = messages.map((message) =>
      message.agUiActiveTextId && message.agUiActiveTextId !== textMessageId
        ? { ...message, agUiActiveTextId: undefined }
        : message
    )
    return patchMessage(
      messages,
      textMessageId,
      (current) => ({
        ...current,
        agUiActiveTextId: textMessageId,
        content: `${current.content}${delta}`,
        parts: appendMessageText(current, "text", delta),
        status: "streaming",
        timing: withTextChunk(current, now, delta),
      }),
      {
        id: textMessageId,
        agUiActiveTextId: textMessageId,
        role: "assistant",
        content: delta,
        parts: [{ type: "text", text: delta }],
        status: "streaming",
        timing: withTextChunk(
          {
            id: textMessageId,
            role: "assistant",
            content: "",
            timing: emptyTiming(now),
          },
          now,
          delta
        ),
      }
    )
  }

  if (type === "TEXT_MESSAGE_END") {
    if (!messageId) {
      return messages
    }
    return patchMessage(messages, messageId, (current) =>
      completeMessageTiming(
        { ...current, agUiActiveTextId: undefined, status: "complete" },
        now
      )
    )
  }

  if (type === "REASONING_START") {
    const target = messages.findLast((message) => message.role === "assistant")
    if (!target || !messageId) return messages
    return patchMessage(messages, target.id, (current) => ({
      ...current,
      reasoningMessageIds: [
        ...new Set([...(current.reasoningMessageIds ?? []), messageId]),
      ],
      agUiReasoningSpans: {
        ...current.agUiReasoningSpans,
        [messageId]: {
          startedAt: current.agUiReasoningSpans?.[messageId]?.startedAt ?? now,
        },
      },
    }))
  }

  if (type === "REASONING_MESSAGE_START") {
    if (!messageId) return messages
    if (
      messages.some((message) =>
        message.agUiActivities?.some((activity) => activity.id === messageId)
      )
    )
      return messages
    messages = messages.map((message) =>
      message.agUiActiveReasoningId &&
      message.agUiActiveReasoningId !== messageId
        ? { ...message, agUiActiveReasoningId: undefined }
        : message
    )
    const lastAssistant =
      assistantForEvent(messages, event) ??
      messages.findLast(
        (message) =>
          message.role === "assistant" && message.status === "streaming"
      )
    const update = (current: ChatMessage): ChatMessage => ({
      ...current,
      agUiActiveReasoningId: messageId,
      reasoningMessageIds: [
        ...new Set([...(current.reasoningMessageIds ?? []), messageId]),
      ],
      thinking: current.thinking ?? "",
      parts: [
        ...messageParts(current),
        ...(current.parts?.some(
          (part) => part.type === "reasoning" && part.messageId === messageId
        )
          ? []
          : [
              {
                type: "reasoning" as const,
                messageId,
                text: "",
                timing: {
                  startedAt:
                    current.agUiReasoningSpans?.[messageId]?.startedAt ?? now,
                },
              },
            ]),
      ],
    })
    return lastAssistant
      ? patchMessage(messages, lastAssistant.id, update)
      : [
          ...messages,
          update({
            id: messageId,
            role: "assistant",
            content: "",
            isPlaceholder: true,
            status: "streaming",
          }),
        ]
  }

  if (
    type === "REASONING_MESSAGE_CONTENT" ||
    type === "REASONING_MESSAGE_CHUNK"
  ) {
    let next = messages
    const reasoningId =
      messageId ||
      messages.findLast((message) => message.agUiActiveReasoningId)
        ?.agUiActiveReasoningId
    if (!reasoningId) return messages
    next = next.map((message) =>
      message.agUiActiveReasoningId &&
      message.agUiActiveReasoningId !== reasoningId
        ? { ...message, agUiActiveReasoningId: undefined }
        : message
    )
    if (
      type === "REASONING_MESSAGE_CHUNK" &&
      !messages.some((message) =>
        message.parts?.some(
          (part) => part.type === "reasoning" && part.messageId === reasoningId
        )
      )
    ) {
      next = reduceAgUiEvent(
        next,
        { ...event, type: "REASONING_MESSAGE_START", messageId: reasoningId },
        now
      )
    }
    const lastAssistant = assistantForEvent(next, {
      ...event,
      messageId: reasoningId,
    })
    if (!lastAssistant) {
      return messages
    }
    return patchMessage(next, lastAssistant.id, (current) => ({
      ...current,
      thinking: `${current.thinking ?? ""}${delta}`,
      agUiActiveReasoningId: reasoningId,
      parts: messageParts(current).map((part) =>
        part.type === "reasoning" && part.messageId === reasoningId
          ? { ...part, text: part.text + delta }
          : part
      ),
    }))
  }

  if (type === "REASONING_MESSAGE_END" || type === "REASONING_END") {
    const reasoningId = stringField(event.messageId)
    if (!reasoningId) return messages
    return messages.map((current) => {
      const parts = current.parts ?? []
      if (!current.reasoningMessageIds?.includes(reasoningId)) return current
      const index = parts.findLastIndex(
        (part) => part.type === "reasoning" && part.messageId === reasoningId
      )
      return {
        ...current,
        agUiActiveReasoningId:
          current.agUiActiveReasoningId === reasoningId
            ? undefined
            : current.agUiActiveReasoningId,
        ...(current.agUiReasoningSpans?.[reasoningId]
          ? {
              agUiReasoningSpans: {
                ...current.agUiReasoningSpans,
                [reasoningId]: {
                  ...current.agUiReasoningSpans[reasoningId],
                  completedAt: now,
                },
              },
            }
          : {}),
        parts: parts.map((part, partIndex) =>
          partIndex === index && part.type === "reasoning" && part.timing
            ? { ...part, timing: { ...part.timing, completedAt: now } }
            : part
        ),
      }
    })
  }

  if (type === "TOOL_CALL_CHUNK") {
    const explicitId = stringField(event.toolCallId)
    const activeId = messages.findLast(
      (message) => message.agUiActiveToolId
    )?.agUiActiveToolId
    const toolCallId = explicitId || activeId
    if (!toolCallId) return messages
    let next = messages
    if (
      !messages.some((message) =>
        message.tools?.some((tool) => tool.id === toolCallId)
      )
    ) {
      next = reduceAgUiEvent(
        messages,
        {
          ...event,
          type: "TOOL_CALL_START",
          toolCallId,
          toolCallName: stringField(event.toolCallName) || "tool",
        },
        now
      )
    }
    next = next.map((message) =>
      message.tools?.some((tool) => tool.id === toolCallId)
        ? { ...message, agUiActiveToolId: toolCallId }
        : message.agUiActiveToolId
          ? { ...message, agUiActiveToolId: undefined }
          : message
    )
    const toolDelta = stringField(event.delta)
    if (!toolDelta) return next
    return patchMessage(
      next,
      next.findLast((message) =>
        message.tools?.some((tool) => tool.id === toolCallId)
      )?.id ?? "",
      (current) => ({
        ...current,
        agUiActiveToolId: toolCallId,
        tools: (current.tools ?? []).map((tool) =>
          tool.id === toolCallId
            ? { ...tool, args: `${tool.args}${toolDelta}` }
            : tool
        ),
      })
    )
  }

  if (type === "TOOL_CALL_START") {
    const toolCallId = stringField(event.toolCallId)
    const toolName = stringField(event.toolCallName) || "tool"
    const lastAssistant = assistantForEvent(messages, event)
    if (!toolCallId) return messages
    messages = messages.map((message) =>
      message.agUiActiveToolId && message.agUiActiveToolId !== toolCallId
        ? { ...message, agUiActiveToolId: undefined }
        : message
    )
    if (!lastAssistant)
      return reduceAgUiEvent(
        [
          ...messages,
          {
            id: stringField(event.parentMessageId) || crypto.randomUUID(),
            role: "assistant",
            content: "",
            status: "streaming",
            isPlaceholder: true,
          },
        ],
        event,
        now
      )
    return patchMessage(messages, lastAssistant.id, (current) => {
      if (current.tools?.some((tool) => tool.id === toolCallId))
        return { ...current, agUiActiveToolId: toolCallId }
      const timing = ensureTiming(current, now)
      return {
        ...current,
        agUiActiveToolId: toolCallId,
        parts: appendToolPart(current, toolCallId, { startedAt: now }),
        tools: [
          ...(current.tools ?? []),
          { id: toolCallId, name: toolName, args: "" },
        ],
        timing: {
          ...timing,
          toolCallCount: timing.toolCallCount + 1,
        },
      }
    })
  }

  if (type === "TOOL_CALL_END") {
    const toolCallId = stringField(event.toolCallId)
    const owner = messages.findLast((message) =>
      message.tools?.some((tool) => tool.id === toolCallId)
    )
    if (!owner || !toolCallId) return messages
    return patchMessage(messages, owner.id, (current) => ({
      ...current,
      agUiActiveToolId:
        current.agUiActiveToolId === toolCallId
          ? undefined
          : current.agUiActiveToolId,
      tools: (current.tools ?? []).map((tool) =>
        tool.id === toolCallId ? { ...tool, argsComplete: true } : tool
      ),
    }))
  }

  if (type === "TOOL_CALL_ARGS") {
    const toolCallId = stringField(event.toolCallId)
    const lastAssistant = messages.findLast((message) =>
      message.tools?.some((tool) => tool.id === toolCallId)
    )
    if (!lastAssistant || !toolCallId) {
      return messages
    }
    return patchMessage(messages, lastAssistant.id, (current) => ({
      ...current,
      tools: (current.tools ?? []).map((tool) =>
        tool.id === toolCallId
          ? { ...tool, args: `${tool.args}${delta}` }
          : tool
      ),
    }))
  }

  if (type === "TOOL_CALL_RESULT") {
    const next = messages.slice()
    attachToolResult(
      next,
      stringField(event.toolCallId),
      typeof event.content === "string"
        ? event.content
        : JSON.stringify(event.content ?? ""),
      toolResultFailed(event),
      messageId ? { resultMessageId: messageId } : {},
      now
    )
    return next
  }

  if (type === "REASONING_ENCRYPTED_VALUE" && event.subtype === "message") {
    const outcome = toolOutcome(event.encryptedValue)
    if (!outcome.status) return messages
    return messages.map((message) => ({
      ...message,
      tools: message.tools?.map((tool) =>
        tool.resultMessageId === event.entityId ? { ...tool, ...outcome } : tool
      ),
    }))
  }

  if (
    type === "CUSTOM" &&
    (event.name === "buddy.coding.approval" ||
      event.name === "buddy.coding.approval_resolved")
  ) {
    const value = event.value as Record<string, unknown> | undefined
    if (
      !value ||
      typeof value.request_id !== "string" ||
      typeof value.message_id !== "string"
    )
      return messages
    return patchMessage(messages, value.message_id, (current) => {
      let tools = [...(current.tools ?? [])]
      if (event.name === "buddy.coding.approval") {
        const tool: ChatToolCall = {
          id: String(value.call_id),
          name: String(value.name),
          args: JSON.stringify(value.arguments ?? {}),
          pendingApproval: true,
          hadApproval: true,
          approvalRequestId: value.request_id as string,
          ...approvalMetadata(value),
        }
        const index = tools.findIndex((item) => item.id === tool.id)
        if (index < 0) tools.push(tool)
        else tools[index] = { ...tools[index], ...tool }
      } else {
        tools = tools.map((tool) =>
          tool.approvalRequestId === value.request_id
            ? resolveToolApproval(tool, value.approved !== false)
            : tool
        )
      }
      return {
        ...current,
        tools,
        parts: tools.reduce(
          (parts, tool) => appendToolPart({ ...current, parts }, tool.id),
          messageParts(current)
        ),
        status: tools.some((tool) => tool.pendingApproval)
          ? "awaiting-approval"
          : "streaming",
      }
    })
  }

  if (type === "RUN_ERROR") {
    const lastAssistant = [...messages]
      .reverse()
      .find((item) => item.role === "assistant")
    if (!lastAssistant) {
      return reduceAgUiEvent(
        [
          ...messages,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: "",
            status: "streaming",
          },
        ],
        event,
        now
      )
    }
    const errorDetail = runErrorDetail(event)
    return patchMessage(messages, lastAssistant.id, (current) =>
      completeMessageTiming(
        {
          ...current,
          status: "error",
          tools: current.tools?.map((tool) => ({
            ...tool,
            pendingApproval: false,
            ...(tool.pendingApproval || tool.approvalRequestId
              ? { hadApproval: true }
              : {}),
            approvalRequestId: undefined,
          })),
          error: String(
            event.message ?? translateCurrent("common.generationFailed")
          ),
          ...(errorDetail ? { errorDetail } : {}),
        },
        now
      )
    )
  }

  if (type === "RUN_FINISHED") {
    const interrupts = interruptToolCalls(event)
    if (interrupts == null) {
      const result = event.result as { status?: string } | undefined
      const outcome = event.outcome as { type?: string } | undefined
      const lastId = messages.findLast(
        (message) => message.role === "assistant"
      )?.id
      const status =
        outcome?.type === "cancelled" || result?.status === "interrupted"
          ? "stopped"
          : result?.status && result.status !== "success"
            ? "error"
            : "complete"
      return messages.map((current) =>
        current.role === "assistant" &&
        (current.id === lastId ||
          current.status === "streaming" ||
          current.status === "awaiting-approval")
          ? completeMessageTiming(
              {
                ...current,
                status,
                tools: settleRunningTools(
                  current.tools?.map((tool) => ({
                    ...tool,
                    pendingApproval: false,
                    ...(tool.pendingApproval || tool.approvalRequestId
                      ? { hadApproval: true }
                      : {}),
                    approvalRequestId: undefined,
                    interruptId: undefined,
                  })),
                  status
                ),
              },
              now
            )
          : current
      )
    }
    const lastAssistant = [...messages]
      .reverse()
      .find((item) => item.role === "assistant")
    if (!lastAssistant) {
      return messages
    }
    const pending = new Map(
      interrupts.map((interrupt) => [interrupt.toolCallId, interrupt.id])
    )
    return messages.map((current) =>
      current.role === "assistant" &&
      (current.id === lastAssistant.id ||
        current.tools?.some((tool) => pending.has(tool.id)))
        ? completeMessageTiming(
            {
              ...current,
              status: "awaiting-approval",
              tools: (current.tools ?? []).map((tool) =>
                pending.has(tool.id)
                  ? {
                      ...tool,
                      pendingApproval: true,
                      interruptId: pending.get(tool.id),
                    }
                  : tool
              ),
            },
            now
          )
        : current
    )
  }

  if (type === "CUSTOM") {
    const target =
      assistantForEvent(messages, event) ??
      messages.findLast((message) => message.role === "assistant")
    if (target)
      return patchMessage(messages, target.id, (current) => ({
        ...current,
        turnContext: {
          ...current.turnContext,
          custom_events: [
            ...(current.turnContext?.custom_events ?? []),
            { name: event.name, value: event.value, metadata: event.metadata },
          ],
        },
      }))
  }

  return messages
}

export function applyAgUiEvent(
  messages: ChatMessage[],
  event: Record<string, unknown>,
  now = Date.now()
): ChatMessage[] {
  let subagentRunId = stringField(event.subagentRunId)
  const type = String(event.type ?? "")
  if (
    !subagentRunId &&
    type === "TOOL_CALL_RESULT" &&
    !messages.some((message) =>
      message.tools?.some((tool) => tool.id === event.toolCallId)
    )
  ) {
    subagentRunId =
      messages
        .flatMap((message) => Object.entries(message.agUiSubagents ?? {}))
        .find(([, nested]) =>
          nested.some((message) =>
            message.tools?.some((tool) => tool.id === event.toolCallId)
          )
        )?.[0] ?? ""
  }
  if (
    !subagentRunId &&
    type.endsWith("_CHUNK") &&
    !event.messageId &&
    !event.toolCallId
  ) {
    const field =
      type === "TEXT_MESSAGE_CHUNK"
        ? "agUiActiveTextId"
        : type === "TOOL_CALL_CHUNK"
          ? "agUiActiveToolId"
          : "agUiActiveReasoningId"
    if (!messages.some((message) => message[field])) {
      const scopes = [
        ...new Set(
          messages.flatMap((message) =>
            Object.entries(message.agUiSubagents ?? {})
              .filter(([, nested]) => nested.some((message) => message[field]))
              .map(([id]) => id)
          )
        ),
      ]
      if (scopes.length > 1)
        throw new Error(`Ambiguous AG-UI chunk attribution: ${type}`)
      subagentRunId = scopes[0] ?? ""
    }
  }
  if (
    subagentRunId &&
    !["STATE_SNAPSHOT", "STATE_DELTA"].includes(String(event.type)) &&
    !String(event.type).startsWith("SUBAGENT_")
  ) {
    const owner =
      messages.findLast((message) =>
        readRichEvents(message.turnContext?.lifecycle_events).some(
          (item) =>
            item.name === "buddy.subagent" &&
            item.value.task_id === subagentRunId
        )
      ) ?? messages.findLast((message) => message.role === "assistant")
    if (!owner)
      return applyAgUiEvent(
        [
          ...messages,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: "",
            isPlaceholder: true,
            status: "streaming",
          },
        ],
        event,
        now
      )
    const nestedEvent = { ...event }
    delete nestedEvent.subagentRunId
    const nested = applyAgUiEvent(
      owner.agUiSubagents?.[subagentRunId] ?? [],
      nestedEvent,
      now
    )
    const toolCalls = nested.flatMap((message) =>
      (message.tools ?? []).map((tool) => ({
        id: tool.id,
        name: tool.name,
        input: tool.args,
        output: tool.result,
        status: tool.isError
          ? "failed"
          : tool.result != null
            ? "completed"
            : "running",
      }))
    )
    const updated = patchMessage(messages, owner.id, (current) => ({
      ...current,
      agUiSubagents: { ...current.agUiSubagents, [subagentRunId]: nested },
    }))
    return attachRichEvent(
      updated,
      {
        name: "buddy.subagent",
        value: {
          task_id: subagentRunId,
          output: nested.map((message) => message.content).join("\n"),
          tool_calls: toolCalls,
        },
      },
      owner.id
    )
  }
  const active = messages.findLast(
    (message) =>
      message.workTiming?.status === "running" ||
      message.workTiming?.status === "awaiting-approval"
  )?.workTiming
  let next = reduceAgUiEvent(messages, event, now)
  if (type === "SUBAGENT_FINISHED" || type === "SUBAGENT_ERROR") {
    next = next.map((message) =>
      message.agUiSubagents?.[subagentRunId]
        ? {
            ...message,
            agUiSubagents: {
              ...message.agUiSubagents,
              [subagentRunId]: settleStreamingMessages(
                message.agUiSubagents[subagentRunId]!,
                type === "SUBAGENT_ERROR"
                  ? event.code === "cancelled"
                    ? "stopped"
                    : "error"
                  : "complete",
                now
              ),
            },
          }
        : message
    )
  }
  if (type === "RUN_ERROR" || type === "RUN_FINISHED") {
    const usage = Array.isArray(event.usage)
      ? (event.usage as import("@ag-ui/core").TokenUsage[])
      : []
    const lastAssistantId = next.findLast(
      (message) => message.role === "assistant"
    )?.id
    next = next.map((message) => {
      if (
        message.role !== "assistant" ||
        (message.id !== lastAssistantId &&
          message.status !== "streaming" &&
          !message.agUiActiveTextId &&
          !message.agUiActiveToolId &&
          !message.agUiActiveReasoningId &&
          message.workTiming?.status !== "running")
      )
        return message
      const status =
        type === "RUN_ERROR"
          ? "error"
          : message.status === "awaiting-approval"
            ? "awaiting-approval"
            : message.status === "stopped"
              ? "stopped"
              : "complete"
      return {
        ...message,
        agUiActiveTextId: undefined,
        agUiActiveToolId: undefined,
        agUiActiveReasoningId: undefined,
        parts: message.parts?.map((part) =>
          part.type === "reasoning" &&
          part.timing &&
          part.timing.completedAt === undefined
            ? { ...part, timing: { ...part.timing, completedAt: now } }
            : part
        ),
        tools: message.tools?.map((tool) =>
          tool.result == null && !tool.pendingApproval
            ? { ...tool, status: status === "error" ? "error" : "stopped" }
            : tool
        ),
        ...(message.id === lastAssistantId && usage.length
          ? {
              usage: {
                inputTokens: usage.reduce(
                  (sum, item) => sum + (item.inputTokens ?? 0),
                  0
                ),
                outputTokens: usage.reduce(
                  (sum, item) => sum + (item.outputTokens ?? 0),
                  0
                ),
                totalTokens: usage.reduce(
                  (sum, item) =>
                    sum +
                    (item.totalTokens ??
                      (item.inputTokens ?? 0) + (item.outputTokens ?? 0)),
                  0
                ),
                reasoningTokens: usage.reduce(
                  (sum, item) => sum + (item.reasoningTokens ?? 0),
                  0
                ),
                cacheReadTokens: usage.reduce(
                  (sum, item) => sum + (item.cachedInputTokens ?? 0),
                  0
                ),
              },
            }
          : {}),
        ...(status === "error" || status === "stopped"
          ? {
              turnContext: {
                ...message.turnContext,
                lifecycle_events: readRichEvents(
                  message.turnContext?.lifecycle_events
                ).map((item) =>
                  ["running", "queued"].includes(lifecycleStatus(item)) &&
                  !item.value.persistent
                    ? {
                        ...item,
                        value: {
                          ...item.value,
                          outcome: status === "error" ? "failed" : "cancelled",
                          status: status === "error" ? "failed" : "cancelled",
                        },
                      }
                    : item
                ),
              },
            }
          : {}),
      }
    })
  }
  if (
    type === "TEXT_MESSAGE_START" ||
    type === "TEXT_MESSAGE_CONTENT" ||
    type === "TEXT_MESSAGE_CHUNK"
  ) {
    const id = stringField(event.messageId)
    next = next.map((message) =>
      message.id === id && message.role === "assistant" && !message.workTiming
        ? {
            ...message,
            workTiming:
              active ?? startWorkTiming(stringField(event.runId) || id, now),
          }
        : message
    )
  }
  const last = next.findLast((message) => message.role === "assistant")
  const runId = last?.workTiming?.runId ?? active?.runId
  if (type === "RUN_ERROR")
    return settleMessageWork(
      settleStreamingMessages(next, "error", now, stringField(event.message)),
      "error",
      now,
      runId
    )
  if (type === "RUN_FINISHED") {
    const status =
      last?.status === "awaiting-approval"
        ? "awaiting-approval"
        : last?.status === "stopped"
          ? "stopped"
          : last?.status === "error"
            ? "error"
            : "complete"
    return settleMessageWork(next, status, now, runId)
  }
  if (
    type === "CUSTOM" &&
    (event.name === "buddy.coding.approval" ||
      event.name === "buddy.coding.approval_resolved")
  ) {
    const value = event.value as { message_id?: string } | undefined
    const owner = next.find((message) => message.id === value?.message_id)
    if (owner?.workTiming) {
      const status =
        owner.status === "awaiting-approval" ? "awaiting-approval" : "running"
      next = next.map((message) =>
        message.workTiming?.runId === owner.workTiming?.runId
          ? {
              ...message,
              workTiming: settleWorkTiming(message.workTiming!, status, now),
            }
          : message
      )
    }
  }
  return next
}

function snapshotMessageType(message: SnapshotMessage): string {
  return String(message.message_type ?? message.messageType ?? "").toLowerCase()
}

function snapshotAssistantStatus(
  suspended: boolean,
  failed: boolean,
  stopped: boolean
): "complete" | "error" | "stopped" | "awaiting-approval" {
  if (failed) {
    return "error"
  }
  if (suspended) {
    return "awaiting-approval"
  }
  if (stopped) {
    return "stopped"
  }
  return "complete"
}

function isSuspendedSnapshot(message: SnapshotMessage): boolean {
  return snapshotMessageType(message) === "suspended"
}

function isStoppedSnapshot(message: SnapshotMessage): boolean {
  const type = snapshotMessageType(message)
  return type === "interrupted" || type === "incomplete"
}

function snapshotErrorText(message: SnapshotMessage): string | undefined {
  return typeof message.error === "string" && message.error.trim()
    ? message.error
    : undefined
}

function snapshotErrorDetail(
  message: SnapshotMessage
): Record<string, unknown> | undefined {
  const detail = message.error_detail ?? message.errorDetail
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) {
    return undefined
  }
  return detail
}

function isErrorSnapshot(message: SnapshotMessage): boolean {
  return (
    snapshotMessageType(message) === "error" ||
    snapshotErrorText(message) != null
  )
}

function runErrorDetail(
  event: Record<string, unknown>
): Record<string, unknown> | undefined {
  const detail: Record<string, unknown> = {}
  for (const key of [
    "status",
    "status_code",
    "reset_at",
    "resetAt",
    "resets_at",
    "resetsAt",
    "quota_reset_at",
    "retry_after",
    "retryAfter",
    "headers",
  ])
    if (event[key] != null) detail[key] = event[key]
  if (event.code != null && event.code !== "") {
    detail.code = event.code
  }
  const nested =
    event.payload ?? event.detail ?? event.error_detail ?? event.errorDetail
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    Object.assign(detail, nested as Record<string, unknown>)
  }
  return Object.keys(detail).length > 0 ? detail : undefined
}

function interruptToolCalls(
  event: Record<string, unknown>
): Array<{ id: string; toolCallId: string }> | null {
  const outcome = event.outcome
  if (!outcome || typeof outcome !== "object" || Array.isArray(outcome)) {
    return null
  }
  if ((outcome as { type?: unknown }).type !== "interrupt") return null
  const interrupts = (outcome as { interrupts?: unknown }).interrupts
  if (!Array.isArray(interrupts) || interrupts.length === 0) {
    return null
  }
  const ids: Array<{ id: string; toolCallId: string }> = []
  for (const item of interrupts) {
    if (!item || typeof item !== "object") {
      continue
    }
    const record = item as Record<string, unknown>
    if (
      typeof record.id === "string" &&
      record.id &&
      typeof record.toolCallId === "string" &&
      record.toolCallId
    ) {
      ids.push({ id: record.id, toolCallId: record.toolCallId })
    }
  }
  return ids
}
