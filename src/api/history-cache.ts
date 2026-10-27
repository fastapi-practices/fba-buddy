import type { AccountSource } from "@/shared/account-source"
import type { HistoryCacheSnapshot } from "@/shared/history-cache"
import { useHistoryCacheStatusStore } from "@/lib/history-cache-status"

const revisions = new Map<string, number>()

function sourceKey(source: AccountSource) {
  return JSON.stringify(source)
}

export function historyCacheRevision(source: AccountSource) {
  return revisions.get(sourceKey(source)) ?? 0
}

export function isHistoryCachePath(path: string) {
  const name = new URL(path, "http://history").pathname
  return (
    name === "/conversations" ||
    name === "/conversations/search" ||
    /^\/conversations\/[^/]+(?:\/messages(?:\/search|\/[^/]+\/versions)?|\/plan)?$/.test(
      name
    )
  )
}

export async function readHistoryCache<T>(source: AccountSource, path: string) {
  try {
    const snapshot = (await window.buddyDesktop?.historyCache({
      action: "get",
      source,
      path,
    })) as HistoryCacheSnapshot | null | undefined
    return snapshot as (HistoryCacheSnapshot & { value: T }) | null | undefined
  } catch {
    return null
  }
}

export async function writeHistoryCache(
  source: AccountSource,
  path: string,
  value: unknown,
  revision: number
) {
  if (historyCacheRevision(source) !== revision) return
  try {
    await window.buddyDesktop?.historyCache({
      action: "put",
      source,
      path,
      value,
    })
  } catch {
    // 缓存写入失败不影响已完成的服务端请求
  }
}

export async function invalidateHistoryCache(
  source: AccountSource,
  path: string,
  deleted = false
) {
  revisions.set(sourceKey(source), historyCacheRevision(source) + 1)
  const match = /^\/conversations\/([^/]+)/.exec(
    new URL(path, "http://history").pathname
  )
  try {
    await window.buddyDesktop?.historyCache(
      match && match[1] !== "search"
        ? {
            action: deleted ? "delete-conversation" : "invalidate-conversation",
            source,
            conversationId: decodeURIComponent(match[1]!),
          }
        : { action: "clear", source }
    )
  } catch {
    // 缓存清理失败不改变服务端的操作结果
  }
}

export function markHistoryOnline() {
  useHistoryCacheStatusStore.setState({ offline: false, cachedAt: null })
}

export function markHistoryOffline(cachedAt: string) {
  useHistoryCacheStatusStore.setState({ offline: true, cachedAt })
}
