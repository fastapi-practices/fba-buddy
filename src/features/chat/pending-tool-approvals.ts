import type { ThreadMessage, ToolCallMessagePart } from "@/features/chat/thread-types"

export type PendingToolApproval = {
  messageId: string
  part: ToolCallMessagePart
  key: string
}

export function collectPendingToolApprovals(
  messages: readonly Pick<
    ThreadMessage,
    "id" | "role" | "content" | "metadata"
  >[]
): PendingToolApproval[] {
  return messages.flatMap((message) => {
    if (message.role !== "assistant") return []
    const attempt = message.metadata?.custom?.attempt as
      { status?: string } | undefined
    if (attempt?.status === "superseded") return []
    return message.content.flatMap((part) => {
      if (part.type !== "tool-call") return []
      const lifecycle = part.providerMetadata?.buddy?.status
      if (
        lifecycle === "complete" ||
        lifecycle === "error" ||
        lifecycle === "stopped" ||
        lifecycle === "declined"
      )
        return []
      if (
        part.approval &&
        (part.approval.approved !== undefined ||
          part.approval.resolution !== undefined)
      )
        return []
      if (!part.approval && !part.interrupt) return []
      const payload = part.interrupt?.payload as
        { approvalRequestId?: string } | undefined
      const requestId = payload?.approvalRequestId ?? part.approval?.id ?? ""
      return [
        {
          messageId: message.id,
          part,
          key: `${message.id}:${part.toolCallId}:${requestId}`,
        },
      ]
    })
  })
}
