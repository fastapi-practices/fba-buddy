import { createContext } from "react"

import type { WorktreeDraft } from "@/features/chat/worktree-draft"
import type { DefaultModel, ProviderOption } from "@/lib/types"

export type ChatPaneSlots = {
  paneKey: string
  providers: ProviderOption[]
  defaultModel?: DefaultModel | null
  conversationId: string | null
  projectId: number | null
  onProjectChange: (projectId: number | null) => void
  projectDisabled: boolean
  worktreeDraft?: WorktreeDraft | null
}

export const ChatPaneSlotsContext = createContext<ChatPaneSlots>({
  paneKey: "",
  providers: [],
  conversationId: null,
  projectId: null,
  onProjectChange: () => undefined,
  projectDisabled: false,
})
