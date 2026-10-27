import { create } from "zustand"
import type { ChatMessage } from "@/lib/types"

export type LiveConversationSearchEntry = {
  source: string
  conversationId: string
  messages: readonly ChatMessage[]
}

// 只保存已挂载栏的实时快照；每栏独立清理，避免分屏同会话互相覆盖
export const useLiveConversationSearch = create<{
  entries: ReadonlyMap<symbol, LiveConversationSearchEntry>
  update: (owner: symbol, entry: LiveConversationSearchEntry) => void
  remove: (owner: symbol) => void
}>((set) => ({
  entries: new Map(),
  update: (owner, entry) =>
    set((state) => {
      const previous = state.entries.get(owner)
      if (
        previous?.source === entry.source &&
        previous.conversationId === entry.conversationId &&
        previous.messages === entry.messages
      )
        return state
      const entries = new Map(state.entries)
      entries.delete(owner)
      entries.set(owner, entry)
      return { entries }
    }),
  remove: (owner) =>
    set((state) => {
      if (!state.entries.has(owner)) return state
      const entries = new Map(state.entries)
      entries.delete(owner)
      return { entries }
    }),
}))
