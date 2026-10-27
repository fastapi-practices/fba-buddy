import { create } from "zustand"

type ConversationActivityState = {
  generatingIds: string[]
  messageEpochById: Record<string, number>
  startGenerating: (conversationId: string) => void
  stopGenerating: (conversationId: string) => void
  bumpMessages: (conversationId: string) => void
}

export const useConversationActivityStore = create<ConversationActivityState>(
  (set) => ({
    generatingIds: [],
    messageEpochById: {},
    startGenerating: (conversationId) =>
      set((state) =>
        state.generatingIds.includes(conversationId)
          ? state
          : { generatingIds: [...state.generatingIds, conversationId] }
      ),
    stopGenerating: (conversationId) =>
      set((state) => ({
        generatingIds: state.generatingIds.filter(
          (id) => id !== conversationId
        ),
      })),
    bumpMessages: (conversationId) =>
      set((state) => ({
        messageEpochById: {
          ...state.messageEpochById,
          [conversationId]: (state.messageEpochById[conversationId] ?? 0) + 1,
        },
      })),
  })
)

export function setConversationGenerating(
  conversationId: string | null | undefined,
  generating: boolean
) {
  if (!conversationId) {
    return
  }
  const store = useConversationActivityStore.getState()
  if (generating) {
    store.startGenerating(conversationId)
  } else {
    store.stopGenerating(conversationId)
  }
}

export function conversationIsGenerating(
  conversationId: string,
  apiGenerating: boolean,
  generatingIds: readonly string[]
) {
  return apiGenerating || generatingIds.includes(conversationId)
}

export function useConversationGenerating(
  conversationId: string,
  apiGenerating: boolean
) {
  return useConversationActivityStore((state) =>
    conversationIsGenerating(conversationId, apiGenerating, state.generatingIds)
  )
}
