import { apiRequest } from "@/api/http"
import type {
  AssistantCategoryItem,
  AssistantItem,
  AssistantSortType,
  AssistantWriteBody,
} from "@/lib/types"

export function listAssistants(sortType: AssistantSortType = "comprehensive") {
  const search = new URLSearchParams()
  if (sortType !== "comprehensive") {
    search.set("sort_type", sortType)
  }
  const query = search.toString()
  return apiRequest<AssistantItem[]>(
    `/assistants/all${query ? `?${query}` : ""}`
  )
}

export function listAssistantCategories() {
  return apiRequest<AssistantCategoryItem[]>("/assistants/categories")
}

export function createMyAssistant(body: AssistantWriteBody) {
  return apiRequest<null>("/assistants/me", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

export function updateMyAssistant(pk: number, body: AssistantWriteBody) {
  return apiRequest<null>(`/assistants/me/${pk}`, {
    method: "PUT",
    body: JSON.stringify(body),
  })
}

export function deleteMyAssistant(pk: number) {
  return apiRequest<null>(`/assistants/me/${pk}`, { method: "DELETE" })
}
