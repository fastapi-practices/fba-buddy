import { apiRequest } from "@/api/http"
import type {
  ApplyExpertResult,
  ExpertDetail,
  ExpertItem,
  ExpertWriteBody,
} from "@/lib/types"

export function listExperts() {
  return apiRequest<ExpertItem[]>("/experts/all")
}

export function getExpert(pk: number, signal?: AbortSignal) {
  return apiRequest<ExpertDetail>(`/experts/${pk}`, { signal, silent: true })
}

export function createMyExpert(body: ExpertWriteBody) {
  return apiRequest<null>("/experts/me", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

export function updateMyExpert(pk: number, body: ExpertWriteBody) {
  return apiRequest<null>(`/experts/me/${pk}`, {
    method: "PUT",
    body: JSON.stringify(body),
  })
}

export function deleteMyExpert(pk: number) {
  return apiRequest<null>(`/experts/me/${pk}`, { method: "DELETE" })
}

export function applyExpert(pk: number, name?: string) {
  return apiRequest<ApplyExpertResult>(`/experts/${pk}/apply`, {
    method: "POST",
    body: JSON.stringify(name ? { name } : {}),
  })
}
