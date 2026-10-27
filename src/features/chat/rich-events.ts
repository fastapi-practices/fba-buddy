export type RichEvent = { name: string; value: Record<string, unknown> }

export type LifecycleStatus =
  | "queued"
  | "running"
  | "ready"
  | "completed"
  | "failed"
  | "cancelled"
  | "unknown"

export function lifecycleStatus(event: RichEvent): LifecycleStatus {
  const raw =
    event.value.outcome ??
    event.value.status ??
    event.value.state ??
    event.value.kind
  if (raw == null)
    return event.name === "buddy.subagent" ? "running" : "unknown"
  const status = String(raw).toLowerCase()
  if (/(?:cancel|stop|terminat)/.test(status)) return "cancelled"
  if (/(?:fail|error)/.test(status)) return "failed"
  if (/(?:complete|finish|success|done|^ok$|[._-]end$)/.test(status))
    return "completed"
  if (/(?:queued|pending|scheduled|waiting)/.test(status)) return "queued"
  if (status === "ready") return "ready"
  if (/(?:running|started|active|in[_-]?progress|[._-]start$)/.test(status))
    return "running"
  return "unknown"
}

export function lifecycleEventKey(event: RichEvent, fallback = ""): string {
  return `${event.name}:${String(
    event.value.task_id ??
      event.value.tool_call_id ??
      event.value.id ??
      event.value.agent_name ??
      fallback
  )}`
}

export function mergeLifecycleEvent(
  previous: RichEvent | undefined,
  event: RichEvent
): RichEvent {
  if (!previous) return event
  const value = { ...previous.value }
  if (
    ["outcome", "status", "state"].some((key) => event.value[key] != null) ||
    (event.value.kind != null && lifecycleStatus(event) !== "unknown")
  )
    for (const key of ["outcome", "status", "state", "kind"]) delete value[key]
  return { ...event, value: { ...value, ...event.value } }
}

export function latestLifecycleEvents(
  events: readonly RichEvent[]
): RichEvent[] {
  const latest = new Map<string, RichEvent>()
  events.forEach((event) => {
    const key = lifecycleEventKey(event)
    const merged = mergeLifecycleEvent(latest.get(key), event)
    latest.delete(key)
    latest.set(key, merged)
  })
  return [...latest.values()]
}

export function isActiveSubagentEvent(event: RichEvent): boolean {
  return (
    event.name === "buddy.subagent" &&
    ["queued", "running"].includes(lifecycleStatus(event))
  )
}
export function persistentResourceUrl(value: Record<string, unknown>) {
  const source = value.url ?? value.endpoint
  if (typeof source !== "string") return null
  try {
    const url = new URL(source)
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null
  } catch {
    return null
  }
}
export function isPersistentToolResult(input: unknown) {
  let value = input
  if (typeof value === "string") {
    try {
      value = JSON.parse(value)
    } catch {
      return false
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  const status = lifecycleStatus({ name: "buddy.activity", value: row })
  if (["completed", "failed", "cancelled"].includes(status)) return false
  return Boolean(
    persistentResourceUrl(row) &&
    (row.persistent === true || ["running", "ready"].includes(status))
  )
}
export function isPersistentLifecycleEvent(event: RichEvent) {
  if (event.name === "buddy.activity") {
    const status = lifecycleStatus(event)
    return (
      isPersistentToolResult(event.value) ||
      (event.value.persistent === true &&
        !["completed", "failed", "cancelled"].includes(status))
    )
  }
  return isActiveSubagentEvent(event)
}
export function hasPersistentLifecycleWork(context: unknown) {
  if (!context || typeof context !== "object") return false
  const value = context as Record<string, unknown>
  return latestLifecycleEvents(
    readRichEvents(value.lifecycle_events).filter(
      (event) =>
        event.name === "buddy.subagent" || event.name === "buddy.activity"
    )
  ).some(isPersistentLifecycleEvent)
}
export function readRichEvents(value: unknown): RichEvent[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const row = item as Record<string, unknown>
    if (
      typeof row.name === "string" &&
      row.value &&
      typeof row.value === "object" &&
      !Array.isArray(row.value)
    )
      return [{ name: row.name, value: row.value as Record<string, unknown> }]
    return []
  })
}
export function mergeRichEvent(events: RichEvent[], event: RichEvent) {
  const key = (item: RichEvent) =>
    item.name === "buddy.subagent" || item.name === "buddy.activity"
      ? lifecycleEventKey(item)
      : `${item.name}:${String(item.value.request_id ?? item.value.task_id ?? (item.value.item as { id?: string } | undefined)?.id ?? item.value.tool_call_id ?? item.value.id ?? "")}:${String(item.name === "buddy.user_input" ? "" : (item.value.kind ?? ""))}`
  const index = events.findIndex((item) => key(item) === key(event))
  const merged =
    index < 0
      ? event
      : event.name === "buddy.subagent" || event.name === "buddy.activity"
        ? mergeLifecycleEvent(events[index], event)
        : { ...event, value: { ...events[index]!.value, ...event.value } }
  // 更新事件排到尾部，让快照与增量按实际到达顺序归并
  return [...events.filter((_, i) => i !== index), merged].slice(-200)
}
