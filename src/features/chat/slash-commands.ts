export type MentionItem = {
  id: string
  type: string
  label: string
  description?: string
  icon?: string
}


import type {
  SlashCommandItem,
  SlashExecuteResult,
} from "@/lib/types"

export function slashCommandsToMentions(
  commands: readonly SlashCommandItem[]
): MentionItem[] {
  return commands.map((command) => ({
    id: command.name,
    type: "slash",
    label: `/${command.name}`,
    description: command.description,
    icon: "slash",
  }))
}

export function parseSlashInvocation(draft: string, command: string): {
  args: string
  draftWithoutCommand: string
} {
  const escaped = command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const match = draft.match(
    new RegExp(`(^|\\s)/${escaped}(?:\\s+|$)([\\s\\S]*)`, "i")
  )
  if (!match) {
    return { args: "", draftWithoutCommand: draft.trim() }
  }
  const prefix = draft.slice(0, match.index ?? 0) + (match[1] ?? "")
  return {
    args: (match[2] ?? "").trim(),
    draftWithoutCommand: prefix.trim(),
  }
}

export function slashExecuteBody(
  command: string,
  draft: string,
  conversationId: string | null
) {
  const parsed = parseSlashInvocation(draft, command)
  return {
    command,
    conversation_id: conversationId,
    args: parsed.args || null,
    origin: "web" as const,
    draft:
      command === "polish"
        ? parsed.draftWithoutCommand || parsed.args || null
        : null,
  }
}

export type SlashApplyAction =
  | { type: "toast"; message: string }
  | { type: "polish"; draft: string; message: string }
  | { type: "navigate"; conversationId: string; message: string }
  | { type: "reload"; conversationId: string; message: string }
  | { type: "title"; title: string; message: string }

function stringData(data: Record<string, unknown> | null | undefined, key: string) {
  const value = data?.[key]
  return typeof value === "string" && value.trim() ? value : null
}

export function slashApplyAction(
  result: SlashExecuteResult,
  conversationId: string | null
): SlashApplyAction {
  if (result.command === "polish") {
    const draft = stringData(result.data, "draft") ?? ""
    return { type: "polish", draft, message: result.message }
  }
  if (result.command === "new") {
    const nextId =
      stringData(result.data, "conversation_id") ??
      stringData(result.data, "conversationId")
    if (nextId) {
      return { type: "navigate", conversationId: nextId, message: result.message }
    }
  }
  if (result.command === "title") {
    const title = stringData(result.data, "title")
    if (title) {
      return { type: "title", title, message: result.message }
    }
  }
  if (
    (result.command === "retry" ||
      result.command === "compact" ||
      result.command === "stop" ||
      result.command === "title") &&
    conversationId
  ) {
    return { type: "reload", conversationId, message: result.message }
  }
  return { type: "toast", message: result.message }
}
