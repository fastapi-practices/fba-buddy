import type { AgentMode } from "@/lib/types/chat"
import type {
  ConversationSource,
  ConversationSurface,
} from "@/lib/types/conversation"

type ConversationTransferMessage = {
  message_index: number
  role: string
  origin: string
  status: string
  model_messages: Record<string, unknown>[]
  turn_context: Record<string, unknown> | null
  client_message_id: string | null
  created_time: string | null
}

type ConversationTransfer = {
  format: "ai-buddy-conversation"
  version: 1
  exported_time: string | null
  conversation: {
    conversation_id: string
    title: string
    provider_id: number
    model_id: string
    agent_mode: AgentMode | null
    goal: string | null
    origin: string
    surface: ConversationSurface
    source: ConversationSource
  }
  messages: ConversationTransferMessage[]
}

type EncryptedConversationTransfer = {
  format: "ai-buddy-conversation-encrypted"
  version: 1
  key_version: string
  ciphertext: string
}

export type ConversationTransferDocument =
  ConversationTransfer | EncryptedConversationTransfer
