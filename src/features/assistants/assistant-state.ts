import { useQuery } from "@tanstack/react-query"
import { create } from "zustand"

import { listAssistants, patchConversationWorkspace } from "@/api"
import { queryKeys } from "@/api/query-keys"
import { startDraftChat } from "@/app/navigation"
import type { AssistantsSection } from "@/features/assistants/assistant-nav"
import { useComposerStore } from "@/features/chat/composer-store"
import { useSelectionStore } from "@/features/shell/selection-store"
import type { AssistantSortType } from "@/lib/types"

export const useAssistantSearchStore = create<{
  query: string
  setQuery: (query: string) => void
  createKind: AssistantsSection | null
  openCreate: (kind: AssistantsSection) => void
  closeCreate: () => void
}>((set) => ({
  query: "",
  setQuery: (query) => set({ query }),
  createKind: null,
  openCreate: (kind) => set({ createKind: kind }),
  closeCreate: () => set({ createKind: null }),
}))

export function useAssistants(sortType: AssistantSortType = "comprehensive") {
  return useQuery({
    queryKey: queryKeys.assistants(sortType),
    queryFn: () => listAssistants(sortType),
  })
}

export async function selectConversationAssistant(
  id: number | null,
  extra?: { opening?: string }
) {
  const ui = useSelectionStore.getState()
  if (id === ui.selectedAssistantId) {
    return
  }
  if (ui.selectedConversationId && id == null) {
    await patchConversationWorkspace(ui.selectedConversationId, {
      assistant_id: null,
    })
    ui.setSelectedAssistantId(null)
    return
  }
  ui.setSelectedAssistantId(id)
  if (ui.selectedConversationId && id != null) {
    startDraftChat()
  }
  const opening = extra?.opening?.trim()
  if (opening) {
    useComposerStore.getState().setDraft(opening)
  }
}

export function startAssistantChat(id: number, opening?: string) {
  startDraftChat()
  useSelectionStore.getState().setSelectedAssistantId(id)
  useComposerStore.getState().setDraft(opening?.trim() ?? "")
}
