import type { ThreadMessage } from "@/features/chat/thread-types"
import {
  isActiveSubagentEvent,
  isPersistentToolResult,
  lifecycleEventKey,
  mergeLifecycleEvent,
  readRichEvents,
  type RichEvent,
} from "./rich-events"

export type TranscriptTurn = {
  id: string
  renderKey: string
  user?: string
  assistants: string[]
  final?: string
  running: boolean
  attention: boolean
  pending: boolean
  attempts?: { id: string; messages: string[]; number?: number }[]
  persistent?: string[]
  background?: boolean
  lifecycleEvents?: Record<string, RichEvent[]>
  persistentTools?: Record<string, string[]>
}

function collectTurnLifecycle(
  turn: TranscriptTurn,
  messages: ReadonlyMap<string, ThreadMessage>
) {
  const latestEvents = new Map<
    string,
    { messageId: string; event: RichEvent }
  >()
  const latestTools = new Map<
    string,
    { messageId: string; toolCallId: string; result: unknown }
  >()
  for (const messageId of turn.assistants) {
    const message = messages.get(messageId)!
    const attempt = message.metadata?.custom?.attempt as
      { status?: string } | undefined
    if (attempt?.status === "superseded") continue
    const context = message.metadata?.custom?.turnContext as
      Record<string, unknown> | undefined
    readRichEvents(context?.lifecycle_events).forEach((event, index) => {
      if (
        !["buddy.subagent", "buddy.activity", "buddy.compaction"].includes(
          event.name
        )
      )
        return
      const key = lifecycleEventKey(event, `${messageId}:${index}`)
      const merged = mergeLifecycleEvent(latestEvents.get(key)?.event, event)
      latestEvents.delete(key)
      latestEvents.set(key, { messageId, event: merged })
    })
    message.content.forEach((part, index) => {
      if (part.type !== "tool-call") return
      latestTools.set(part.toolCallId || `${messageId}:${index}`, {
        messageId,
        toolCallId: part.toolCallId,
        result: part.result,
      })
    })
  }
  const persistent = new Set<string>()
  for (const { messageId, event } of latestEvents.values()) {
    turn.lifecycleEvents ??= {}
    ;(turn.lifecycleEvents[messageId] ??= []).push(event)
    if (isActiveSubagentEvent(event)) turn.background = true
  }
  // 生命周期事件只由执行过程承载，不能把消息提升到过程外重复渲染
  for (const { messageId, toolCallId, result } of latestTools.values()) {
    if (!isPersistentToolResult(result)) continue
    persistent.add(messageId)
    turn.persistentTools ??= {}
    ;(turn.persistentTools[messageId] ??= []).push(toolCallId)
  }
  if (persistent.size)
    turn.persistent = turn.assistants.filter((id) => persistent.has(id))
}

export function transcriptTurns(
  messages: readonly ThreadMessage[],
  previous: readonly TranscriptTurn[] = []
): TranscriptTurn[] {
  const turns: TranscriptTurn[] = []
  for (const message of messages) {
    if (message.role === "user") {
      turns.push({
        id: message.id,
        renderKey: message.id,
        user: message.id,
        assistants: [],
        running: false,
        attention: false,
        pending: false,
      })
      continue
    }
    if (message.role !== "assistant") continue
    let turn = turns.at(-1)
    if (!turn) {
      turn = {
        id: message.id,
        renderKey: message.id,
        assistants: [],
        running: false,
        attention: false,
        pending: false,
      }
      turns.push(turn)
    }
    turn.assistants.push(message.id)
    const attempt = message.metadata?.custom?.attempt as
      { id?: string; status?: string; number?: number } | undefined
    const superseded = attempt?.status === "superseded"
    if (superseded && attempt?.id) {
      turn.attempts ??= []
      let group = turn.attempts.find((item) => item.id === attempt!.id)
      if (!group) {
        group = { id: attempt!.id!, messages: [] }
        turn.attempts.push(group)
      }
      group.messages.push(message.id)
      if (typeof attempt.number === "number") group.number = attempt.number
    }
    if (!superseded) {
      const timing = message.metadata?.custom?.workTiming as
        { status?: string } | undefined
      turn.running ||=
        message.status?.type === "running" || timing?.status === "running"
      turn.pending ||= message.status?.type === "requires-action"
      turn.attention ||=
        message.status?.type === "requires-action" ||
        message.status?.type === "incomplete" ||
        message.content.some(
          (part) => part.type === "tool-call" && part.isError === true
        )
    }
    if (
      !superseded &&
      message.content.some(
        (part) =>
          (part.type === "text" && part.text.trim()) ||
          part.type === "image" ||
          part.type === "file"
      )
    )
      turn.final = message.id
  }
  const messagesById = new Map(messages.map((message) => [message.id, message]))
  turns.forEach((turn) => collectTurnLifecycle(turn, messagesById))
  const previousKeys = new Map<string, string>()
  previous.forEach((turn) => {
    if (turn.user) previousKeys.set(turn.user, turn.renderKey)
    turn.assistants.forEach((id) => previousKeys.set(id, turn.renderKey))
  })
  const used = new Set<string>()
  for (const turn of turns) {
    const matching = [turn.user, ...turn.assistants]
      .map((id) => (id ? previousKeys.get(id) : undefined))
      .find((key) => key !== undefined && !used.has(key))
    if (matching) turn.renderKey = matching
    used.add(turn.renderKey)
  }
  return turns
}

/** 回复 actions 只在回合真正结束后出现，后台任务还在跑也不算结束 */
export function replyActionsVisible(turn: {
  running?: boolean
  background?: boolean
}): boolean {
  return !turn.running && !turn.background
}

export function textMatches(
  text: string,
  query: string
): { start: number; end: number }[] {
  if (!query.trim()) return []
  const pattern = new RegExp(
    query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    "giu"
  )
  return Array.from(text.matchAll(pattern), (match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }))
}

export function tableRowsToCsv(rows: readonly (readonly string[])[]) {
  return rows
    .map((row) =>
      row
        .map((cell) =>
          /[",\r\n]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell
        )
        .join(",")
    )
    .join("\r\n")
}

export function parseDelimitedText(text: string, delimiter = ","): string[][] {
  const rows: string[][] = []
  let row: string[] = [],
    value = "",
    quoted = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        value += '"'
        i++
      } else if (quoted || !value) quoted = !quoted
      else value += char
    } else if (
      !quoted &&
      (char === delimiter || char === "\n" || char === "\r")
    ) {
      row.push(value)
      value = ""
      if (char !== delimiter) {
        rows.push(row)
        row = []
        if (char === "\r" && text[i + 1] === "\n") i++
      }
    } else value += char
  }
  if (value || row.length) {
    row.push(value)
    rows.push(row)
  }
  return rows
}
