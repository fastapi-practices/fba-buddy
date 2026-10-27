import { apiRequest } from "@/api/http"
import type {
  McpItem,
  McpWriteBody,
  QuickPhraseItem,
  QuickPhraseWriteBody,
  WebSearchOption,
} from "@/lib/types"

export function listMcps() {
  return apiRequest<McpItem[]>("/mcps/all")
}

export function createMyMcp(body: McpWriteBody) {
  return apiRequest<null>("/mcps/me", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

export function updateMyMcp(pk: number, body: McpWriteBody) {
  return apiRequest<null>(`/mcps/me/${pk}`, {
    method: "PUT",
    body: JSON.stringify(body),
  })
}

export function deleteMyMcp(pk: number) {
  return apiRequest<null>(`/mcps/me/${pk}`, { method: "DELETE" })
}

export function cloneMyMcp(pk: number) {
  return apiRequest<null>(`/mcps/me/${pk}/clone`, { method: "POST" })
}

export function importMyMcps(json: string) {
  return apiRequest<{ created: number; skipped: string[] }>("/mcps/me/import", {
    method: "POST",
    body: JSON.stringify({ config: json }),
  })
}

export function listQuickPhrases() {
  return apiRequest<QuickPhraseItem[]>("/quick-phrases/all")
}

export function createMyQuickPhrase(body: QuickPhraseWriteBody) {
  return apiRequest<null>("/quick-phrases/me", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

export function updateMyQuickPhrase(pk: number, body: QuickPhraseWriteBody) {
  return apiRequest<null>(`/quick-phrases/me/${pk}`, {
    method: "PUT",
    body: JSON.stringify(body),
  })
}

export function deleteMyQuickPhrase(pk: number) {
  return apiRequest<null>(`/quick-phrases/me/${pk}`, { method: "DELETE" })
}

export function listWebSearchOptions() {
  return apiRequest<WebSearchOption[]>("/web-search-options")
}
