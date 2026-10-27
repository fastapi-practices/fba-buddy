import { artifactFileFormat } from "@/features/workspace/artifact-format"
import { translateCurrent } from "@/lib/i18n"
import type {
  MemoryListItem,
  WorkspaceArtifactItem,
  WorkspaceArtifactListItem,
  WorkspaceKind,
  WorkspaceKnowledgeItem,
  WorkspaceSkillItem,
} from "@/lib/types"

export type WorkspaceListItem = {
  key: string
  label: string
  preview: string
  badge?: string
  updatedTime?: string
}

export type WorkspaceRecord =
  | WorkspaceArtifactListItem
  | MemoryListItem
  | WorkspaceKnowledgeItem
  | WorkspaceSkillItem

export function workspaceRecordQueryKey(kind: WorkspaceKind): [string] {
  if (kind === "artifact") {
    return ["artifacts"]
  }
  if (kind === "knowledge") {
    return ["knowledge"]
  }
  if (kind === "skill") {
    return ["skills"]
  }
  return ["memories"]
}

export function toWorkspaceListItem(
  kind: WorkspaceKind,
  item: WorkspaceRecord
): WorkspaceListItem {
  if (kind === "memory") {
    const record = item as MemoryListItem
    return {
      key: record.path,
      label: record.path,
      preview: record.preview,
    }
  }
  if (kind === "knowledge") {
    const record = item as WorkspaceKnowledgeItem
    return {
      key: String(record.id),
      label: record.title,
      preview: previewPlainText(record.content ?? ""),
      badge: record.source ?? record.knowledge_base_name ?? undefined,
      updatedTime: record.updated_time ?? record.created_time,
    }
  }
  if (kind === "skill") {
    const record = item as WorkspaceSkillItem
    return {
      key: String(record.id),
      label: record.name,
      preview:
        record.description?.trim() || previewPlainText(record.content ?? ""),
      badge: record.version || undefined,
      updatedTime: record.updated_time ?? record.created_time,
    }
  }
  const record = item as WorkspaceArtifactListItem
  return {
    key: String(record.id),
    label: record.title,
    preview: record.relative_path ?? record.mime_type ?? "",
    badge: record.kind,
    updatedTime: record.updated_time ?? record.created_time,
  }
}

export function stripMarkdownFrontmatter(content: string): string {
  const text = content.trim()
  if (!text.startsWith("---")) {
    return text
  }
  const match = text.match(/^---\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n|$)/)
  if (!match) {
    return text
  }
  return text.slice(match[0].length).trim()
}

export function previewPlainText(content: string, max = 88): string {
  const plain = stripMarkdownFrontmatter(content)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_~>#-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  if (plain.length <= max) {
    return plain
  }
  return `${plain.slice(0, max).trim()}…`
}

export function matchesLibraryQuery(
  item: WorkspaceKnowledgeItem | WorkspaceSkillItem | WorkspaceArtifactListItem,
  query: string
): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) {
    return true
  }
  if ("name" in item) {
    return [item.name, item.description, item.version, item.content].some(
      (part) => part?.toLowerCase().includes(needle)
    )
  }
  if ("source" in item) {
    return [item.title, item.source, item.content].some((part) =>
      part?.toLowerCase().includes(needle)
    )
  }
  return [
    item.title,
    item.kind,
    item.workspace_id,
    item.relative_path,
    item.mime_type,
    item.sha256,
  ].some((part) => part?.toLowerCase().includes(needle))
}

export function isMarkdownFormat(format: string): boolean {
  const value = format.trim().toLowerCase()
  return value === "markdown" || value === "md" || value === "text/markdown"
}

export type LibraryKind = "skill" | "knowledge" | "artifact"

export type LibraryRecord =
  WorkspaceSkillItem | WorkspaceKnowledgeItem | WorkspaceArtifactListItem

export type LibraryOverviewRecord =
  WorkspaceSkillItem | WorkspaceKnowledgeItem | WorkspaceArtifactItem

export function libraryRecordTitle(
  kind: LibraryKind,
  record: LibraryRecord
): string {
  if (kind === "skill") {
    return (record as WorkspaceSkillItem).name
  }
  return (record as WorkspaceKnowledgeItem | WorkspaceArtifactListItem).title
}

export function libraryRecordDescription(
  kind: LibraryKind,
  record: LibraryRecord
): string {
  if (kind === "skill") {
    return (record as WorkspaceSkillItem).description?.trim() ?? ""
  }
  if (kind === "artifact") {
    const artifact = record as WorkspaceArtifactListItem
    return artifact.relative_path ?? artifact.mime_type ?? ""
  }
  return ""
}

export function libraryRecordOverview(
  kind: LibraryKind,
  record: LibraryOverviewRecord
): string {
  if (kind === "skill") {
    return stripMarkdownFrontmatter(
      (record as WorkspaceSkillItem).content ?? ""
    )
  }
  if (kind === "artifact") {
    const content = (record as WorkspaceArtifactItem).content
    return isMarkdownFormat(libraryOverviewKind(kind, record))
      ? stripMarkdownFrontmatter(content)
      : content
  }
  const content = (record as WorkspaceKnowledgeItem).content ?? ""
  return isMarkdownFormat(libraryOverviewKind(kind, record))
    ? stripMarkdownFrontmatter(content)
    : content
}

export function libraryRecordVersion(
  kind: LibraryKind,
  record: LibraryRecord
): string | null {
  if (kind !== "skill") {
    return null
  }
  const version = (record as WorkspaceSkillItem).version?.trim()
  return version || null
}

export function libraryRecordKindLabel(
  kind: LibraryKind,
  record: LibraryRecord
): string | null {
  if (kind !== "artifact") {
    return null
  }
  return translateCurrent(
    `common.${(record as WorkspaceArtifactListItem).kind}`
  )
}

export function libraryOverviewKind(
  kind: LibraryKind,
  record: LibraryOverviewRecord
): string {
  if (kind === "artifact") {
    return artifactFileFormat(record as WorkspaceArtifactListItem).mimeType
  }
  if (kind === "knowledge") {
    const document = record as WorkspaceKnowledgeItem
    const type = document.file_type
    if (type === "xlsx") {
      return /^\s*\|.+\|\s*\r?\n[ \t]*\|[ \t:|-]+\|/m.test(
        document.content ?? ""
      )
        ? "markdown"
        : "tsv"
    }
    return type
  }
  return "markdown"
}

export function libraryRecordInitial(title: string): string {
  return title.trim().slice(0, 1) || "?"
}

export function formatWorkspaceTime(
  value: string | null | undefined,
  locale = "zh-CN"
): string {
  if (!value) {
    return ""
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ""
  }
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}
