/* eslint-disable react-refresh/only-export-components */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"

import { stageAttachment } from "@/api"
import { attachmentKind } from "@/features/chat/attachments"
import {
  ChatMessageContext,
  ChatPartContext,
  ChatRuntimeContext,
  type ChatRuntimeValue,
  type MessageRuntimeValue,
} from "@/features/chat/chat-runtime-context"
import type {
  ChatSubmission,
  ChatQueueAdapter,
  ThreadMessage,
  ThreadMessagePart,
} from "@/features/chat/thread-types"
import type { TranscriptQuoteAnchor } from "@/features/chat/transcript-state"
import type { ChatAttachment, ChatMessage } from "@/lib/types"

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ""))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

async function fileToAttachment(file: File): Promise<ChatAttachment> {
  const dataUrl = await fileToDataUrl(file)
  const separator = dataUrl.indexOf(",")
  return {
    id: crypto.randomUUID(),
    name: file.name,
    mime: file.type || "application/octet-stream",
    size: file.size,
    data: separator >= 0 ? dataUrl.slice(separator + 1) : dataUrl,
    url: dataUrl,
    kind: attachmentKind(file.type || "application/octet-stream"),
  }
}

export function ChatRuntimeProvider({
  messages,
  rawMessages,
  running,
  loading = false,
  disabled = false,
  queue = null,
  onSend,
  onStop,
  onReload,
  onResumeToolCall,
  children,
}: {
  messages: ThreadMessage[]
  rawMessages: ChatMessage[]
  running: boolean
  loading?: boolean
  disabled?: boolean
  queue?: ChatQueueAdapter | null
  onSend: (submission: ChatSubmission) => Promise<void> | void
  onStop: () => Promise<void> | void
  onReload: (messageId: string) => Promise<void> | void
  onResumeToolCall?: (payload: { toolCallId: string; payload: unknown }) => void
  children: ReactNode
}) {
  const [text, setText] = useState("")
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  const [quote, setQuoteState] = useState<TranscriptQuoteAnchor | null>(null)
  const [viewport, setViewport] = useState<HTMLElement | null>(null)
  const [viewportHeight, setViewportHeight] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const sendingRef = useRef(false)

  const setQuote = useCallback(
    (next: TranscriptQuoteAnchor | null | undefined) => {
      setQuoteState(next ?? null)
    },
    []
  )

  const addFiles = useCallback(async (files: readonly File[]) => {
    if (!files.length) return
    const added = await Promise.all(files.map(fileToAttachment))
    setAttachments((current) => [...current, ...added])
    await Promise.allSettled(
      added.map(async (attachment, index) => {
        try {
          const staged = await stageAttachment(files[index]!)
          setAttachments((current) =>
            current.map((item) =>
              item.id === attachment.id
                ? { ...item, stagedObjectId: staged.object.id }
                : item
            )
          )
        } catch {
          // 暂存失败不阻断聊天发送
        }
      })
    )
  }, [])

  const setAttachmentList = useCallback((next: ChatAttachment[]) => {
    setAttachments(next)
  }, [])

  const removeAttachment = useCallback((id: string) => {
    setAttachments((current) => current.filter((item) => item.id !== id))
  }, [])

  const clear = useCallback(() => {
    setText("")
    setAttachments([])
    setQuoteState(null)
  }, [])

  const bind = useCallback((element: HTMLElement | null) => {
    setViewport(element)
  }, [])

  useEffect(() => {
    if (!viewport) return
    const observer = new ResizeObserver(() =>
      setViewportHeight(viewport.clientHeight)
    )
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [viewport])

  const send = useCallback(
    async (submission?: ChatSubmission) => {
      if (sendingRef.current) return
      const next = submission ?? {
        text,
        attachments,
        ...(quote ? { quote } : {}),
      }
      if (!next.text.trim() && next.attachments.length === 0) return
      sendingRef.current = true
      try {
        if (queue) await queue.enqueue(next)
        else await onSend(next)
        clear()
      } finally {
        sendingRef.current = false
      }
    },
    [attachments, clear, onSend, queue, quote, text]
  )

  const sendText = useCallback(
    async (value: string) => {
      await send({ text: value, attachments: [] })
    },
    [send]
  )

  const openFilePicker = useCallback(() => fileInputRef.current?.click(), [])

  const value = useMemo<ChatRuntimeValue>(
    () => ({
      thread: {
        messages,
        rawMessages,
        isRunning: running,
        isLoading: loading,
        isDisabled: disabled,
      },
      composer: {
        text,
        attachments,
        quote,
        setText,
        setQuote,
        addFiles,
        setAttachments: setAttachmentList,
        removeAttachment,
        clear,
        openFilePicker,
      },
      actions: {
        send,
        sendText,
        stop: async () => {
          await onStop()
        },
        reload: async (messageId) => {
          await onReload(messageId)
        },
        resumeToolCall: (payload) => onResumeToolCall?.(payload),
      },
      queue,
      viewport: {
        element: { viewport },
        height: { viewport: viewportHeight },
        bind,
      },
    }),
    [
      addFiles,
      attachments,
      bind,
      clear,
      disabled,
      loading,
      messages,
      onReload,
      onResumeToolCall,
      onStop,
      openFilePicker,
      queue,
      quote,
      rawMessages,
      removeAttachment,
      running,
      send,
      sendText,
      setAttachmentList,
      setQuote,
      text,
      viewport,
      viewportHeight,
    ]
  )

  return (
    <ChatRuntimeContext value={value}>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? [])
          event.target.value = ""
          void addFiles(files)
        }}
      />
      {children}
    </ChatRuntimeContext>
  )
}

export function ChatMessageProvider({
  message,
  part,
  index,
  isLast,
  children,
}: MessageRuntimeValue & { children: ReactNode }) {
  return (
    <ChatMessageContext value={{ message, part, index, isLast }}>
      {children}
    </ChatMessageContext>
  )
}

export function ChatPartProvider({
  part,
  children,
}: {
  part: ThreadMessagePart
  children: ReactNode
}) {
  return <ChatPartContext value={part}>{children}</ChatPartContext>
}

export {
  useChatMessage,
  useChatMessagePart,
  useChatMessageState,
  useChatRuntime,
  useChatRuntimeState,
  useChatViewportState,
} from "@/features/chat/chat-runtime-context"
