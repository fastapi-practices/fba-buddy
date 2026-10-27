import { apiRequest } from "@/api/http"
import type { SubagentWriteBody } from "@/lib/types"

export function createMySubagent(body: SubagentWriteBody) {
  return apiRequest<null>("/subagents/me", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

export function updateMySubagent(pk: number, body: SubagentWriteBody) {
  return apiRequest<null>(`/subagents/me/${pk}`, {
    method: "PUT",
    body: JSON.stringify(body),
  })
}

export function deleteMySubagent(pk: number) {
  return apiRequest<null>(`/subagents/me/${pk}`, { method: "DELETE" })
}
