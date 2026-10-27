import { create } from "zustand"

export const useSettingsSearchStore = create<{
  query: string
  setQuery: (query: string) => void
}>((set) => ({
  query: "",
  setQuery: (query) => set({ query }),
}))
