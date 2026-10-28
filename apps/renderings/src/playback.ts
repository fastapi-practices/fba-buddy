import { applyAgUiEvent } from "@/features/chat/message-events"
import { messageParts } from "@/features/chat/message-parts"
import {
  readRichEvents,
  lifecycleStatus,
  type RichEvent,
} from "@/features/chat/rich-events"
import {
  messageWorkStatus,
  settleWorkTiming,
} from "@/features/chat/work-timing"
import { resolveToolApproval } from "@/features/chat/tool-approvals"
import { settleRunningTools } from "@/features/chat/message-events"
import type { ChatMessage, ChatToolCall } from "@/lib/types"
import { runFinished, runStarted, type RenderingScene } from "./fixtures"

const THREAD_ID = "rendering-stream"

type PlaybackEvent =
  | { kind: "append"; message: ChatMessage }
  | { kind: "event"; event: Record<string, unknown> }
  | { kind: "wait" }
  | { kind: "finalize"; message: ChatMessage }

export type PlaybackStep = PlaybackEvent & {
  delay: number
  waitForInput?: string
  waitForApproval?: string
}

export const DEFAULT_TOKENS_PER_SECOND = 100
const tokenDelay = 1000 / DEFAULT_TOKENS_PER_SECOND
const structuralDelay = 8
const messageDelay = 40

/** 按目标速度整体缩放每一步的等待时间 */
function scalePlayback(steps: PlaybackStep[], tokensPerSecond: number) {
  const speed = Math.max(1, Math.round(tokensPerSecond))
  if (speed === DEFAULT_TOKENS_PER_SECOND) return steps
  const factor = DEFAULT_TOKENS_PER_SECOND / speed
  return steps.map((step) => ({ ...step, delay: step.delay * factor }))
}

// 按近似 token 切分，让所有场景共用 100 token/s 的模拟输出速度
function tokenizeText(text: string) {
  const segments =
    text.match(
      /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]|[\p{L}\p{N}_]+|\s+|[^\s]/gu
    ) ?? []
  return segments.flatMap((segment) => {
    if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(segment))
      return [segment]
    if (/^[\p{L}\p{N}_]+$/u.test(segment) || /^\s+$/u.test(segment))
      return segment.match(/.{1,4}/gsu) ?? [segment]
    return [segment]
  })
}

function eventDelay(event: Record<string, unknown>) {
  const delta = event.delta
  if (typeof delta !== "string") return structuralDelay
  return Math.max(tokenDelay, tokenizeText(delta).length * tokenDelay)
}

function eventStep(
  event: Record<string, unknown>,
  delay = eventDelay(event)
): PlaybackStep {
  return { kind: "event", event, delay }
}

function pendingInputRequestId(event: Record<string, unknown>) {
  if (event.type !== "CUSTOM" || event.name !== "buddy.user_input") return
  const value = event.value
  if (!value || typeof value !== "object" || Array.isArray(value)) return
  const request = value as Record<string, unknown>
  return request.status === "pending" && typeof request.request_id === "string"
    ? request.request_id
    : undefined
}

export function buildEventPlayback(
  events: Record<string, unknown>[],
  tokensPerSecond = DEFAULT_TOKENS_PER_SECOND
): PlaybackStep[] {
  return scalePlayback(
    events.map((event) => eventStep(event)),
    tokensPerSecond
  )
}

// 用户自己发出的消息同样要按真实速度流式回复，结束后才有完整的动作栏
export function buildReplyPlayback(
  messageId: string,
  text: string,
  tokensPerSecond = DEFAULT_TOKENS_PER_SECOND
): PlaybackStep[] {
  const events = [
    {
      type: "TEXT_MESSAGE_START",
      messageId,
      role: "assistant",
    },
    ...tokenizeText(text).map((delta) => ({
      type: "TEXT_MESSAGE_CONTENT",
      messageId,
      delta,
    })),
    {
      type: "TEXT_MESSAGE_END",
      messageId,
    },
    runFinished(),
  ]
  return buildEventPlayback(events, tokensPerSecond)
}

