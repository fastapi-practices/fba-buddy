import { create } from "zustand"

type CronWorkspaceView = "record" | "create" | "edit"

export const useCronWorkspaceStore = create<{
  selectedId: number | null
  view: CronWorkspaceView
  revision: number
  selectRecord: (id: number) => void
  setView: (view: CronWorkspaceView) => void
  reset: () => void
}>((set) => ({
  selectedId: null,
  view: "record",
  revision: 0,
  selectRecord: (selectedId) =>
    set((state) => ({
      selectedId,
      view: "record",
      revision: state.revision + 1,
    })),
  setView: (view) => set((state) => ({ view, revision: state.revision + 1 })),
  reset: () =>
    set((state) => ({
      selectedId: null,
      view: "record",
      revision: state.revision + 1,
    })),
}))
