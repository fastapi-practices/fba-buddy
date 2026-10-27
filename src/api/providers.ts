import { apiRequest } from "@/api/http"
import type {
  ProviderItem,
  ProviderModelItem,
  ProviderWriteBody,
} from "@/lib/types"

export function listMyProviders() {
  return apiRequest<ProviderItem[]>("/providers/me")
}

export function getMyProvider(pk: number) {
  return apiRequest<ProviderItem>(`/providers/me/${pk}`)
}

export function listMyProviderModels(pk: number) {
  return apiRequest<ProviderModelItem[]>(`/providers/me/${pk}/models`)
}

export function createMyProvider(body: ProviderWriteBody) {
  return apiRequest<null>("/providers/me", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

export function updateMyProvider(pk: number, body: ProviderWriteBody) {
  return apiRequest<null>(`/providers/me/${pk}`, {
    method: "PUT",
    body: JSON.stringify(body),
  })
}

export function deleteMyProviders(pks: number[]) {
  return apiRequest<null>("/providers/me", {
    method: "DELETE",
    body: JSON.stringify({ pks }),
  })
}
