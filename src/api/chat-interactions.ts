import { apiRequest } from "./http"
import { translateCurrent } from "@/lib/i18n"
import type { InputAnswer, InputRequest } from "@/shared/chat-input"
export type {  InputRequest } from "@/shared/chat-input"
export function pendingInputRequests(
  conversationId: string,
  options: { signal?: AbortSignal } = {}
) {
  return apiRequest<{ items: InputRequest[] }>(
    `/conversations/${conversationId}/input-requests`,
    { silent: true, signal: options.signal }
  )
}
export function answerInputRequest(
  conversationId: string,
  requestId: string,
  body: InputAnswer
) {
  return apiRequest<null>(
    `/conversations/${conversationId}/input-requests/${requestId}`,
    { method: "POST", body: JSON.stringify(body), silent: true }
  )
}
export type PlanItem = {
  id: string
  content: string
  status: "pending" | "in_progress" | "completed" | "cancelled" | "blocked"
  active_form?: string
  parent_id?: string | null
  depends_on?: string[]
}
export type ConversationPlan = {
  items: PlanItem[]
}
export function getConversationPlan(
  id: string,
  options: { signal?: AbortSignal } = {}
) {
  return apiRequest<ConversationPlan>(`/conversations/${id}/plan`, {
    silent: true,
    signal: options.signal,
  })
}
export type MessageVersion = {
  conversation_id: string
  title: string
  created_time: string
  message_id: number | null
  source_conversation_id: string
  source_message_id: number
}
export async function getMessageVersions(
  id: string,
  pk: number,
  options: { signal?: AbortSignal } = {}
) {
  const result = await apiRequest<unknown>(
    `/conversations/${encodeURIComponent(id)}/messages/${pk}/versions`,
    { silent: true, signal: options.signal }
  )
  if (
    !Array.isArray(result) ||
    result.some(
      (item) =>
        !item ||
        typeof item !== "object" ||
        typeof item.conversation_id !== "string" ||
        !item.conversation_id ||
        (item.message_id !== null &&
          (!Number.isSafeInteger(item.message_id) || item.message_id <= 0)) ||
        typeof item.title !== "string" ||
        typeof item.created_time !== "string" ||
        typeof item.source_conversation_id !== "string" ||
        !item.source_conversation_id ||
        !Number.isSafeInteger(item.source_message_id) ||
        item.source_message_id <= 0
    )
  )
    throw new Error(translateCurrent("common.branchVersionsInvalid"))
  return result as MessageVersion[]
}
