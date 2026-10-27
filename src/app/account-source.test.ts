import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { resetAccountState, synchronizeAccount } from "@/app/account-source"
import { useComposerStore } from "@/features/chat/composer-store"
import { useConversationTuningStore } from "@/features/chat/conversation-tuning"
import { useSelectionStore } from "@/features/shell/selection-store"
import {
  dataSourceSignal,
  pauseSourcePersistence,
  sourceStorageKey,
  useAccountSourceStore,
} from "@/lib/account-source"
import { useSessionStore } from "@/lib/session"
import type { AuthUser } from "@/lib/types"

beforeEach(async () => {
  useSessionStore.setState({ user: null })
  useAccountSourceStore.setState({ account: "anonymous", ready: true })
  const saved = new Map<string, string>()
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => saved.set(key, value),
    removeItem: (key: string) => saved.delete(key),
  })
  vi.stubGlobal("window", { location: { hash: "#/chat" } })
  await resetAccountState()
})

afterEach(() => {
  pauseSourcePersistence(false)
  useSessionStore.setState({ user: null })
  vi.unstubAllGlobals()
})

it("aborts account A requests and restores only account B preferences", async () => {
  useSessionStore.setState({ user: { id: 1 } as AuthUser })
  await synchronizeAccount()
  useComposerStore.getState().setModel(11, "account-a")
  useComposerStore.getState().setDraft("account-a secret")
  useSelectionStore.getState().setSelectedConversationId("a-conversation")
  useSelectionStore.getState().markConversationUnread("a-unread")
  useConversationTuningStore
    .getState()
    .patchTuning("same-id", { temperature: 0.9 })
  const oldRequest = dataSourceSignal()
  const oldKey = sourceStorageKey("test")
  useSessionStore.setState({ user: { id: 2 } as AuthUser })
  await synchronizeAccount()
  expect(oldRequest.aborted).toBe(true)
  expect(sourceStorageKey("test")).not.toBe(oldKey)
  expect(useComposerStore.getState().draft).toBe("")
  expect(useComposerStore.getState().provider_id).toBe(0)
  expect(useSelectionStore.getState().selectedConversationId).toBeNull()
  expect(useConversationTuningStore.getState().byId).toEqual({})
  useComposerStore.getState().setModel(22, "account-b")
  useSessionStore.setState({ user: { id: 1 } as AuthUser })
  await synchronizeAccount()
  expect(useComposerStore.getState().model_id).toBe("account-a")
  expect(useSelectionStore.getState().selectedConversationId).toBeNull()
  expect(useSelectionStore.getState().unreadConversationIds).toEqual([
    "a-unread",
  ])
  expect(
    useConversationTuningStore.getState().byId["same-id"].temperature
  ).toBe(0.9)
})

it("preserves an unsent guest draft when signing in", async () => {
  useComposerStore.getState().setDraft("prompt written before sign-in")
  useSessionStore.setState({ user: { id: 8 } as AuthUser })
  await synchronizeAccount()
  expect(useAccountSourceStore.getState().account).toBe("8")
  expect(useComposerStore.getState().draft).toBe(
    "prompt written before sign-in"
  )
  expect(useSelectionStore.getState().selectedConversationId).toBeNull()
})

it("restores preferences from the current account storage key", async () => {
  useAccountSourceStore.setState({ account: "8" })
  const key = sourceStorageKey("fba-buddy.composer")
  localStorage.setItem(
    key,
    JSON.stringify({
      state: { provider_id: 8, model_id: "saved-model" },
      version: 0,
    })
  )
  await resetAccountState()
  expect(useComposerStore.getState().model_id).toBe("saved-model")
})
