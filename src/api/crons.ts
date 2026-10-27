import { apiRequest } from "@/api/http"
import type { CronItem, CronWriteBody } from "@/lib/types"

export function listCrons() {
  return apiRequest<CronItem[]>("/crons/all")
}

export function createCron(body: CronWriteBody) {
  return apiRequest<null>("/crons", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

export function updateCron(pk: number, body: CronWriteBody) {
  return apiRequest<null>(`/crons/${pk}`, {
    method: "PUT",
    body: JSON.stringify(body),
  })
}

export function runCronNow(pk: number) {
  return apiRequest<null>(`/crons/${pk}/run-now`, { method: "POST" })
}

export function deleteCron(pk: number) {
  return apiRequest<null>(`/crons/${pk}`, { method: "DELETE" })
}