type ApprovalRequest = {
  messageId: string
  requestId: string
  toolCallId: string
}

export function playbackApprovalRequest(
  step: PlaybackStep
): ApprovalRequest | undefined {
  if (
    step.kind !== "event" ||
    step.event.name !== "buddy.coding.approval" ||
    !step.waitForApproval
  )
    return undefined
  const value = step.event.value
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined
  const request = value as Record<string, unknown>
  if (
    typeof request.message_id !== "string" ||
    typeof request.request_id !== "string" ||
    typeof request.call_id !== "string"
  )
    return undefined
  return {
    messageId: request.message_id,
    requestId: request.request_id,
    toolCallId: request.call_id,
  }
}

function approvalTurnEnd(
  playback: PlaybackStep[],
  approvalIndex: number,
  messageId: string
) {
  const finalizeIndex = playback.findIndex(
    (step, index) =>
      index > approvalIndex &&
      step.kind === "finalize" &&
      step.message.id === messageId
  )
  if (finalizeIndex >= 0) return finalizeIndex
  const nextTurnIndex = playback.findIndex(
    (step, index) =>
      index > approvalIndex &&
      (step.kind === "append" ||
        (step.kind === "event" &&
          step.event.type === "TEXT_MESSAGE_START" &&
          step.event.messageId !== messageId))
  )
  return nextTurnIndex >= 0 ? nextTurnIndex : playback.length
}

export function respondToPlaybackApproval(input: {
  messages: ChatMessage[]
  playback: PlaybackStep[]
  approvalIndex: number
  approved: boolean
  always?: boolean
  optionId?: string
}): { messages: ChatMessage[]; cursor: number; playing: boolean } {
  const step = input.playback[input.approvalIndex]
  const request = step ? playbackApprovalRequest(step) : undefined
  if (!step || !request || request.requestId !== step.waitForApproval)
    return {
      messages: input.messages,
      cursor: input.approvalIndex,
      playing: false,
    }

  const resolved = applyPlaybackStep(input.messages, {
    kind: "event",
    event: {
      type: "CUSTOM",
      name: "buddy.coding.approval_resolved",
      parentMessageId: request.messageId,
      value: {
        message_id: request.messageId,
        request_id: request.requestId,
        call_id: request.toolCallId,
        approved: input.approved,
        ...(input.always ? { always: true } : {}),
        ...(input.optionId ? { option_id: input.optionId } : {}),
      },
    },
    delay: 0,
  })
  if (input.approved)
    return {
      messages: resolved,
      cursor: input.approvalIndex + 1,
      playing: true,
    }

  return {
    messages: applyPlaybackStep(resolved, {
      kind: "event",
      event: {
        type: "RUN_FINISHED",
        result: { status: "success" },
        outcome: { type: "success" },
      },
      delay: 0,
    }),
    cursor: approvalTurnEnd(
      input.playback,
      input.approvalIndex,
      request.messageId
    ),
    playing: false,
  }
}

function contentSteps(
  type: "TEXT_MESSAGE_CONTENT" | "REASONING_MESSAGE_CONTENT",
  messageId: string,
  content: string,
  parentMessageId: string
) {
  return tokenizeText(content).map((delta) =>
    eventStep(
      {
        type,
        parentMessageId,
        messageId,
        delta,
      },
      tokenDelay
    )
  )
}

