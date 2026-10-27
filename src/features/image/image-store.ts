import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

import type {
  ImageAspectRatio,
  ImageQuality,
  ImageSize,
} from "@/features/image/image-options"
import { sourceStorage } from "@/lib/account-source"
import type { ChatMessage } from "@/lib/types"

type ImageGenStatus = "streaming" | "complete" | "error"

export type ImageGenItem = {
  id: string
  conversationId: string
  prompt: string
  content: string
  urls: string[]
  status: ImageGenStatus
  error?: string
  createdAt: number
  size: ImageSize
  quality: ImageQuality
  aspect: ImageAspectRatio
  messages?: ChatMessage[]
  updatedAt?: number
  title?: string
  clientRunId?: string
}

type ImageGenState = {
  prompt: string
  items: ImageGenItem[]
  selectedConversationId: string | null
  setPrompt: (prompt: string) => void
  selectConversation: (conversationId: string | null) => void
  startNewConversation: () => void
  prependItem: (item: ImageGenItem) => void
  patchItem: (id: string, patch: Partial<ImageGenItem>) => void
  removeConversation: (conversationId: string) => void
  removeItem: (id: string) => void
  clearItems: () => void
}

export const useImageStore = create<ImageGenState>()(
  persist(
    (set) => ({
      prompt: "",
      items: [],
      selectedConversationId: null,
      setPrompt: (prompt) => set({ prompt }),
      selectConversation: (selectedConversationId) =>
        set({ selectedConversationId, prompt: "" }),
      startNewConversation: () =>
        set({ selectedConversationId: null, prompt: "" }),
      prependItem: (item) =>
        set((current) => ({
          items: [
            item,
            ...current.items.filter(
              (entry) => entry.conversationId !== item.conversationId
            ),
          ],
        })),
      patchItem: (id, patch) =>
        set((current) => ({
          items: current.items.map((item) =>
            item.id === id ? { ...item, ...patch } : item
          ),
        })),
      removeConversation: (conversationId) =>
        set((current) => ({
          items: current.items.filter(
            (item) => item.conversationId !== conversationId
          ),
          ...(current.selectedConversationId === conversationId
            ? { selectedConversationId: null, prompt: "" }
            : {}),
        })),
      removeItem: (id) =>
        set((current) => ({
          items: current.items.filter((item) => item.id !== id),
        })),
      clearItems: () => set({ items: [] }),
    }),
    {
      name: "fba-buddy.image-gen",
      storage: createJSONStorage(() => sourceStorage),
      partialize: (state) => ({
        prompt: state.prompt,
        selectedConversationId: state.selectedConversationId,
        items: state.items.map((item) => ({
          ...item,
          status:
            item.status === "streaming" ? ("complete" as const) : item.status,
          messages: undefined,
          clientRunId: undefined,
          content: "",
          urls: [],
        })),
      }),
    }
  )
)
