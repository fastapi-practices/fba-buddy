import { create } from "zustand"
import { persist } from "zustand/middleware"

import {
  normalizeShortcutOverrides,
  type ShortcutCombo,
  type ShortcutId,
  type ShortcutOverrides,
} from "@/features/shell/keyboard-shortcuts"

type ShortcutState = {
  overrides: ShortcutOverrides
  recording: boolean
  setRecording: (recording: boolean) => void
  setShortcut: (id: ShortcutId, combo: ShortcutCombo) => void
  clearShortcut: (id: ShortcutId) => void
  resetShortcut: (id: ShortcutId) => void
  resetAll: () => void
}

export const useShortcutStore = create<ShortcutState>()(
  persist(
    (set, get) => ({
      overrides: {},
      recording: false,
      setRecording: (recording) => set({ recording }),
      setShortcut: (id, combo) =>
        set({ overrides: { ...get().overrides, [id]: combo } }),
      clearShortcut: (id) =>
        set({ overrides: { ...get().overrides, [id]: null } }),
      resetShortcut: (id) => {
        const overrides = { ...get().overrides }
        delete overrides[id]
        set({ overrides })
      },
      resetAll: () => set({ overrides: {} }),
    }),
    {
      name: "fba-buddy.shortcuts",
      partialize: (state) => ({ overrides: state.overrides }),
      merge: (persisted, current) => ({
        ...current,
        overrides: normalizeShortcutOverrides(
          persisted && typeof persisted === "object" && "overrides" in persisted
            ? persisted.overrides
            : {}
        ),
      }),
    }
  )
)
