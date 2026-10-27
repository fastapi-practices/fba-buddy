import { apiRequest } from "@/api/http"

export type McpOauthStatus = {
  configured: boolean
  connected: boolean
  expires_time: string | null
}

export type McpOauthTokenEndpointAuthMethod =
  | "none"
  | "client_secret_post"
  | "client_secret_basic"

export type McpOauthConfig = {
  configured: boolean
  enabled: boolean
  redirect_uri: string
  authorization_url: string | null
  token_url: string | null
  client_id: string | null
  has_client_secret: boolean
  scope: string
  token_endpoint_auth_method: McpOauthTokenEndpointAuthMethod
}

export type McpOauthConfigWriteBody = {
  enabled: boolean
  authorization_url: string
  token_url: string
  client_id: string
  client_secret?: string | null
  scope: string
  token_endpoint_auth_method: McpOauthTokenEndpointAuthMethod
}

export function getMcpOauth(id: number, signal?: AbortSignal) {
  return apiRequest<McpOauthStatus>(`/mcps/${id}/oauth`, {
    signal,
    silent: true,
  })
}

export function authorizeMcpOauth(id: number, signal?: AbortSignal) {
  return apiRequest<{ authorization_url: string; expires_seconds: number }>(
    `/mcps/${id}/oauth/authorize`,
    { method: "POST", signal, silent: true }
  )
}

export function disconnectMcpOauth(id: number, signal?: AbortSignal) {
  return apiRequest<null>(`/mcps/${id}/oauth`, {
    method: "DELETE",
    signal,
    silent: true,
  })
}

export function getMcpOauthConfig(id: number, signal?: AbortSignal) {
  return apiRequest<McpOauthConfig>(`/mcps/${id}/oauth/config`, {
    signal,
    silent: true,
  })
}

export function updateMcpOauthConfig(
  id: number,
  body: McpOauthConfigWriteBody
) {
  return apiRequest<null>(`/mcps/${id}/oauth/config`, {
    method: "PUT",
    body: JSON.stringify(body),
  })
}
