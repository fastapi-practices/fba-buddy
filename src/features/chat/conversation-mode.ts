import { createContext, useContext } from "react"
import { create } from "zustand"
import { dataSourceKey, useAccountSourceStore } from "@/lib/account-source"
import { useSelectionStore } from "@/features/shell/selection-store"
import { useComposerStore } from "./composer-store"
import type { AgentMode } from "@/lib/types"

type ConversationModes = {
  modes: Record<string, AgentMode>
  drafts: Record<string, AgentMode>
  remember: (source: string, id: string, mode: AgentMode) => void
  lockDraft: (source: string, key: string, mode: AgentMode) => void
  clearDraft: (source: string, key: string) => void
}

export const useConversationModeStore = create<ConversationModes>((set) => ({
  modes: {},
  drafts: {},
  lockDraft: (source, key, mode) =>
    set((state) => ({
      drafts: { ...state.drafts, [`${source}:${key}`]: mode },
    })),
  clearDraft: (source, key) =>
    set((state) => {
      const drafts = { ...state.drafts }
      delete drafts[`${source}:${key}`]
      return { drafts }
    }),
  remember: (source, id, mode) =>
    set((state) => {
      const key = `${source}:${id}`
      return state.modes[key] === mode
        ? state
        : { modes: { ...state.modes, [key]: mode } }
    }),
}))

export const ConversationModeContext = createContext<AgentMode | null>(null)

export function conversationAgentMode(id: string | null | undefined) {
  return id
    ? useConversationModeStore.getState().modes[`${dataSourceKey()}:${id}`]
    : undefined
}

export function useConversationAgentMode(id: string | null, draftKey?: string) {
  const source = useAccountSourceStore(dataSourceKey)
  const mode = useConversationModeStore((state) =>
    id ? state.modes[`${source}:${id}`] : state.drafts[`${source}:${draftKey}`]
  )
  const draftMode = useComposerStore((state) => state.agent_mode ?? "work")
  return mode ?? (id ? "work" : draftMode)
}

export function useAgentMode() {
  const context = useContext(ConversationModeContext)
  const id = useSelectionStore((state) => state.selectedConversationId)
  const draftKey = useSelectionStore((state) => state.chatPaneKey)
  const mode = useConversationAgentMode(id, draftKey)
  return context ?? mode
}
