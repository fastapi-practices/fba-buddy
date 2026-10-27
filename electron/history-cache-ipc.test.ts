import type { IpcMain, IpcMainInvokeEvent } from "electron"
import { expect, it, vi } from "vitest"
import { DESKTOP_CHANNELS } from "../src/shared/desktop"
import type { AccountSource } from "../src/shared/account-source"
import type { HistoryCacheRequest } from "../src/shared/history-cache"
import { registerHistoryCacheIpc } from "./history-cache-ipc"

function fixture() {
  let invoke!: (
    event: IpcMainInvokeEvent,
    request: HistoryCacheRequest
  ) => Promise<unknown>
  const cache = {
    request: vi.fn(() => ({
      value: { title: "server" },
      cachedAt: "2026-10-10",
    })),
    close: vi.fn(),
  }
  const ipc = {
    handle: (channel: string, listener: typeof invoke) => {
      expect(channel).toBe(DESKTOP_CHANNELS.historyCache)
      invoke = listener
    },
  } as Pick<IpcMain, "handle">
  const assertSender = (event: IpcMainInvokeEvent) => {
    if (event.senderFrame !== event.sender.mainFrame)
      throw new Error("untrusted")
  }
  const assertSource = (source: AccountSource) => {
    if (source?.accountId !== "1") throw new Error("wrong account")
  }
  const onDelete = vi.fn(async () => {})
  const bridge = registerHistoryCacheIpc(
    ipc,
    cache,
    assertSender,
    assertSource,
    onDelete
  )
  const frame = {}
  const event = {
    senderFrame: frame,
    sender: { mainFrame: frame, isDestroyed: () => false },
  } as unknown as IpcMainInvokeEvent
  const source = { backendUrl: "https://one.test/api/v1", accountId: "1" }
  return { invoke, cache, onDelete, bridge, event, source }
}

it("checks the renderer and current account before reading or writing cached history", async () => {
  const { invoke, cache, event, source } = fixture()
  const request = { action: "get" as const, source, path: "/conversations" }
  await expect(invoke(event, request)).resolves.toEqual({
    value: { title: "server" },
    cachedAt: "2026-10-10",
  })
  await expect(
    invoke({ ...event, senderFrame: {} } as IpcMainInvokeEvent, request)
  ).rejects.toThrow("untrusted")
  await expect(
    invoke(event, { ...request, source: { ...source, accountId: "2" } })
  ).rejects.toThrow("wrong account")
  expect(cache.request).toHaveBeenCalledTimes(1)
})

it("cleans execution metadata on deletion, while ordinary invalidation leaves it intact", async () => {
  const { invoke, onDelete, event, source } = fixture()
  await invoke(event, {
    action: "invalidate-conversation",
    source,
    conversationId: "one",
  })
  expect(onDelete).not.toHaveBeenCalled()
  await invoke(event, {
    action: "delete-conversation",
    source,
    conversationId: "one",
  })
  expect(onDelete).toHaveBeenCalledWith(source, "one")
})

it("closes once and refuses later operations", async () => {
  const { invoke, cache, bridge, event, source } = fixture()
  bridge.close()
  bridge.close()
  expect(cache.close).toHaveBeenCalledOnce()
  await expect(
    invoke(event, { action: "get", source, path: "/conversations" })
  ).rejects.toThrow("已关闭")
  expect(cache.request).not.toHaveBeenCalled()
})
