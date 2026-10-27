import { apiRequest } from "@/api/http"

export type ApprovalAudit = {
  id: number | string
  conversation_id: string
  request_id: string
  run_id: string
  tool_call_id: string
  tool_name: string
  arguments_sha256: string
  status: "pending" | "approved" | "denied" | "cancelled" | "expired"
  created_time: string
  expires_time: string | null
  resolved_time: string | null
}

export function listApprovalAudits(
  before?: number | string,
  signal?: AbortSignal
) {
  const query = new URLSearchParams({ limit: "50" })
  if (before !== undefined) query.set("before", String(before))
  return apiRequest<ApprovalAudit[]>(`/approval-audits?${query}`, {
    signal,
    silent: true,
  })
}
