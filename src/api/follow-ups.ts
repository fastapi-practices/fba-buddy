import { apiRequest } from "@/api/http"
import { mapAttachmentToContent } from "@/features/chat/attachments"
import { toForwardedPropsApi } from "@/api/chat-body"
import type {
  ChatAttachment,
  ForwardedProps,
  OutgoingContentPart,
} from "@/lib/types"
import type { FollowUpMode } from "@/lib/general-settings"

export type ConversationFollowUp = {
  id: number
  clientRequestId: string
  mode: FollowUpMode
  status: "queued" | "dispatched" | "steered" | "failed"
  content: string
  attachments: OutgoingContentPart[]
  forwardedProps: ForwardedProps
  position: number
  reason: string | null
  disposition: "queued" | "steered"
  runId: string | null
  messageId: number | null
  createdTime: string
}

export function listConversationFollowUps(
  conversationId: string,
  signal?: AbortSignal
) {
  return apiRequest<{ items: ConversationFollowUp[] }>(
    `/conversations/${conversationId}/follow-ups`,
    { signal, silent: true }
  )
}

export function submitConversationFollowUp(
  conversationId: string,
  input: {
    requestId: string
    mode: FollowUpMode
    text: string
    attachments: ChatAttachment[]
    forwardedProps: ForwardedProps
  }
) {
  return apiRequest<ConversationFollowUp>(
    `/conversations/${conversationId}/follow-ups`,
    {
      method: "POST",
      body: JSON.stringify({
        clientRequestId: input.requestId,
        mode: input.mode,
        content: input.text,
        attachments: input.attachments.map(mapAttachmentToContent),
        forwardedProps: toForwardedPropsApi(input.forwardedProps),
      }),
      silent: true,
    }
  )
}

export function updateConversationFollowUp(
  conversationId: string,
  id: number,
  input: {
    content?: string
    attachments?: OutgoingContentPart[]
    forwardedProps?: ForwardedProps
    position?: number
  }
) {
  return apiRequest<ConversationFollowUp>(
    `/conversations/${conversationId}/follow-ups/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        ...(input.content !== undefined ? { content: input.content } : {}),
        ...(input.attachments !== undefined
          ? { attachments: input.attachments }
          : {}),
        ...(input.forwardedProps !== undefined
          ? { forwardedProps: toForwardedPropsApi(input.forwardedProps) }
          : {}),
        ...(input.position !== undefined ? { position: input.position } : {}),
      }),
      silent: true,
    }
  )
}

export function removeConversationFollowUp(conversationId: string, id: number) {
  return apiRequest<null>(`/conversations/${conversationId}/follow-ups/${id}`, {
    method: "DELETE",
    silent: true,
  })
}
