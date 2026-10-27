import type { TurnContext } from "@/lib/types"

export type TurnContextTag = {
  key: string
  label: string
}

function stringValue(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function numberList(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter((item): item is number => typeof item === "number")
}

function normalizeTurnContext(
  value: TurnContext | null | undefined
): TurnContext | null {
  if (!value || typeof value !== "object") {
    return null
  }
  return value
}

export function turnContextTags(
  context: TurnContext | null | undefined,
  labels: {
    chat: string
    work: string
    coding: string
    mcp: string
    search: string
    originIm: string
    originCron: string
  }
): TurnContextTag[] {
  if (!context) {
    return []
  }
  const tags: TurnContextTag[] = []
  const origin = stringValue(context.origin)
  if (origin === "im") {
    tags.push({ key: "origin", label: labels.originIm })
  } else if (origin === "cron") {
    tags.push({ key: "origin", label: labels.originCron })
  }
  const agentMode = stringValue(context.agent_mode)
  if (agentMode === "coding") {
    tags.push({ key: "mode", label: labels.coding })
  } else if (agentMode === "chat") {
    tags.push({ key: "mode", label: labels.chat })
  } else if (agentMode === "work") {
    tags.push({ key: "mode", label: labels.work })
  }
  const modelId = stringValue(context.model_id)
  if (modelId) {
    tags.push({ key: "model", label: modelId })
  }
  const mcpIds = numberList(context.mcp_ids)
  if (mcpIds.length > 0) {
    tags.push({ key: "mcp", label: `${labels.mcp} ${mcpIds.length}` })
  }
  const search = stringValue(context.web_search)
  if (search && search !== "off") {
    tags.push({ key: "search", label: `${labels.search} ${search}` })
  }
  const acpRunner = context.acp_runner
  const acpRunnerName = stringValue(context.acp_runner_name)
  if (agentMode === "coding" && acpRunner && acpRunnerName) {
    tags.push({ key: "acp", label: acpRunnerName })
  }
  return tags
}

export function snapshotTurnContext(message: {
  turnContext?: TurnContext | null
}): TurnContext | null {
  return normalizeTurnContext(message.turnContext)
}
