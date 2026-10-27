import { apiRequest } from "@/api/http"
import type {
  DefaultModel,
  ModelArchitectureSyncResult,
  ModelKind,
  ModelOptions,
  ModelWriteBody,
  MyModelItem,
} from "@/lib/types"

export function getModelOptions() {
  return apiRequest<ModelOptions>("/model-options")
}

export function listMyModels() {
  return apiRequest<MyModelItem[]>("/models/me")
}

export function getMyModel(pk: number) {
  return apiRequest<MyModelItem>(`/models/me/${pk}`)
}

export function createMyModel(body: ModelWriteBody) {
  return apiRequest<null>("/models/me", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

export function updateMyModel(pk: number, body: ModelWriteBody) {
  return apiRequest<null>(`/models/me/${pk}`, {
    method: "PUT",
    body: JSON.stringify(body),
  })
}

export function deleteMyModel(pk: number) {
  return apiRequest<null>(`/models/me/${pk}`, { method: "DELETE" })
}

export function syncMyModelArchitecture() {
  return apiRequest<ModelArchitectureSyncResult>("/models/me/architecture/sync", {
    method: "POST",
  })
}

export function defaultModelForKind(
  options: ModelOptions | null | undefined,
  kind: ModelKind
): DefaultModel | null {
  return options?.default_models[kind] ?? null
}
