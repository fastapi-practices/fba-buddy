import type {
  ChatAttachment,
  ChatMessageTiming,
  ChatMessageUsage,
  ChatPartTiming,
} from "@/lib/types"
import type { TranscriptQuoteAnchor } from "@/features/chat/transcript-state"

export type ToolApprovalOption = {
  id: string
  kind: string
  label?: string
  description?: string
  confirm?: boolean | { title?: string; description?: string }
  grants?: string[]
}

export type ToolCallMessagePartStatus =
  | { type: "running" }
  | { type: "complete" }
  | { type: "incomplete"; reason?: "cancelled" | "error" | "content-filter"; error?: unknown }
  | { type: "requires-action"; reason?: "interrupt" }

export type TextMessagePart = {
  type: "text"
  text: string
  status?: ToolCallMessagePartStatus
}

export type ReasoningMessagePart = {
  type: "reasoning"
  text: string
  timing?: ChatPartTiming
  status?: ToolCallMessagePartStatus
}

export type ToolCallMessagePart = {
  type: "tool-call"
  toolCallId: string
  toolName: string
  args?: unknown
  argsText?: string
  result?: unknown
  isError?: boolean
  status?: ToolCallMessagePartStatus
  timing?: ChatPartTiming
  providerMetadata?: {
    buddy?: {
      status?: "running" | "complete" | "error" | "stopped" | "declined"
    }
  }
  hadApproval?: boolean
  interrupt?: {
    type: "human"
    payload?: {
      toolCallId?: string
      approvalRequestId?: string
      options?: ToolApprovalOption[]
      warning?: string
      unavailableReason?: string
    }
  }
  approval?: {
    id?: string
    approved?: boolean
    resolution?: unknown
    options?: ToolApprovalOption[]
  }
}

export type ImageMessagePart = {
  type: "image"
  image: string
  filename?: string
  mimeType?: string
  size?: number
  status?: ToolCallMessagePartStatus
}

export type FileMessagePart = {
  type: "file"
  filename: string
  data: string
  mimeType: string
  size?: number
  sourceType?: "url" | "id"
}

export type ThreadMessagePart =
  | TextMessagePart
  | ReasoningMessagePart
  | ToolCallMessagePart
  | ImageMessagePart
  | FileMessagePart

type ThreadAttachmentContent = ImageMessagePart | FileMessagePart

export type CompleteAttachment = {
  id: string
  type: "image" | "document"
  name: string
  contentType?: string
  content: ThreadAttachmentContent[]
  file?: File
  status: { type: "complete" }
}

export type ThreadMessage = {
  id: string
  role: "user" | "assistant"
  content: ThreadMessagePart[]
  attachments?: CompleteAttachment[]
  createdAt?: Date
  status?: ToolCallMessagePartStatus
  metadata?: {
    timing?: ChatMessageTiming
    usage?: ChatMessageUsage
    custom?: Record<string, unknown>
  }
}

export type ChatSubmission = {
  text: string
  attachments: ChatAttachment[]
  quote?: TranscriptQuoteAnchor
}

export type QueueMessagePart =
  | { type: "text"; text: string }
  | {
      type: "file"
      id?: string
      filename?: string
      mimeType: string
      data: string
      size?: number
    }

export type QueueItemState = {
  id: string
  prompt: string
  parts: QueueMessagePart[]
}

type QueuePlacement = {
  lane: "queue" | "steer"
  insertBefore?: string | null
  insertAfter?: string | null
}

export type ChatQueueAdapter = {
  items: readonly QueueItemState[]
  steerItems: readonly QueueItemState[]
  enqueue: (message: ChatSubmission) => void | Promise<void>
  steer: (message: ChatSubmission) => void | Promise<void>
  remove: (id: string) => void
  edit: (id: string, message: ChatSubmission) => void
  move: (id: string, placement: QueuePlacement) => void
}
