import { apiRequest } from "@/api/http"
import type { DelegationControlBody, DelegationSnapshot } from "@/lib/types"

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function normalizeDelegationTaskId(taskId: string) {
  const value = taskId.trim()
  if (UUID_PATTERN.test(value)) return value.toLowerCase()
  if (/^[0-9a-f]{32}$/i.test(value)) {
    return [
      value.slice(0, 8),
      value.slice(8, 12),
      value.slice(12, 16),
      value.slice(16, 20),
      value.slice(20),
    ]
      .join("-")
      .toLowerCase()
  }
  return value
}

export function getDelegations(
  conversationId: string,
  runId: string,
  signal?: AbortSignal
) {
  const query = new URLSearchParams({ run_id: runId })
  return apiRequest<DelegationSnapshot>(
    `/conversations/${encodeURIComponent(conversationId)}/delegations?${query}`,
    { signal, silent: true }
  )
}

export function controlDelegation(
  conversationId: string,
  taskId: string,
  body: DelegationControlBody
) {
  const normalized = normalizeDelegationTaskId(taskId)
  return apiRequest<null>(
    `/conversations/${encodeURIComponent(conversationId)}/delegations/${encodeURIComponent(normalized)}`,
    { method: "POST", body: JSON.stringify(body), silent: true }
  )
}
