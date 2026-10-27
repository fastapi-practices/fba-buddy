import { createContext, useContext } from "react"

import type {
  ChatSubmission,
  ChatQueueAdapter,
  ThreadMessage,
  ThreadMessagePart,
} from "@/features/chat/thread-types"
import type { TranscriptQuoteAnchor } from "@/features/chat/transcript-state"
import type { ChatAttachment, ChatMessage } from "@/lib/types"

export type RuntimeThreadState = {
  messages: ThreadMessage[]
  rawMessages: ChatMessage[]
  isRunning: boolean
  isLoading: boolean
  isDisabled: boolean
}

export type RuntimeComposerState = {
  text: string
  attachments: ChatAttachment[]
  quote: TranscriptQuoteAnchor | null
}

type RuntimeViewportState = {
  element: { viewport: HTMLElement | null }
  height: { viewport: number }
}

export type ChatRuntimeValue = {
  thread: RuntimeThreadState
  composer: RuntimeComposerState & {
    setText: (text: string) => void
    setQuote: (quote: TranscriptQuoteAnchor | null | undefined) => void
    addFiles: (files: readonly File[]) => Promise<void>
    setAttachments: (attachments: ChatAttachment[]) => void
    removeAttachment: (id: string) => void
    clear: () => void
    openFilePicker: () => void
  }
  actions: {
    send: (submission?: ChatSubmission) => Promise<void>
    sendText: (text: string) => Promise<void>
    stop: () => Promise<void>
    reload: (messageId: string) => Promise<void>
    resumeToolCall: (payload: { toolCallId: string; payload: unknown }) => void
  }
  queue: ChatQueueAdapter | null
  viewport: RuntimeViewportState & {
    bind: (element: HTMLElement | null) => void
  }
}

export type MessageRuntimeValue = {
  message: ThreadMessage
  part?: ThreadMessagePart
  index: number
  isLast: boolean
}

export const ChatRuntimeContext = createContext<ChatRuntimeValue | null>(null)
export const ChatMessageContext = createContext<MessageRuntimeValue | null>(
  null
)
export const ChatPartContext = createContext<ThreadMessagePart | undefined>(
  undefined
)

export function useChatRuntime() {
  const value = useContext(ChatRuntimeContext)
  if (!value) {
    throw new Error("useChatRuntime must be used within ChatRuntimeProvider")
  }
  return value
}

export function useChatRuntimeState<T>(
  selector: (state: {
    thread: RuntimeThreadState
    composer: RuntimeComposerState
  }) => T
): T {
  const runtime = useChatRuntime()
  return selector({ thread: runtime.thread, composer: runtime.composer })
}

export function useChatMessageState<T>(
  selector: (state: {
    message: ThreadMessage
    part?: ThreadMessagePart
    thread: RuntimeThreadState
    composer: RuntimeComposerState
  }) => T
): T {
  const runtime = useChatRuntime()
  const current = useContext(ChatMessageContext)
  if (!current) {
    throw new Error("useChatMessageState requires ChatMessageProvider")
  }
  return selector({
    message: current.message,
    part: current.part,
    thread: runtime.thread,
    composer: runtime.composer,
  })
}

export function useChatMessage() {
  const current = useContext(ChatMessageContext)
  if (!current) throw new Error("useChatMessage requires ChatMessageProvider")
  return current.message
}

export function useChatMessagePart() {
  const part = useContext(ChatPartContext)
  const message = useContext(ChatMessageContext)
  return part ?? message?.part
}

export function useChatViewportState<T>(
  selector: (state: {
    element: { viewport: HTMLElement | null }
    height: { viewport: number }
  }) => T
): T {
  const runtime = useChatRuntime()
  return selector(runtime.viewport)
}
