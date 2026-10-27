import {
  parseDirectiveText,
  serializeDirective,
  type DirectiveSegment,
} from "@/features/chat/directive-formatter"

import type {
  WorkspaceArtifactListItem,
  WorkspaceKnowledgeItem,
  WorkspaceRef,
  WorkspaceRefKind,
  WorkspaceSkillItem,
} from "@/lib/types"

export function skillDirectiveText(id: number, name: string): string {
  return serializeDirective({
    id: String(id),
    type: "skill",
    label: name,
  })
}

function isSkillMention(
  segment: DirectiveSegment
): segment is Extract<DirectiveSegment, { kind: "mention" }> {
  return segment.kind === "mention" && segment.type === "skill"
}

function serializeSegment(segment: DirectiveSegment): string {
  if (segment.kind === "text") {
    return segment.text
  }
  return serializeDirective({
    id: segment.id,
    type: segment.type,
    label: segment.label,
  })
}

export function stripSkillDirectives(text: string): string {
  return parseDirectiveText(text)
    .filter((segment) => !isSkillMention(segment))
    .map(serializeSegment)
    .join("")
    .replace(/^\s+/, "")
}

export function replaceSkillDirective(
  text: string,
  id: number,
  name: string
): string {
  const rest = stripSkillDirectives(text)
  const chip = skillDirectiveText(id, name)
  return rest ? `${chip} ${rest}` : chip
}

export function workspaceRefFromComposerDraft(
  draft: string,
  current: WorkspaceRef | null | undefined
): WorkspaceRef | null {
  const fromText = skillRefFromText(draft)
  if (fromText) {
    return fromText
  }
  if (current?.kind === "skill") {
    return null
  }
  return current ?? null
}

export function skillRefFromText(text: string): WorkspaceRef | null {
  const segments = parseDirectiveText(text)
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index]
    if (!segment || !isSkillMention(segment)) {
      continue
    }
    const id = Number(segment.id)
    if (Number.isFinite(id)) {
      return { kind: "skill", id }
    }
  }
  return null
}

export function nextWorkspaceRef(
  current: WorkspaceRef | null | undefined,
  kind: WorkspaceRefKind,
  id: number
): WorkspaceRef | null {
  if (current?.kind === kind && current.id === id) {
    return null
  }
  return { kind, id }
}

export function workspaceRefLabel(
  ref: WorkspaceRef,
  records: {
    skills?: Pick<WorkspaceSkillItem, "id" | "name">[]
    knowledge?: Pick<WorkspaceKnowledgeItem, "id" | "title">[]
    artifacts?: Pick<WorkspaceArtifactListItem, "id" | "title">[]
  }
): string {
  if (ref.kind === "skill") {
    return (
      records.skills?.find((item) => item.id === ref.id)?.name ?? String(ref.id)
    )
  }
  if (ref.kind === "knowledge") {
    return (
      records.knowledge?.find((item) => item.id === ref.id)?.title ??
      String(ref.id)
    )
  }
  return (
    records.artifacts?.find((item) => item.id === ref.id)?.title ??
    String(ref.id)
  )
}
