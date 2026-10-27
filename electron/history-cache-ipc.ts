import type { IpcMain, IpcMainInvokeEvent } from "electron"
import { DESKTOP_CHANNELS } from "../src/shared/desktop"
import type {
  HistoryCacheRequest,
  HistoryCacheSnapshot,
} from "../src/shared/history-cache"
import type { AccountSource } from "../src/shared/account-source"

export function registerHistoryCacheIpc(
  ipc: Pick<IpcMain, "handle">,
  cache: {
    request: (request: HistoryCacheRequest) => HistoryCacheSnapshot | null
    close: () => void
  },
  assertSender: (event: IpcMainInvokeEvent) => void,
  assertSource: (source: AccountSource) => void,
  onDeleteConversation?: (
    source: AccountSource,
    conversationId: string
  ) => Promise<void>
) {
  let closed = false
  ipc.handle(
    DESKTOP_CHANNELS.historyCache,
    async (event, request: HistoryCacheRequest) => {
      assertSender(event)
      if (closed || event.sender.isDestroyed())
        throw new Error("历史缓存已关闭")
      assertSource(request?.source)
      const result = cache.request(request)
      if (request.action === "delete-conversation")
        await onDeleteConversation?.(request.source, request.conversationId)
      return result
    }
  )
  return {
    close() {
      if (closed) return
      closed = true
      cache.close()
    },
  }
}
