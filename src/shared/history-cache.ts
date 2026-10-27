import type { AccountSource } from "./account-source"

export type HistoryCacheSnapshot = {
  value: unknown
  cachedAt: string
}

export type HistoryCacheRequest = { source: AccountSource } & (
  | { action: "get"; path: string }
  | { action: "put"; path: string; value: unknown }
  | {
      action: "invalidate-conversation" | "delete-conversation"
      conversationId: string
    }
  | { action: "clear" }
)
