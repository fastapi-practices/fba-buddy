import type { AgentMode, ChatMessageTiming, ChatWorkTiming } from "./chat"

type ConversationOrigin = "web" | "im" | "cron"
export type ConversationSurface = "chat" | "image"

export type TurnContext = {
  attempt_id?: string | number
  attempt_status?: string
  attempt?: { id: string; status?: string; number?: number }
  created_at?: string
  input_intent?: string
  created_by?: unknown
  quote?:
    import("@/features/chat/transcript-state").TranscriptQuoteAnchor | null
  lifecycle_events?: import("@/features/chat/rich-events").RichEvent[]
  origin?: ConversationOrigin | string | null
  provider_id?: number | null
  model_id?: string | null
  generation_type?: string | null
  agent_mode?: string | null
  execution_backend?: string | null
  thinking?: string | boolean | null
  web_search?: string | null
  mcp_ids?: number[] | null
  workspace_ref?: { kind?: string; id?: number } | null
  workspace_id?: string | null
  permission_mode?: string | null
  acp_runner?: boolean | null
  acp_runner_name?: string | null
  agent_state?: unknown
  ag_ui_activities?: import("@ag-ui/core").ActivityMessage[]
  agent_state_delta?: unknown[]
  raw_events?: unknown[]
  custom_events?: { name: unknown; value: unknown; metadata?: unknown }[]
}

export type ConversationSource = "local" | "cloud"

export type ConversationListItem = {
  id: number
  conversation_id: string
  title: string
  agent_mode: AgentMode | null
  project_id: number | null
  assistant_id: number | null
  goal?: string | null
  origin: ConversationOrigin
  surface: ConversationSurface
  is_pinned: boolean
  is_archived: boolean
  is_generating: boolean
  source: ConversationSource
  last_message_preview: string | null
  last_message_time: string | null
  revision: number
  created_time: string
  updated_time: string | null
}

export type ConversationListWireItem = {
  id: number
  conversationId: string
  title: string
  agentMode: AgentMode | null
  projectId: number | null
  assistantId: number | null
  origin: ConversationOrigin
  surface: ConversationSurface
  isPinned: boolean
  isArchived: boolean
  isGenerating: boolean
  source: ConversationSource
  lastMessagePreview: string | null
  lastMessageTime: string | null
  revision: number
  createdTime: string
  updatedTime: string | null
}

export type ConversationWorkspace = {
  project_id: number | null
  assistant_id: number | null
  goal: string | null
}

type SnapshotContentPart = {
  type?: string
  part_kind?: string
  partKind?: string
  text?: string
  content?: string
  thinking?: string | Array<{ type?: string; text?: string }>
  reasoning?: string
  summary?: Array<{ type?: string; text?: string } | string>
  id?: string
  name?: string
  filename?: string
  mimeType?: string
  mime_type?: string
  data?: string
  url?: string
  image?: string
  image_url?: string | { url?: string }
  source?: {
    type?: string
    value?: string
    data?: string
    url?: string
    mimeType?: string
    media_type?: string
  }
  metadata?: { filename?: string; size?: number }
  toolCallId?: string
  tool_call_id?: string
  toolName?: string
  tool_name?: string
  args?: unknown
  arguments?: unknown
  result?: unknown
  isError?: boolean
  is_error?: boolean
  status?: string
}

export type SnapshotMessageUsage = {
  input_tokens?: number
  inputTokens?: number
  output_tokens?: number
  outputTokens?: number
  total_tokens?: number
  totalTokens?: number
  cache_read_tokens?: number
  cacheReadTokens?: number
  cache_write_tokens?: number
  cacheWriteTokens?: number
  input_audio_tokens?: number
  inputAudioTokens?: number
  output_audio_tokens?: number
  outputAudioTokens?: number
  cache_audio_read_tokens?: number
  cacheAudioReadTokens?: number
  details?: Record<string, number>
  cost?: number | string | null
}

export type SnapshotMessage = {
  sources?: unknown

  id: string
  role: string
  name?: string
  encryptedValue?: string | null
  subagentRunId?: string | null
  metadata?: Record<string, unknown> | null
  createdTime?: string | number
  created_time?: string | number
  created_at?: string | number
  createdAt?: string | number
  input_intent?: string
  inputIntent?: string
  created_by?: unknown
  createdBy?: unknown
  attempt?: { id: string | number; status?: string; number?: number }
  attempt_id?: string | number
  attemptId?: string | number
  attempt_status?: string
  attemptStatus?: string
  content?: string | SnapshotContentPart[] | Record<string, unknown> | null
  activityType?: string
  messageIndex?: number | null
  providerId?: number | null
  modelId?: string | null
  parts?: SnapshotContentPart[] | null
  thinking?: string | null
  reasoning?: string | null
  reasoning_content?: string | null
  reasoningContent?: string | null
  persisted_message_id?: number | null
  persistedMessageId?: number | null
  conversation_id?: string | null
  conversationId?: string | null
  message_type?: string | null
  messageType?: string | null
  isError?: boolean
  is_error?: boolean
  error?: string | null
  error_detail?: Record<string, unknown> | null
  errorDetail?: Record<string, unknown> | null
  timing?: ChatMessageTiming | null
  work_timing?: ChatWorkTiming | null
  workTiming?: ChatWorkTiming | null
  run_id?: string | null
  runId?: string | null
  started_at?: string | number | null
  startedAt?: string | number | null
  completed_at?: string | number | null
  completedAt?: string | number | null
  duration_ms?: number | null
  durationMs?: number | null
  usage?: SnapshotMessageUsage | null
  cost?: number | string | null
  tool_calls?: Array<{
    id?: string
    function?: { name?: string; arguments?: string }
  }> | null
  toolCalls?: Array<{
    id?: string
    function?: { name?: string; arguments?: string }
    encryptedValue?: string | null
  }> | null
  tool_call_id?: string | null
  toolCallId?: string | null
  origin?: ConversationOrigin | string | null
  turnContext?: TurnContext | null
}

export type MessagesSnapshot = {
  messages?: SnapshotMessage[]
}

export type ConversationDetail = {
  id: number
  conversation_id: string
  title: string
  agent_mode: AgentMode | null
  project_id: number | null
  assistant_id: number | null
  goal: string | null
  origin: ConversationOrigin
  surface: ConversationSurface
  is_pinned: boolean
  is_archived: boolean
  is_generating: boolean
  source: ConversationSource
  provider_id: number
  model_id: string
  revision: number
  created_time: string
  updated_time: string | null
  messages_snapshot: MessagesSnapshot
  history_has_more: boolean
  history_cursor: string | null
}

export type ConversationDetailWire = {
  id: number
  conversationId: string
  title: string
  agentMode: AgentMode | null
  projectId: number | null
  assistantId: number | null
  goal: string | null
  origin: ConversationOrigin
  surface: ConversationSurface
  isPinned: boolean
  isArchived: boolean
  isGenerating: boolean
  source: ConversationSource
  providerId: number
  modelId: string
  revision: number
  createdTime: string
  updatedTime: string | null
  messagesSnapshot: MessagesSnapshot
  historyHasMore: boolean
  historyCursor: string | null
}
