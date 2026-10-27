import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { polishChat } from "@/api"
import {
  cancelComposerPolish,
  polishComposerDraft,
  polishTextFromDraft,
  usePolishStore,
} from "@/features/chat/composer-polish"
import { useComposerStore } from "@/features/chat/composer-store"
import { useSelectionStore } from "@/features/shell/selection-store"
import { useSessionStore } from "@/lib/session"

vi.mock("@/api", () => ({ polishChat: vi.fn() }))

function pendingResult() {
  let resolve!: (value: { text: string }) => void
  const promise = new Promise<{ text: string }>((done) => {
    resolve = done
  })
  vi.mocked(polishChat).mockReturnValue(promise)
  return resolve
}

beforeEach(() => {
  useSessionStore.setState({ accessToken: "test-token" })
  vi.stubGlobal("window", { location: { hash: "#/chat" } })
  useComposerStore.setState({
    draft: "原稿",
    provider_id: 2,
    model_id: "model",
  })
  useSelectionStore.setState({
    chatPaneKey: "draft-test",
    selectedConversationId: null,
  })
  cancelComposerPolish()
  vi.clearAllMocks()
})

afterEach(() => {
  cancelComposerPolish()
  vi.unstubAllGlobals()
})

it("shares pending state and blocks duplicate polish requests", async () => {
  const resolve = pendingResult()
  const first = polishComposerDraft("原稿")
  expect(usePolishStore.getState().pending).toBe(true)
  expect(await polishComposerDraft("原稿")).toBeNull()
  expect(polishChat).toHaveBeenCalledTimes(1)
  expect(polishChat).toHaveBeenCalledWith(
    { text: "原稿", provider_id: 2, model_id: "model" },
    expect.any(AbortSignal)
  )
  resolve({ text: "润色结果" })
  expect(await first).toBe("润色结果")
  expect(useComposerStore.getState().draft).toBe("润色结果")
  expect(usePolishStore.getState().pending).toBe(false)
})

it("ignores late results after cancellation, even when the request resolves", async () => {
  const resolve = pendingResult()
  const first = polishComposerDraft("原稿")
  const signal = vi.mocked(polishChat).mock.calls[0]![1]!
  cancelComposerPolish()
  expect(signal.aborted).toBe(true)
  expect(usePolishStore.getState().pending).toBe(false)
  resolve({ text: "旧结果" })
  expect(await first).toBeNull()
  expect(useComposerStore.getState().draft).toBe("原稿")
})

it("does not overwrite edits or another conversation", async () => {
  const resolveEdit = pendingResult()
  const edit = polishComposerDraft("原稿")
  useComposerStore.getState().setDraft("新输入")
  resolveEdit({ text: "旧结果" })
  expect(await edit).toBeNull()
  expect(useComposerStore.getState().draft).toBe("新输入")

  useComposerStore.getState().setDraft("原稿")
  const resolveConversation = pendingResult()
  const conversation = polishComposerDraft("原稿")
  useSelectionStore.setState({ chatPaneKey: "another-conversation" })
  resolveConversation({ text: "另一条旧结果" })
  expect(await conversation).toBeNull()
  expect(useComposerStore.getState().draft).toBe("原稿")
})

it("clears the pending state when the polish request fails", async () => {
  vi.mocked(polishChat).mockRejectedValue(new Error("检测失败"))
  await expect(polishComposerDraft("原稿")).rejects.toThrow("检测失败")
  expect(usePolishStore.getState().pending).toBe(false)
  expect(useComposerStore.getState().draft).toBe("原稿")
})

it("does not apply a result after leaving the chat route", async () => {
  const resolve = pendingResult()
  const first = polishComposerDraft("原稿")
  window.location.hash = "#/settings/general"
  resolve({ text: "旧结果" })
  expect(await first).toBeNull()
  expect(useComposerStore.getState().draft).toBe("原稿")
})

it("strips an incomplete slash trigger from the text to polish", () => {
  expect(polishTextFromDraft("原稿 /")).toBe("原稿")
  expect(polishTextFromDraft("原稿 /polish")).toBe("原稿")
})

it("allows slash command removal without treating it as an edit", async () => {
  useComposerStore.getState().setDraft("原稿 /polish")
  const resolve = pendingResult()
  const result = polishComposerDraft("原稿", { allowCommandRemoval: true })
  useComposerStore.getState().setDraft("原稿")
  resolve({ text: "润色结果" })
  expect(await result).toBe("润色结果")
  expect(useComposerStore.getState().draft).toBe("润色结果")
})
