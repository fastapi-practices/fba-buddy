import { afterAll, beforeEach, expect, it, vi } from "vitest"

const saved = vi.hoisted(() => {
  const values = new Map<string, string>()
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  })
  return values
})

import { sourceStorageKey, useAccountSourceStore } from "@/lib/account-source"
import {
  rightSidebarForMode,
  useRightSidebarStore,
} from "./right-sidebar-store"

beforeEach(() => {
  saved.clear()
  useAccountSourceStore.setState({ account: "sidebar-account" })
  useRightSidebarStore.setState(useRightSidebarStore.getInitialState(), true)
})
afterAll(() => vi.unstubAllGlobals())

it("reopening an existing panel selects it without duplicating its tab", () => {
  const store = useRightSidebarStore.getState()
  store.addPanel("chat-a", "chat")
  store.addPanel("chat-a", "diff", "right")
  store.addPanel("chat-a", "chat")
  expect(useRightSidebarStore.getState().layouts["chat-a"]).toMatchObject({
    panels: ["chat", "diff"],
    activePanel: "chat",
    diffPane: "right",
  })
})

it("Work and Chat expose side chat while preserving Coding's Diff selection", () => {
  const store = useRightSidebarStore.getState()
  store.addPanel("chat-a", "chat")
  store.addPanel("chat-a", "diff", "right")
  const layout = useRightSidebarStore.getState().layouts["chat-a"]
  for (const mode of ["chat", "work"] as const)
    expect(rightSidebarForMode(layout, mode)).toMatchObject({
      panels: ["chat"],
      activePanel: "chat",
    })
  expect(rightSidebarForMode(layout, "coding")).toMatchObject({
    panels: ["chat", "diff"],
    activePanel: "diff",
    diffPane: "right",
  })
})

it("collapsing preserves tabs and selection but exits maximized mode", () => {
  const store = useRightSidebarStore.getState()
  store.addPanel("chat-a", "chat")
  store.addPanel("chat-a", "diff")
  store.setMaximized("chat-a", true)
  store.setOpen("chat-a", false)
  store.setOpen("chat-a", true)
  expect(useRightSidebarStore.getState().layouts["chat-a"]).toMatchObject({
    open: true,
    maximized: false,
    panels: ["chat", "diff"],
    activePanel: "diff",
  })
})

it("closing the side chat returns its Diff target to the main chat", () => {
  const store = useRightSidebarStore.getState()
  store.addPanel("chat-a", "chat")
  store.addPanel("chat-a", "diff", "right")
  store.closePanel("chat-a", "chat")
  expect(useRightSidebarStore.getState().layouts["chat-a"]).toMatchObject({
    panels: ["diff"],
    activePanel: "diff",
    diffPane: "left",
  })
  store.closePanel("chat-a", "diff")
  expect(useRightSidebarStore.getState().layouts["chat-a"]).toMatchObject({
    open: true,
    panels: [],
    activePanel: null,
  })
})

it("reordering tabs preserves the active panel and other conversations", () => {
  const store = useRightSidebarStore.getState()
  store.addPanel("chat-a", "chat")
  store.addPanel("chat-a", "diff")
  store.addPanel("chat-b", "chat")
  store.movePanel("chat-a", "diff", "chat")
  expect(useRightSidebarStore.getState().layouts["chat-a"]).toMatchObject({
    panels: ["diff", "chat"],
    activePanel: "diff",
  })
  expect(useRightSidebarStore.getState().layouts["chat-b"]).toMatchObject({
    panels: ["chat"],
    activePanel: "chat",
  })
})

it("restores each conversation's panels from account storage without restoring maximization", async () => {
  const store = useRightSidebarStore.getState()
  store.addPanel("chat-a", "chat")
  store.addPanel("chat-b", "diff")
  store.setMaximized("chat-b", true)
  const key = sourceStorageKey("fba-buddy.right-sidebar")
  const persisted = saved.get(key)!
  useRightSidebarStore.setState(useRightSidebarStore.getInitialState(), true)
  saved.set(key, persisted)
  await useRightSidebarStore.persist.rehydrate()
  expect(useRightSidebarStore.getState().layouts["chat-a"].activePanel).toBe(
    "chat"
  )
  expect(useRightSidebarStore.getState().layouts["chat-b"]).toMatchObject({
    activePanel: "diff",
    maximized: false,
  })
  useAccountSourceStore.setState({ account: "another-account" })
  useRightSidebarStore.setState(useRightSidebarStore.getInitialState(), true)
  await useRightSidebarStore.persist.rehydrate()
  expect(useRightSidebarStore.getState().layouts).toEqual({})
})
