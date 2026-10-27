import type { PlanItem } from "@/api/chat-interactions"
import type { RichEvent } from "./rich-events"

const statuses = new Set([
  "pending",
  "in_progress",
  "completed",
  "cancelled",
  "blocked",
])
function planItem(value: unknown): PlanItem | null {
  if (!value || typeof value !== "object") return null
  const row = value as Record<string, unknown>
  if (
    typeof row.id !== "string" ||
    typeof row.content !== "string" ||
    !statuses.has(String(row.status))
  )
    return null
  return row as PlanItem
}
export function planFromEvents(events: RichEvent[]): PlanItem[] {
  const items = new Map<string, PlanItem>()
  for (const event of events) {
    if (event.name !== "buddy.planning") continue
    if (Array.isArray(event.value.items)) {
      items.clear()
      for (const value of event.value.items) {
        const item = planItem(value)
        if (item) items.set(item.id, item)
      }
    }
    const item = planItem(event.value.item)
    if (event.value.kind === "planning.deleted") {
      const id =
        item?.id ??
        (event.value.item as { id?: unknown } | undefined)?.id ??
        event.value.item_id ??
        event.value.id
      if (typeof id === "string") items.delete(id)
    } else if (item) items.set(item.id, item)
  }
  return [...items.values()]
}
// 全部步骤都还没开始时，计划只是提案，可以手动触发执行
export function planAwaitingExecution(items: PlanItem[]): boolean {
  return items.every((item) => item.status === "pending")
}

// 计划标题已经显示在触发行上，正文里去掉重复的一级标题
export function planProposalBody(markdown: string): string {
  return markdown.replace(/^\s{0,3}#{1,6}[^\n]*\n?/, "").trim()
}

export function proposalFromEvents(events: RichEvent[]) {
  const event = events.findLast(
    (item) =>
      item.name === "buddy.planning" &&
      (typeof item.value.markdown === "string" ||
        typeof item.value.proposal === "string")
  )
  if (!event) return null
  return {
    markdown: String(event.value.markdown ?? event.value.proposal),
    title:
      typeof event.value.title === "string" ? event.value.title : undefined,
  }
}
