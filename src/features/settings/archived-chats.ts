import { translateCurrent } from "@/lib/i18n"
import {
  conversationAssistantId,
  conversationProjectId,
} from "@/lib/conversation-workspace"
import type { ConversationListItem, ProjectItem } from "@/lib/types"

export type ArchivedProjectFilter = "all" | "none" | number
export type ArchivedAssistantFilter = "all" | number

export type ArchivedChatGroup = {
  projectId: number | null
  name: string
  items: ConversationListItem[]
}

export function parseArchivedProjectFilter(
  value: string
): ArchivedProjectFilter {
  if (value === "none") {
    return "none"
  }
  if (value !== "all") {
    const id = Number(value)
    if (Number.isInteger(id) && id > 0) {
      return id
    }
  }
  return "all"
}

export function parseArchivedAssistantFilter(
  value: string
): ArchivedAssistantFilter {
  if (value !== "all") {
    const id = Number(value)
    if (Number.isInteger(id) && id > 0) {
      return id
    }
  }
  return "all"
}

export function conversationMatchesArchivedFilters(
  item: ConversationListItem,
  filters: {
    query: string
    projectFilter: ArchivedProjectFilter
    assistantFilter: ArchivedAssistantFilter
  }
): boolean {
  const needle = filters.query.trim().toLowerCase()
  if (needle && !item.title.toLowerCase().includes(needle)) {
    return false
  }
  const projectId = conversationProjectId(item)
  if (filters.projectFilter === "none" && projectId != null) {
    return false
  }
  if (
    typeof filters.projectFilter === "number" &&
    projectId !== filters.projectFilter
  ) {
    return false
  }
  const assistantId = conversationAssistantId(item)
  if (
    typeof filters.assistantFilter === "number" &&
    assistantId !== filters.assistantFilter
  ) {
    return false
  }
  return true
}

function conversationSortTime(item: ConversationListItem): number {
  const stamp = Date.parse(
    item.last_message_time || item.updated_time || item.created_time
  )
  return Number.isFinite(stamp) ? stamp : 0
}

export function groupArchivedConversations(
  items: ConversationListItem[],
  projects: ProjectItem[]
): ArchivedChatGroup[] {
  const byProject = new Map<number | null, ConversationListItem[]>()
  for (const item of items) {
    const projectId = conversationProjectId(item)
    const bucket = byProject.get(projectId) ?? []
    bucket.push(item)
    byProject.set(projectId, bucket)
  }

  const groups: ArchivedChatGroup[] = []
  const named = [...projects]
    .filter((project) => byProject.has(project.id))
    .sort(
      (left, right) =>
        left.sort - right.sort || left.name.localeCompare(right.name)
    )
  for (const project of named) {
    const grouped = byProject.get(project.id) ?? []
    groups.push({
      projectId: project.id,
      name: project.name,
      items: [...grouped].sort(
        (left, right) =>
          conversationSortTime(right) - conversationSortTime(left)
      ),
    })
  }

  const ungrouped = byProject.get(null)
  if (ungrouped && ungrouped.length > 0) {
    groups.push({
      projectId: null,
      name: translateCurrent("common.noProject"),
      items: [...ungrouped].sort(
        (left, right) =>
          conversationSortTime(right) - conversationSortTime(left)
      ),
    })
  }
  return groups
}
