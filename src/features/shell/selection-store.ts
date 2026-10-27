import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"
import { sourceStorage } from "@/lib/account-source"
import type { ConversationMessageTarget } from "@/app/conversation-message-location"

type SidebarSearchTarget = {
  conversationId: string
  token: number
  target: ConversationMessageTarget
}

type SelectionState = {
  selectedProjectId: number | null
  selectedConversationId: string | null
  selectedAssistantId: number | null
  chatEpoch: number
  chatPaneKey: string
  query: string
  unreadConversationIds: string[]
  /* 对话焦点与右侧边栏的独立会话 */
  focusedChatPane: "left" | "right"
  sidebarConversationId: string | null
  sidebarSearchTarget: SidebarSearchTarget | null
  sidebarSearchToken: number
  setSelectedProjectId: (id: number | null) => void
  setSelectedConversationId: (id: string | null) => void
  setSelectedAssistantId: (id: number | null) => void
  openDraftChat: () => void
  setChatPaneKey: (key: string) => void
  setQuery: (query: string) => void
  setFocusedChatPane: (pane: "left" | "right") => void
  setSidebarConversationId: (
    id: string | null,
    target?: ConversationMessageTarget
  ) => void
  resetSidebarChat: () => void
  markConversationUnread: (id: string) => void
  markConversationRead: (id: string) => void
}

export const useSelectionStore = create<SelectionState>()(
  persist(
    (set) => ({
      selectedProjectId: null,
      selectedConversationId: null,
      selectedAssistantId: null,
      chatEpoch: 0,
      chatPaneKey: "draft-0",
      query: "",
      unreadConversationIds: [],
      focusedChatPane: "left",
      sidebarConversationId: null,
      sidebarSearchTarget: null,
      sidebarSearchToken: 0,
      setSelectedProjectId: (selectedProjectId) => set({ selectedProjectId }),
      setSelectedConversationId: (selectedConversationId) =>
        set((state) => ({
          selectedConversationId,
          unreadConversationIds: selectedConversationId
            ? state.unreadConversationIds.filter(
                (id) => id !== selectedConversationId
              )
            : state.unreadConversationIds,
        })),
      setSelectedAssistantId: (selectedAssistantId) =>
        set({ selectedAssistantId }),
      openDraftChat: () =>
        set((state) => {
          const chatEpoch = state.chatEpoch + 1
          return {
            selectedConversationId: null,
            chatEpoch,
            chatPaneKey: `draft-${chatEpoch}`,
          }
        }),
      setChatPaneKey: (chatPaneKey) => set({ chatPaneKey }),
      setQuery: (query) => set({ query }),
      setFocusedChatPane: (focusedChatPane) => set({ focusedChatPane }),
      setSidebarConversationId: (sidebarConversationId, target) =>
        set((state) => {
          const token =
            state.sidebarSearchToken + (target && sidebarConversationId ? 1 : 0)
          return {
            sidebarConversationId,
            sidebarSearchToken: token,
            sidebarSearchTarget:
              target && sidebarConversationId
                ? { conversationId: sidebarConversationId, token, target }
                : null,
          }
        }),
      /* 关闭侧栏对话标签时清空其会话与搜索定位 */
      resetSidebarChat: () =>
        set({
          focusedChatPane: "left",
          sidebarConversationId: null,
          sidebarSearchTarget: null,
        }),
      markConversationUnread: (id) =>
        set((state) =>
          state.unreadConversationIds.includes(id)
            ? state
            : { unreadConversationIds: [...state.unreadConversationIds, id] }
        ),
      markConversationRead: (id) =>
        set((state) => ({
          unreadConversationIds: state.unreadConversationIds.filter(
            (item) => item !== id
          ),
        })),
    }),
    {
      name: "fba-buddy.selection",
      storage: createJSONStorage(() => sourceStorage),
      partialize: (state) => ({
        unreadConversationIds: state.unreadConversationIds,
      }),
    }
  )
)
