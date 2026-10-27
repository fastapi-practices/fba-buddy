import type {
  ChatMessage,
  ChatMessageTiming,
  ChatWorkTiming,
} from "@/lib/types"
import { messageWorkStatus } from "./work-timing"

type StoredWork = {
  workTiming: ChatWorkTiming
  timing?: ChatMessageTiming
  contentHash: string
}
type ConversationWork = Record<string, StoredWork>
type WorkStorage = Pick<Storage, "getItem" | "setItem">
const statuses = new Set([
  "running",
  "awaiting-approval",
  "complete",
  "stopped",
  "error",
])

function fingerprint(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index++)
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619)
  return `${value.length}-${(hash >>> 0).toString(36)}`
}

function turnKeys(messages: ChatMessage[]) {
  const occurrences = new Map<string, number>()
  let key = "root"
  return messages.map((message) => {
    if (message.role === "user") {
      const hash = fingerprint(
        message.content +
          (message.attachments ?? [])
            .map((attachment) => `${attachment.name}:${attachment.size}`)
            .join("|")
      )
      const count = (occurrences.get(hash) ?? 0) + 1
      occurrences.set(hash, count)
      key = `${hash}:${count}`
    }
    return `turn:${key}`
  })
}

function validEntry(value: unknown): value is StoredWork {
  if (!value || typeof value !== "object") return false
  const entry = value as StoredWork
  const timing = entry.workTiming
  if (
    !timing ||
    typeof timing.runId !== "string" ||
    !statuses.has(timing.status)
  )
    return false
  return (
    typeof entry.contentHash === "string" &&
    [timing.startedAt, timing.endedAt, timing.elapsedMs].every(
      (item) =>
        item === undefined ||
        (typeof item === "number" && Number.isFinite(item) && item >= 0)
    )
  )
}

export function createWorkTimingCache(
  storage: WorkStorage | null,
  scope: string
) {
  const memory = new Map<string, ConversationWork>()
  const lastWrites = new Map<string, number>()
  const entries = new WeakMap<ChatMessage, StoredWork>()
  const storageKey = (conversationId: string) =>
    `fba-buddy.work-timing.v1:${encodeURIComponent(scope)}:${encodeURIComponent(conversationId)}`
  function read(conversationId: string): ConversationWork {
    try {
      const raw = storage?.getItem(storageKey(conversationId))
      if (raw) {
        const parsed: unknown = JSON.parse(raw)
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          const valid = Object.fromEntries(
            Object.entries(parsed).filter(([, entry]) => validEntry(entry))
          )
          for (const [alias, local] of Object.entries(
            memory.get(conversationId) ?? {}
          )) {
            const persisted = valid[alias]
            const persistedFinished =
              persisted &&
              !["running", "awaiting-approval"].includes(
                persisted.workTiming.status
              )
            const localFinished = !["running", "awaiting-approval"].includes(
              local.workTiming.status
            )
            if (
              !persisted ||
              (local.workTiming.startedAt ?? 0) >
                (persisted.workTiming.startedAt ?? 0) ||
              !persistedFinished ||
              localFinished
            ) {
              valid[alias] = local
            }
          }
          return valid
        }
      }
    } catch {
      /* Local timing remains usable when storage is unavailable */
    }
    return memory.get(conversationId) ?? {}
  }

  function remember(
    conversationId: string,
    messages: ChatMessage[],
    force = false
  ) {
    const saved = memory.get(conversationId) ?? read(conversationId)
    const keys = turnKeys(messages)
    const lastByTurn = new Map<string, number>()
    messages.forEach((message, index) => {
      if (message.role === "assistant") lastByTurn.set(keys[index]!, index)
    })
    let changed = false
    let terminal = false
    messages.forEach((message, index) => {
      if (message.role !== "assistant" || !message.workTiming) return
      const entry: StoredWork = entries.get(message) ?? {
        workTiming: message.workTiming,
        contentHash: fingerprint(message.content),
        ...(message.timing ? { timing: message.timing } : {}),
      }
      entries.set(message, entry)
      const aliases = [
        `id:${message.id}`,
        ...(message.pk != null ? [`pk:${message.pk}`] : []),
      ]
      if (lastByTurn.get(keys[index]!) === index) aliases.push(keys[index]!)
      for (const alias of aliases) {
        if (
          saved[alias] !== entry &&
          JSON.stringify(saved[alias]) !== JSON.stringify(entry)
        ) {
          saved[alias] = entry
          changed = true
          terminal ||= entry.workTiming.status !== "running"
        }
      }
    })
    if (!changed && !force) return
    const bounded = Object.fromEntries(Object.entries(saved).slice(-3000))
    memory.set(conversationId, bounded)
    if (memory.size > 100) memory.delete(memory.keys().next().value!)
    const now = Date.now()
    if (
      !force &&
      !terminal &&
      now - (lastWrites.get(conversationId) ?? 0) < 1000
    )
      return
    try {
      storage?.setItem(storageKey(conversationId), JSON.stringify(bounded))
      lastWrites.set(conversationId, now)
    } catch {
      /* A full storage must not interrupt a reply */
    }
  }

  function restore(
    conversationId: string,
    messages: ChatMessage[],
    generating: boolean
  ): ChatMessage[] {
    const saved = read(conversationId)
    const keys = turnKeys(messages)
    const last = messages.at(-1)
    const unfinishedReply = saved[keys.at(-1) ?? ""]
    if (
      !generating &&
      last?.role === "user" &&
      unfinishedReply &&
      ["stopped", "error"].includes(unfinishedReply.workTiming.status)
    ) {
      messages = [
        ...messages,
        {
          id: `work-${unfinishedReply.workTiming.runId}`,
          role: "assistant",
          content: "",
          status: unfinishedReply.workTiming.status as "stopped" | "error",
          workTiming: unfinishedReply.workTiming,
        },
      ]
    }
    const lastAssistant = messages.findLastIndex(
      (message) => message.role === "assistant"
    )
    return messages.map((message, index) => {
      if (message.role !== "assistant") return message
      const terminal = !(generating && index === lastAssistant)
      const exact = saved[`pk:${message.pk}`] ?? saved[`id:${message.id}`]
      const candidate = exact ?? saved[keys[index]!]
      const matches =
        candidate &&
        ((!terminal && exact) ||
          candidate.contentHash === fingerprint(message.content) ||
          (!terminal && candidate.workTiming.status === "running"))
      const cached =
        matches &&
        (terminal ||
          ["running", "awaiting-approval"].includes(
            candidate.workTiming.status
          ))
          ? candidate
          : undefined
      const work = message.workTiming ?? cached?.workTiming
      const status = terminal
        ? messageWorkStatus(message)
        : message.status === "awaiting-approval"
          ? "awaiting-approval"
          : "running"
      const finishedCache =
        cached &&
        !["running", "awaiting-approval"].includes(cached.workTiming.status)
      if (!work)
        return { ...message, workTiming: { runId: message.id, status } }
      const restoredStatus =
        terminal && finishedCache && status === "complete"
          ? cached.workTiming.status
          : status
      const elapsedMs =
        terminal && ["running", "awaiting-approval"].includes(work.status)
          ? undefined
          : work.elapsedMs
      return {
        ...message,
        ...(cached?.timing && !message.timing ? { timing: cached.timing } : {}),
        workTiming: { ...work, status: restoredStatus, elapsedMs },
      }
    })
  }

  return { remember, restore }
}

export type WorkTimingCache = ReturnType<typeof createWorkTimingCache>
