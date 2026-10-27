import { createContext, useContext, type KeyboardEvent } from "react"
import type { QueueItemState } from "@/features/chat/thread-types"

export type QueueComposer = {
  editing: string | null
  busy: boolean
  error: string
  begin: (item: QueueItemState) => void
  cancel: () => void
  save: () => Promise<void>
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
}
export const QueueComposerContext = createContext<QueueComposer | null>(null)
export const useQueueComposer = () => useContext(QueueComposerContext)
