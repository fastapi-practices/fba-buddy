import { translateCurrent } from "@/lib/i18n"
import type { ChatMessage, ChatToolCall } from "@/lib/types"
import type { ToolCallMessagePart } from "./thread-types"
import { settleWorkTiming } from "./work-timing"

export function isDeclinedToolApproval(
  part: Pick<ToolCallMessagePart, "hadApproval" | "providerMetadata">
) {
  return (
    part.hadApproval === true &&
    part.providerMetadata?.buddy?.status === "declined"
  )
}

export function approvalsForResume(
  messages: ChatMessage[],
  approvals: Record<string, boolean>
): Record<string, boolean> {
  const tools = messages.flatMap((message) => message.tools ?? [])
  return Object.fromEntries(
    Object.entries(approvals).map(([toolCallId, approved]) => {
      const tool = tools.findLast((tool) => tool.id === toolCallId)
      return [tool?.interruptId ?? `int-${toolCallId}`, approved]
    })
  )
}

export function markToolsResolved(
  messages: ChatMessage[],
  approvals: Record<string, boolean>
): ChatMessage[] {
  return messages.map((item) => {
    if (!item.tools?.some((tool) => tool.id in approvals)) return item
    const tools = item.tools.map((tool) =>
      tool.id in approvals
        ? resolveToolApproval(tool, approvals[tool.id] === true)
        : tool
    )
    const awaitingApproval = tools.some((tool) => tool.pendingApproval)
    const status = awaitingApproval
      ? "awaiting-approval"
      : item.status === "awaiting-approval"
        ? "streaming"
        : item.status
    return {
      ...item,
      tools,
      status,
      ...(item.workTiming &&
      (awaitingApproval || item.status === "awaiting-approval")
        ? {
            workTiming: settleWorkTiming(
              item.workTiming,
              awaitingApproval ? "awaiting-approval" : "running"
            ),
          }
        : {}),
    }
  })
}

export function resolveToolApproval(
  tool: ChatToolCall,
  approved: boolean
): ChatToolCall {
  const resolved = {
    ...tool,
    pendingApproval: false,
    hadApproval: true,
    approvalRequestId: undefined,
  }
  if (!approved) {
    return {
      ...resolved,
      status: "declined",
      result: translateCurrent("common.denied"),
    }
  }
  return {
    ...resolved,
    status:
      tool.isError || tool.status === "error"
        ? "error"
        : tool.result !== undefined
          ? "complete"
          : "running",
  }
}

export function pendingApprovalTools(messages: ChatMessage[]): ChatToolCall[] {
  return messages.flatMap((item) =>
    (item.tools ?? []).filter((tool) => tool.pendingApproval)
  )
}

export function applyApprovalChoice(input: {
  draft: Record<string, boolean>
  pending: Array<Pick<ChatToolCall, "id" | "name" | "approvalRequestId">>
  toolCallId: string
  approved: boolean
  always: boolean
  allowedTools: readonly string[]
}): { draft: Record<string, boolean>; allowedTools: string[] } {
  const allowed = new Set(input.allowedTools)
  const chosen = input.pending.find((tool) => tool.id === input.toolCallId)
  if (input.always && input.approved && chosen?.name) {
    allowed.add(chosen.name)
  }
  const draft = { ...input.draft, [input.toolCallId]: input.approved }
  if (input.approved) {
    for (const tool of input.pending) {
      if (tool.id in draft) {
        continue
      }
      if (!tool.approvalRequestId && allowed.has(tool.name)) {
        draft[tool.id] = true
      }
    }
  }
  return { draft, allowedTools: [...allowed] }
}

export function autoApprovalsFromAllowlist(
  pending: Array<Pick<ChatToolCall, "id" | "name" | "approvalRequestId">>,
  allowedTools: readonly string[]
): Record<string, boolean> {
  const allowed = new Set(allowedTools)
  const draft: Record<string, boolean> = {}
  for (const tool of pending) {
    if (!tool.approvalRequestId && allowed.has(tool.name)) {
      draft[tool.id] = true
    }
  }
  return draft
}
