import { useConversationAgentMode } from "@/features/chat/conversation-mode"
import { useSelectionStore } from "./selection-store"
import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"
import { useMemo } from "react"
import { sourceStorage } from "@/lib/account-source"
import type { AgentMode } from "@/lib/types"

export type RightSidebarPanel = "chat" | "diff"
export type ChatPaneSide = "left" | "right"

export type RightSidebarState = {
  open: boolean
  maximized: boolean
  panels: RightSidebarPanel[]
  activePanel: RightSidebarPanel | null
  diffPane: ChatPaneSide
}

export const EMPTY_RIGHT_SIDEBAR: RightSidebarState = {
  open: false,
  maximized: false,
  panels: [],
  activePanel: null,
  diffPane: "left",
}

type RightSidebarStore = {
  layouts: Record<string, RightSidebarState>
  setOpen: (hostKey: string, open: boolean) => void
  setMaximized: (hostKey: string, maximized: boolean) => void
  addPanel: (
    hostKey: string,
    panel: RightSidebarPanel,
    diffPane?: ChatPaneSide
  ) => void
  selectPanel: (hostKey: string, panel: RightSidebarPanel) => void
  closePanel: (hostKey: string, panel: RightSidebarPanel) => void
  movePanel: (
    hostKey: string,
    panel: RightSidebarPanel,
    over: RightSidebarPanel
  ) => void
}

export const useRightSidebarStore = create<RightSidebarStore>()(
  persist(
    (set) => {
      const update = (
        hostKey: string,
        change: (state: RightSidebarState) => RightSidebarState
      ) =>
        set((store) => ({
          layouts: {
            ...store.layouts,
            [hostKey]: change(store.layouts[hostKey] ?? EMPTY_RIGHT_SIDEBAR),
          },
        }))
      return {
        layouts: {},
        setOpen: (hostKey, open) =>
          update(hostKey, (state) => ({
            ...state,
            open,
            maximized: open && state.maximized,
          })),
        setMaximized: (hostKey, maximized) =>
          update(hostKey, (state) => ({ ...state, maximized })),
        addPanel: (hostKey, panel, diffPane = "left") =>
          update(hostKey, (state) => ({
            ...state,
            open: true,
            panels: state.panels.includes(panel)
              ? state.panels
              : [...state.panels, panel],
            activePanel: panel,
            diffPane: panel === "diff" ? diffPane : state.diffPane,
          })),
        selectPanel: (hostKey, panel) =>
          update(hostKey, (state) =>
            state.panels.includes(panel)
              ? { ...state, activePanel: panel }
              : state
          ),
        closePanel: (hostKey, panel) =>
          update(hostKey, (state) => {
            const panels = state.panels.filter((item) => item !== panel)
            const index = state.panels.indexOf(panel)
            return {
              ...state,
              panels,
              maximized: panels.length > 0 && state.maximized,
              activePanel:
                state.activePanel === panel
                  ? (panels[Math.max(0, index - 1)] ?? null)
                  : state.activePanel,
              diffPane: panel === "chat" ? "left" : state.diffPane,
            }
          }),
        movePanel: (hostKey, panel, over) =>
          update(hostKey, (state) => {
            const from = state.panels.indexOf(panel)
            const to = state.panels.indexOf(over)
            if (from < 0 || to < 0 || from === to) return state
            const panels = [...state.panels]
            panels.splice(from, 1)
            panels.splice(to, 0, panel)
            return { ...state, panels }
          }),
      }
    },
    {
      name: "fba-buddy.right-sidebar",
      storage: createJSONStorage(() => sourceStorage),
      partialize: (state) => ({
        layouts: Object.fromEntries(
          Object.entries(state.layouts).map(([key, layout]) => [
            key,
            { ...layout, maximized: false },
          ])
        ),
      }),
    }
  )
)

export function rightSidebarForMode(
  layout: RightSidebarState,
  mode: AgentMode
) {
  if (mode === "coding") return layout
  const panels: RightSidebarPanel[] = layout.panels.filter(
    (panel) => panel !== "diff"
  )
  return {
    ...layout,
    panels,
    activePanel:
      layout.activePanel && panels.includes(layout.activePanel)
        ? layout.activePanel
        : (panels[0] ?? null),
    maximized: panels.length > 0 && layout.maximized,
  }
}

export function useRightSidebar(hostKey: string) {
  const mainId = useSelectionStore((state) => state.selectedConversationId)
  const sideId = useSelectionStore((state) => state.sidebarConversationId)
  const mode = useConversationAgentMode(mainId, hostKey)
  const sideMode = useConversationAgentMode(sideId, "sidebar-chat")
  const layout = useRightSidebarStore(
    (state) => state.layouts[hostKey] ?? EMPTY_RIGHT_SIDEBAR
  )
  const sidebarMode =
    layout.panels.includes("chat") && sideMode === "coding" ? "coding" : mode
  return useMemo(
    () => rightSidebarForMode(layout, sidebarMode),
    [layout, sidebarMode]
  )
}