function toolSteps(message: ChatMessage, tool: ChatToolCall) {
  const steps: PlaybackStep[] = [
    eventStep({
      type: "TOOL_CALL_START",
      parentMessageId: message.id,
      toolCallId: tool.id,
      toolCallName: tool.name,
    }),
  ]
  for (const delta of tokenizeText(tool.args))
    steps.push(
      eventStep(
        {
          type: "TOOL_CALL_ARGS",
          parentMessageId: message.id,
          toolCallId: tool.id,
          delta,
        },
        tokenDelay
      )
    )
  steps.push(
    eventStep({
      type: "TOOL_CALL_END",
      parentMessageId: message.id,
      toolCallId: tool.id,
    })
  )
  if (tool.pendingApproval && tool.approvalRequestId) {
    steps.push({
      ...eventStep({
        type: "CUSTOM",
        name: "buddy.coding.approval",
        parentMessageId: message.id,
        value: {
          message_id: message.id,
          request_id: tool.approvalRequestId,
          call_id: tool.id,
          name: tool.name,
          arguments: parseToolArguments(tool.args),
          ...(tool.approvalOptions ? { options: tool.approvalOptions } : {}),
          ...(tool.approvalWarning ? { warning: tool.approvalWarning } : {}),
          ...(tool.approvalUnavailableReason
            ? { unavailable_reason: tool.approvalUnavailableReason }
            : {}),
        },
      }),
      waitForApproval: tool.approvalRequestId,
    })
  }
  if (tool.result !== undefined) {
    steps.push(
      eventStep(
        {
          type: "TOOL_CALL_RESULT",
          parentMessageId: message.id,
          toolCallId: tool.id,
          messageId: `${tool.id}-result`,
          content: tool.result,
          isError: tool.isError === true || tool.status === "error",
        },
        tool.pendingApproval ? 800 : 24
      )
    )
    if (tool.pendingApproval) steps.push({ kind: "wait", delay: 600 })
  }
  return steps
}

function parseToolArguments(args: string): unknown {
  try {
    return JSON.parse(args)
  } catch {
    return args
  }
}

function isCompactionEvent(event: RichEvent) {
  return (
    event.name === "buddy.compaction" ||
    event.value.activityType === "pydantic_ai_compaction"
  )
}

function lifecycleSteps(
  message: ChatMessage,
  accept: (event: RichEvent) => boolean
) {
  const steps: PlaybackStep[] = []
  for (const event of readRichEvents(message.turnContext?.lifecycle_events)) {
    if (!accept(event)) continue
    const status = lifecycleStatus(event)
    if (
      event.name === "buddy.subagent" &&
      !["running", "queued", "unknown"].includes(status)
    ) {
      const runningValue: Record<string, unknown> = {
        ...event.value,
        status: "running",
      }
      delete runningValue.output
      delete runningValue.summary
      delete runningValue.content
      delete runningValue.duration_seconds
      delete runningValue.finished_at
      steps.push(
        eventStep(
          {
            type: "CUSTOM",
            name: event.name,
            parentMessageId: message.id,
            value: runningValue,
          },
          24
        )
      )
      steps.push(
        eventStep(
          {
            type: "CUSTOM",
            name: event.name,
            parentMessageId: message.id,
            value: event.value,
          },
          48
        )
      )
      continue
    }
    if (event.name === "buddy.compaction" && status !== "running") {
      steps.push(
        eventStep(
          {
            type: "CUSTOM",
            name: event.name,
            parentMessageId: message.id,
            value: {
              id: event.value.id,
              status: "running",
            },
          },
          24
        )
      )
      steps.push(
        eventStep(
          {
            type: "CUSTOM",
            name: event.name,
            parentMessageId: message.id,
            value: event.value,
          },
          // 压缩本身要跑一会儿，运行态要看得见
          1200
        )
      )
      continue
    }
    steps.push(
      eventStep(
        {
          type: "CUSTOM",
          name: event.name,
          parentMessageId: message.id,
          value: event.value,
        },
        16
      )
    )
  }
  return steps
}

