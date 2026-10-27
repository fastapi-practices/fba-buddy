import { useQuery } from "@tanstack/react-query"
import { create } from "zustand"

import { listKnowledgeBases } from "@/api"
import { queryKeys } from "@/api/query-keys"
import { dataSourceKey, useAccountSourceStore } from "@/lib/account-source"
import type { KnowledgeBaseItem } from "@/lib/types"

export const useKnowledgeWorkspaceStore = create<{
  source: string | null
  selectedId: number | null
  selectBase: (id: number) => void
}>((set) => ({
  source: null,
  selectedId: null,
  selectBase: (id) => set({ source: dataSourceKey(), selectedId: id }),
}))

export function useKnowledgeBases() {
  const source = useAccountSourceStore(dataSourceKey)
  return useQuery({
    queryKey: [...queryKeys.knowledgeBases(), source],
    queryFn: listKnowledgeBases,
  })
}

export function useSelectedKnowledgeBase(bases: KnowledgeBaseItem[]) {
  const source = useAccountSourceStore(dataSourceKey)
  const selectedId = useKnowledgeWorkspaceStore((state) =>
    state.source === source ? state.selectedId : null
  )
  return bases.find((base) => base.id === selectedId) ?? bases[0]
}
