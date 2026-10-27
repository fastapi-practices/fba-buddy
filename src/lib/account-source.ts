import { create } from "zustand"
import type { StateStorage } from "zustand/middleware"

import { API_V1 } from "@/lib/config"
import { useSessionStore } from "@/lib/session"
import type { AccountSource } from "@/shared/account-source"

export const useAccountSourceStore = create<{
  ready: boolean
  epoch: number
  error: string | null
  account: string
}>(() => ({ ready: false, epoch: 0, error: null, account: "anonymous" }))

let sourceController = new AbortController()
let persistencePaused = false

export function currentAccountSource(): AccountSource | null {
  const user = useSessionStore.getState().user
  if (!user) return null
  const href = typeof window === "undefined" ? undefined : window.location?.href
  return {
    backendUrl: href ? new URL(API_V1, href).href : API_V1,
    accountId: String(user.id),
  }
}

export function pauseSourcePersistence(paused: boolean) {
  persistencePaused = paused
}

export function sourceStorageKey(name: string) {
  return `${name}.account.${encodeURIComponent(API_V1)}.${encodeURIComponent(useAccountSourceStore.getState().account)}`
}

export const sourceStorage: StateStorage = {
  getItem: (name) => {
    if (typeof localStorage === "undefined") return null
    return localStorage.getItem(sourceStorageKey(name))
  },
  setItem: (name, value) => {
    if (!persistencePaused && typeof localStorage !== "undefined")
      localStorage.setItem(sourceStorageKey(name), value)
  },
  removeItem: (name) => {
    if (!persistencePaused && typeof localStorage !== "undefined")
      localStorage.removeItem(sourceStorageKey(name))
  },
}

export function dataSourceKey() {
  const { account, epoch } = useAccountSourceStore.getState()
  return `${API_V1}:${account}:${epoch}`
}

export function dataSourceSignal(signal?: AbortSignal | null) {
  return signal
    ? AbortSignal.any([signal, sourceController.signal])
    : sourceController.signal
}

export function beginDataSourceChange() {
  sourceController.abort(new DOMException("账号已切换", "AbortError"))
  sourceController = new AbortController()
  useAccountSourceStore.setState((state) => ({
    ready: false,
    epoch: state.epoch + 1,
    error: null,
  }))
}