function assistantSteps(message: ChatMessage) {
  const steps: PlaybackStep[] = [
    eventStep(runStarted(), 16),
    eventStep(
      {
        type: "TEXT_MESSAGE_START",
        messageId: message.id,
        role: "assistant",
      },
      16
    ),
  ]
  const parts = messageParts(message)
  for (const [index, part] of parts.entries()) {
    if (part.type === "reasoning" && part.text) {
      const reasoningId = `${message.id}-reasoning-${index}`
      steps.push(
        eventStep(
          {
            type: "REASONING_MESSAGE_START",
            parentMessageId: message.id,
            messageId: reasoningId,
          },
          16
        )
      )
      steps.push(
        ...contentSteps(
          "REASONING_MESSAGE_CONTENT",
          reasoningId,
          part.text,
          message.id
        )
      )
      steps.push(
        eventStep(
          {
            type: "REASONING_MESSAGE_END",
            parentMessageId: message.id,
            messageId: reasoningId,
          },
          16
        )
      )
    }
  }
  // 上下文压缩发生在这一轮开工之前，要排在思考与工具调用前面
  steps.push(...lifecycleSteps(message, isCompactionEvent))
  for (const part of parts) {
    if (part.type !== "tool-call") continue
    const tool = message.tools?.find((item) => item.id === part.toolCallId)
    if (tool) steps.push(...toolSteps(message, tool))
  }
  steps.push(...lifecycleSteps(message, (event) => !isCompactionEvent(event)))
  if (message.sources?.length)
    steps.push(
      eventStep(
        {
          type: "CUSTOM",
          name: "buddy.citations",
          parentMessageId: message.id,
          value: { message_id: message.id, sources: message.sources },
        },
        24
      )
    )
  for (const part of parts) {
    if (part.type !== "text" || !part.text) continue
    steps.push(
      ...contentSteps("TEXT_MESSAGE_CONTENT", message.id, part.text, message.id)
    )
  }
  if (!parts.some((part) => part.type === "text" && part.text))
    for (const delta of tokenizeText(message.content))
      steps.push(
        eventStep(
          {
            type: "TEXT_MESSAGE_CONTENT",
            parentMessageId: message.id,
            messageId: message.id,
            delta,
          },
          tokenDelay
        )
      )
  steps.push(
    eventStep(
      {
        type: "TEXT_MESSAGE_END",
        parentMessageId: message.id,
        messageId: message.id,
      },
      16
    )
  )
  steps.push(eventStep(runFinished(), 16))
  const finalized = structuredClone(message)
  if (
    finalized.tools?.some(
      (tool) => tool.pendingApproval || tool.approvalRequestId
    )
  ) {
    finalized.tools = finalized.tools.map((tool) =>
      tool.pendingApproval || tool.approvalRequestId
        ? resolveToolApproval(tool, true)
        : tool
    )
    finalized.status = "complete"
  }
  steps.push({ kind: "finalize", message: finalized, delay: 0 })
  return steps
}

export function buildScenePlayback(
  scene: RenderingScene,
  tokensPerSecond = DEFAULT_TOKENS_PER_SECOND
): PlaybackStep[] {
  const steps: PlaybackStep[] = []
  if (scene.streamEvents?.length) {
    for (const message of scene.messages)
      if (message.role === "user")
        steps.push({
          kind: "append",
          message: structuredClone(message),
          delay: messageDelay,
        })
    for (const event of scene.streamEvents) {
      const step = eventStep(event)
      const waitForInput = pendingInputRequestId(event)
      steps.push(waitForInput ? { ...step, waitForInput } : step)
    }
    return scalePlayback(steps, tokensPerSecond)
  }
  for (const message of scene.messages) {
    if (message.role === "user") {
      steps.push({
        kind: "append",
        message: structuredClone(message),
        delay: messageDelay,
      })
    } else {
      steps.push(...assistantSteps(message))
    }
  }
  return scalePlayback(steps, tokensPerSecond)
}

export function seedPlayback(playback: PlaybackStep[]) {
  let messages: ChatMessage[] = []
  let cursor = 0
  while (playback[cursor]?.kind === "append") {
    messages = applyPlaybackStep(messages, playback[cursor]!)
    cursor += 1
  }
  return { messages, cursor }
}

// 真实客户端的回合结束后，服务端会把这一轮的消息落库并回传持久化 id，
// 重新生成、分支、删除这些动作都依赖它
let persistedPk = 90000

function persistMessages(messages: ChatMessage[]): ChatMessage[] {
  let changed = false
  const next = messages.map((message) => {
    if (message.pk != null) return message
    changed = true
    return { ...message, pk: ++persistedPk }
  })
  return changed ? next : messages
}

