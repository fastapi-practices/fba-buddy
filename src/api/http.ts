import { isTranslationKey, translateCurrent } from "@/lib/i18n"
import { API_V1 } from "@/lib/config"
import { translate } from "@/lib/i18n"
import { notifyError } from "@/lib/notify"
import { getLocale } from "@/lib/runtime"
import { getAccessToken, useSessionStore } from "@/lib/session"
import type { ApiResponse, RefreshData } from "@/lib/types"
import {
  currentAccountSource,
  dataSourceKey,
  dataSourceSignal,
} from "@/lib/account-source"
import { useHistoryCacheStatusStore } from "@/lib/history-cache-status"
import {
  historyCacheRevision,
  invalidateHistoryCache,
  isHistoryCachePath,
  markHistoryOffline,
  markHistoryOnline,
  readHistoryCache,
  writeHistoryCache,
} from "@/api/history-cache"

const refreshPromises = new Map<string, Promise<string | null>>()

async function refreshAccessToken(signal: AbortSignal) {
  const source = dataSourceKey()
  const existing = refreshPromises.get(source)
  if (existing) return existing

  const refreshPromise = (async () => {
    const response = await fetch(`${API_V1}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      signal,
    })
    signal.throwIfAborted()
    if (!response.ok) {
      useSessionStore.getState().clearSession()
      return null
    }
    const payload = (await response.json()) as ApiResponse<RefreshData>
    signal.throwIfAborted()
    if (payload.code !== 200 || !payload.data) {
      useSessionStore.getState().clearSession()
      return null
    }
    useSessionStore.getState().setSession({
      accessToken: payload.data.access_token,
      accessTokenExpireTime: payload.data.access_token_expire_time,
      sessionUuid: payload.data.session_uuid,
    })
    return payload.data.access_token
  })().finally(() => {
    refreshPromises.delete(source)
  })

  refreshPromises.set(source, refreshPromise)
  return refreshPromise
}

export class ApiError extends Error {
  code: number

  constructor(code: number, message: string) {
    super(message)
    this.code = code
  }
}

export function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError"
}

export function formatApiErrorMessage(value: unknown): string {
  if (typeof value === "string") {
    return value.trim()
  }
  if (Array.isArray(value)) {
    return value.map(formatApiErrorMessage).filter(Boolean).join("; ")
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>
    return (
      formatApiErrorMessage(record.msg) ||
      formatApiErrorMessage(record.message) ||
      formatApiErrorMessage(record.detail)
    )
  }
  return ""
}

export function parseApiError(
  payload: unknown,
  status: number,
  statusText: string,
  fallback: string
): { code: number; message: string } {
  const record =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : null
  const code =
    typeof record?.code === "number" && Number.isFinite(record.code)
      ? record.code
      : status
  const message =
    formatApiErrorMessage(record?.msg) ||
    formatApiErrorMessage(record?.message) ||
    formatApiErrorMessage(record?.detail) ||
    statusText.trim() ||
    fallback
  return { code: code || status || 0, message }
}

export function apiErrorMessage(
  error: unknown,
  fallback = translateCurrent("common.requestFailed")
) {
  if (error instanceof ApiError) {
    return error.message
  }
  if (error instanceof Error && error.message) {
    return isTranslationKey(error.message)
      ? translateCurrent(error.message)
      : error.message
  }
  return fallback
}

export function throwApiError(
  code: number,
  message: string,
  silent = false
): never {
  if (!silent) {
    notifyError(message)
  }
  throw new ApiError(code, message)
}

type RequestOptions = RequestInit & {
  skipAuth?: boolean
  silent?: boolean
  onRequest?: () => void
}

async function readJsonBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) {
    return null
  }
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

async function fetchApi(
  path: string,
  init: RequestInit,
  headers: Headers,
  silent: boolean
) {
  const locale = getLocale()
  try {
    return await fetch(`${API_V1}${path}`, {
      ...init,
      headers,
      credentials: "include",
    })
  } catch (error) {
    if (isAbortError(error)) {
      throw error
    }
    throwApiError(0, translate(locale, "common.networkError"), silent)
  }
}

function stripRequestOptions(options: RequestOptions) {
  const {
    skipAuth = false,
    silent = false,
    onRequest: _onRequest,
    ...init
  } = options
  void _onRequest
  return { skipAuth, silent, init }
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  options = { ...options, signal: dataSourceSignal(options.signal) }
  options.signal!.throwIfAborted()
  const source = currentAccountSource()
  const method = (options.method ?? "GET").toUpperCase()
  if (
    method !== "GET" &&
    !path.startsWith("/auth/") &&
    !options.skipAuth &&
    useHistoryCacheStatusStore.getState().offline
  )
    throwApiError(
      0,
      translateCurrent("common.historyOfflineReadOnly"),
      options.silent ?? false
    )
  const cacheable =
    method === "GET" &&
    !options.skipAuth &&
    source !== null &&
    typeof window !== "undefined" &&
    Boolean(window.buddyDesktop?.historyCache) &&
    isHistoryCachePath(path)
  const revision = source ? historyCacheRevision(source) : 0
  try {
    const value = await remoteApiRequest<T>(path, {
      ...options,
      silent: cacheable || options.silent,
    })
    options.signal!.throwIfAborted()
    if (cacheable && source) {
      markHistoryOnline()
      await writeHistoryCache(source, path, value, revision)
      options.signal!.throwIfAborted()
    } else if (
      source &&
      method !== "GET" &&
      path.startsWith("/conversations")
    ) {
      await invalidateHistoryCache(
        source,
        path,
        method === "DELETE" && /^\/conversations\/[^/?]+(?:\?.*)?$/.test(path)
      )
      options.signal!.throwIfAborted()
    }
    return value
  } catch (error) {
    options.signal!.throwIfAborted()
    if (cacheable && source && error instanceof ApiError) {
      if (error.code === 0) {
        const snapshot = await readHistoryCache<T>(source, path)
        options.signal!.throwIfAborted()
        if (snapshot && historyCacheRevision(source) === revision) {
          markHistoryOffline(snapshot.cachedAt)
          return snapshot.value
        }
      } else if (error.code === 404) {
        await invalidateHistoryCache(source, path)
        options.signal!.throwIfAborted()
      }
      if (!options.silent) notifyError(error.message)
    }
    throw error
  }
}

async function remoteApiRequest<T>(
  path: string,
  options: RequestOptions
): Promise<T> {
  const { skipAuth, silent, init } = stripRequestOptions(options)
  const headers = new Headers(options.headers)
  if (
    options.body &&
    !headers.has("Content-Type") &&
    !(options.body instanceof FormData)
  ) {
    headers.set("Content-Type", "application/json")
  }

  const locale = getLocale()
  const fallback = translate(locale, "common.requestFailed")
  const token = getAccessToken()
  if (token && !skipAuth) {
    headers.set("Authorization", `Bearer ${token}`)
  }
  headers.set("Accept-Language", locale)

  const response = await fetchApi(path, init, headers, silent)
  options.signal!.throwIfAborted()

  if (response.status === 401 && !skipAuth) {
    const nextToken = await refreshAccessToken(options.signal!)
    options.signal!.throwIfAborted()
    if (nextToken) {
      headers.set("Authorization", `Bearer ${nextToken}`)
      return remoteApiRequest<T>(path, { ...options, headers, skipAuth: true })
    }
    throwApiError(
      401,
      translate(locale, "common.sessionExpiredPleaseSignInAgain"),
      silent
    )
  }

  const payload = await readJsonBody(response)
  options.signal!.throwIfAborted()
  const record =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : null
  const failed =
    !response.ok || (typeof record?.code === "number" && record.code !== 200)
  if (failed || !record || !("data" in record)) {
    const parsed = parseApiError(
      payload,
      response.status,
      response.statusText,
      fallback
    )
    throwApiError(parsed.code, parsed.message, silent)
  }
  return (payload as ApiResponse<T>).data
}

export async function apiBlobRequest(
  path: string,
  options: RequestOptions = {}
): Promise<Blob> {
  options = { ...options, signal: dataSourceSignal(options.signal) }
  options.signal!.throwIfAborted()
  const { skipAuth, silent, init } = stripRequestOptions(options)
  const headers = new Headers(options.headers)
  if (
    options.body &&
    !headers.has("Content-Type") &&
    !(options.body instanceof FormData)
  ) {
    headers.set("Content-Type", "application/json")
  }
  const locale = getLocale()
  const token = getAccessToken()
  if (token && !skipAuth) headers.set("Authorization", `Bearer ${token}`)
  headers.set("Accept-Language", locale)
  const response = await fetchApi(path, init, headers, silent)
  options.signal!.throwIfAborted()
  if (response.status === 401 && !skipAuth) {
    const nextToken = await refreshAccessToken(options.signal!)
    options.signal!.throwIfAborted()
    if (nextToken) {
      headers.set("Authorization", `Bearer ${nextToken}`)
      return apiBlobRequest(path, { ...options, headers, skipAuth: true })
    }
    throwApiError(
      401,
      translate(locale, "common.sessionExpiredPleaseSignInAgain"),
      silent
    )
  }
  if (!response.ok) {
    const payload = await readJsonBody(response)
    const parsed = parseApiError(
      payload,
      response.status,
      response.statusText,
      translate(locale, "common.requestFailed")
    )
    throwApiError(parsed.code, parsed.message, silent)
  }
  const blob = await response.blob()
  options.signal!.throwIfAborted()
  return blob
}

export async function apiStream(
  path: string,
  options: RequestOptions = {}
): Promise<Response> {
  options = { ...options, signal: dataSourceSignal(options.signal) }
  options.signal!.throwIfAborted()
  if (
    (options.method ?? "GET").toUpperCase() !== "GET" &&
    useHistoryCacheStatusStore.getState().offline
  )
    throwApiError(
      0,
      translateCurrent("common.historyOfflineReadOnly"),
      options.silent ?? false
    )
  const response = await remoteApiStream(path, options)
  const source = currentAccountSource()
  if (
    source &&
    (options.method ?? "GET").toUpperCase() !== "GET" &&
    response.ok &&
    response.headers.get("Content-Type")?.includes("text/event-stream")
  ) {
    if (path.startsWith("/conversations/")) {
      await invalidateHistoryCache(source, path)
    } else if (typeof options.body === "string") {
      let threadId: unknown
      try {
        threadId = (JSON.parse(options.body) as { threadId?: unknown }).threadId
      } catch {
        // 非会话流不需要使历史缓存失效
      }
      if (
        typeof threadId === "string" &&
        /^[a-zA-Z0-9_-]{1,128}$/.test(threadId)
      )
        await invalidateHistoryCache(source, `/conversations/${threadId}`)
    }
    options.signal!.throwIfAborted()
  }
  return response
}

async function remoteApiStream(
  path: string,
  options: RequestOptions = {}
): Promise<Response> {
  options = {
    ...options,
    signal: options.signal ?? new AbortController().signal,
  }
  options.signal!.throwIfAborted()
  const { skipAuth, silent, init } = stripRequestOptions(options)
  const headers = new Headers(options.headers)
  if (
    options.body &&
    !headers.has("Content-Type") &&
    !(options.body instanceof FormData)
  ) {
    headers.set("Content-Type", "application/json")
  }

  const locale = getLocale()
  const token = getAccessToken()
  if (token && !skipAuth) {
    headers.set("Authorization", `Bearer ${token}`)
  }
  headers.set("Accept-Language", locale)

  options.onRequest?.()
  const response = await fetchApi(path, init, headers, silent)
  options.signal!.throwIfAborted()

  if (response.status === 401 && !skipAuth) {
    const nextToken = await refreshAccessToken(options.signal!)
    options.signal!.throwIfAborted()
    if (nextToken) {
      headers.set("Authorization", `Bearer ${nextToken}`)
      return remoteApiStream(path, {
        ...options,
        headers,
        skipAuth: true,
        silent,
      })
    }
    throwApiError(
      401,
      translate(locale, "common.sessionExpiredPleaseSignInAgain"),
      silent
    )
  }

  return response
}
