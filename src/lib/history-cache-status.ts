import { create } from "zustand"

export const useHistoryCacheStatusStore = create<{
  offline: boolean
  cachedAt: string | null
}>(() => ({ offline: false, cachedAt: null }))