export function applyPlaybackStep(
  messages: ChatMessage[],
  step: PlaybackStep
): ChatMessage[] {
  if (step.kind === "wait") return messages
  if (step.kind === "append") {
    if (messages.some((message) => message.id === step.message.id))
      return messages
    return [...messages, structuredClone(step.message)]
  }
  if (step.kind === "event") {
    const next = applyAgUiEvent(
      messages,
      {
        threadId: THREAD_ID,
        runId: "rendering-preview-run",
        ...step.event,
      },
      Date.now()
    )
    return step.event.type === "RUN_FINISHED"
      ? persistMessages(next)
      : next
  }
  const next = messages.slice()
  const index = next.findIndex((message) => message.id === step.message.id)
  const live = index >= 0 ? next[index] : undefined
  const finalized = structuredClone(step.message)
  // 回放结束时仍在执行的工具要落到终态，不能一直显示执行中
  finalized.tools = settleRunningTools(finalized.tools, "complete")
  if (live?.timing) finalized.timing = { ...live.timing, ...finalized.timing }
  const workTiming = live?.workTiming ?? finalized.workTiming
  if (workTiming) {
    finalized.workTiming =
      workTiming.status === "running" ||
      workTiming.status === "awaiting-approval"
        ? settleWorkTiming(workTiming, messageWorkStatus(finalized), Date.now())
        : workTiming
  }
  if (index < 0) next.push(finalized)
  else next[index] = finalized
  return next
}

export type ReplayPlan = {
  /** 重放之前保留的历史 */
  base: ChatMessage[]
  /** 需要重新播放的步骤 */
  steps: PlaybackStep[]
}

/** 重放到某一步之后的完整状态 */
function stateAt(playback: PlaybackStep[], end: number): ChatMessage[] {
  let messages: ChatMessage[] = []
  for (let index = 0; index <= end && index < playback.length; index++) {
    messages = applyPlaybackStep(messages, playback[index]!)
  }
  return messages
}

function findStepByPk(playback: PlaybackStep[], pk: number): number {
  for (let index = 0; index < playback.length; index++) {
    const step = playback[index]!
    if (step.kind === "append" && step.message.pk === pk) return index
    if (step.kind === "finalize" && step.message.pk === pk) return index
  }
  return -1
}

/** 一轮从最近的一条用户提问开始，到下一条用户提问之前结束 */
function findTurn(
  playback: PlaybackStep[],
  index: number
): { start: number; end: number } | null {
  let start = -1
  for (let cursor = index; cursor >= 0; cursor--) {
    const step = playback[cursor]!
    if (step.kind === "append" && step.message.role === "user") {
      start = cursor
      break
    }
  }
  if (start < 0) return null
  let end = playback.length
  for (let cursor = index + 1; cursor < playback.length; cursor++) {
    const step = playback[cursor]!
    if (step.kind === "append" && step.message.role === "user") {
      end = cursor
      break
    }
  }
  return { start, end }
}

/**
 * 真实客户端的重新生成：
 * 当前回合原地重生成，历史回复先分叉出新分支再重生成，
 * 两种情况都只保留到那条提问为止的历史，然后重新跑这一轮
 */
export function planRegenerate(
  playback: PlaybackStep[],
  pk: number,
  options: { question?: string } = {}
): ReplayPlan | null {
  const index = findStepByPk(playback, pk)
  if (index < 0) return null
  const turn = findTurn(playback, index)
  if (!turn) return null
  const base = stateAt(playback, turn.start)
  const question = options.question?.trim()
  if (question) {
    const target = base.findLast((message) => message.role === "user")
    if (target) target.content = question
  }
  return { base, steps: playback.slice(turn.start + 1, turn.end) }
}

/** 从这条消息分叉出新分支，分支里保留到这条消息为止的历史 */
export function planFork(playback: PlaybackStep[], pk: number): ReplayPlan | null {
  const index = findStepByPk(playback, pk)
  if (index < 0) return null
  const step = playback[index]!
  if (step.kind === "append") return { base: stateAt(playback, index), steps: [] }
  const turn = findTurn(playback, index)
  if (!turn) return null
  return { base: stateAt(playback, Math.max(turn.start, turn.end - 1)), steps: [] }
}
