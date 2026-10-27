import type { ExecutionBackend, SandboxProvider } from "@/shared/execution"
import type { TurnContext } from "@/lib/types/conversation"
import type { WorkspaceRef } from "@/lib/types/workspace"
import type { AcpLaunchConfig } from "@/lib/types/acp"

type ToolApprovalOption = {
  id: string
  kind: string
  label?: string
  description?: string
  confirm?: boolean | { title?: string; description?: string }
  grants?: string[]
}

export type ThinkingMode =
  | boolean
  | "off"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max"
  | null

export type ChatThinkingEffort =
  "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max"

export type AgentMode = "chat" | "work" | "coding"

export type PermissionMode = "ask" | "auto" | "full"

export type AcpRunnerName =
  | "opencode"
  | "codebuddy"
  | "claude_code"
  | "codex"
  | "kimi_code"
  | "cursor_cli"
  | "pi"

export type ForwardedProps = {
  quote?: import("@/features/chat/transcript-state").TranscriptQuoteAnchor
  provider_id: number
  model_id: string
  thinking?: ThinkingMode
  mcp_ids?: number[] | null
  web_search?: "off" | "builtin" | "exa" | "tavily" | "duckduckgo"
  generation_type?: "text" | "image"
  workspace_ref?: WorkspaceRef | null
  workspace_id?: string | null
  advisor_model?: string | null
  file_understanding_model?: string | null
  smart_search_model?: string | null
  cache_enabled?: boolean | null
  background_subagents_enabled?: boolean | null
  request_timeout?: number | null
  run_timeout?: number | null
  compaction_enabled?: boolean | null
  compaction_strategy?: "summary" | "relevance" | null
  compaction_keep_messages?: number | null
  compaction_max_messages?: number | null
  mcp_approve_writes?: boolean | null
  memory_enabled?: boolean | null
  tool_policies?: Record<string, "allow" | "ask" | "deny"> | null
  deferred_approvals?: Record<string, boolean> | null
  agent_mode?: AgentMode
  permission_mode?: PermissionMode
  execution_backend?: ExecutionBackend
  sandbox_provider?: SandboxProvider
  execution_bridge_id?: string
  acp_runner?: boolean | null
  acp_runner_name?: AcpRunnerName | null
  acp_runner_config?: AcpLaunchConfig | null
  acp_imported_attachment_hashes?: string[]
  acp_bridge_id?: string
  max_tokens?: number | null
  temperature?: number | null
  top_p?: number | null
  timeout?: number | null
  seed?: number | null
  presence_penalty?: number | null
  frequency_penalty?: number | null
  logit_bias?: Record<string, number> | null
  stop_sequences?: string[] | null
  extra_body?: Record<string, unknown> | null
  image_background?: "transparent" | "opaque" | "auto" | null
  image_input_fidelity?: "high" | "low" | null
  image_moderation?: "auto" | "low" | null
  image_output_compression?: number | null
  image_output_format?: "png" | "webp" | "jpeg" | null
  image_quality?: "low" | "medium" | "high" | "auto" | null
  image_size?:
    | "auto"
    | "1024x1024"
    | "1024x1536"
    | "1536x1024"
    | "512"
    | "1K"
    | "2K"
    | "4K"
    | null
  image_aspect_ratio?:
    | "1:1"
    | "2:3"
    | "3:2"
    | "3:4"
    | "4:3"
    | "4:5"
    | "5:4"
    | "9:16"
    | "16:9"
    | "21:9"
    | null
}

export type ChatToolCall = {
  id: string
  name: string
  args: string
  result?: string
  isError?: boolean
  status?: "running" | "complete" | "error" | "stopped" | "declined"
  approvalRequestId?: string
  interruptId?: string
  resultMessageId?: string
  pendingApproval?: boolean
  hadApproval?: boolean
  argsComplete?: boolean
  approvalOptions?: ToolApprovalOption[]
  approvalWarning?: string
  approvalUnavailableReason?: string
}

export type ChatPartTiming = {
  startedAt: number
  completedAt?: number
}

export type ChatAttachment = {
  sourceType?: "url" | "id"
  id: string
  name: string
  mime: string
  size: number
  data: string
  url?: string
  stagedObjectId?: number
  kind: "image" | "audio" | "video" | "document"
}

export type ChatMessagePart =
  | { type: "text"; text: string }
  | {
      type: "reasoning"
      text: string
      messageId?: string
      timing?: ChatPartTiming
    }
  | { type: "tool-call"; toolCallId: string; timing?: ChatPartTiming }
  | { type: "attachment"; attachmentId: string }

export type ChatWorkTiming = {
  runId: string
  status: "running" | "awaiting-approval" | "complete" | "stopped" | "error"
  startedAt?: number
  endedAt?: number
  elapsedMs?: number
}

export type ChatMessageTiming = {
  streamStartTime: number
  firstTokenTime?: number
  totalStreamTime?: number
  tokenCount?: number
  tokensPerSecond?: number
  totalChunks: number
  toolCallCount: number
}

export type ChatMessageUsage = {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  reasoningTokens?: number
  costUsd?: number
}

export type ChatMessage = {
  id: string
  agUiActivities?: import("@ag-ui/core").ActivityMessage[]
  agUiActiveTextId?: string
  agUiActiveToolId?: string
  agUiActiveReasoningId?: string
  agUiReasoningSpans?: Record<string, ChatPartTiming>
  agUiSubagents?: Record<string, ChatMessage[]>
  sources?: { url: string; title: string; domain: string; snippet?: string }[]
  reasoningMessageIds?: string[]
  pk?: number
  createdAt?: string
  origin?: unknown
  inputIntent?: string
  createdBy?: unknown
  attempt?: { id: string; status?: string; number?: number }
  role: "user" | "assistant"
  content: string
  parts?: ChatMessagePart[]
  isPlaceholder?: boolean
  thinking?: string
  tools?: ChatToolCall[]
  attachments?: ChatAttachment[]
  status?: "streaming" | "complete" | "error" | "stopped" | "awaiting-approval"
  error?: string
  errorDetail?: Record<string, unknown>
  timing?: ChatMessageTiming
  workTiming?: ChatWorkTiming
  usage?: ChatMessageUsage
  turnContext?: TurnContext | null
}

export type OutgoingContentPart =
  | { type: "text"; text: string }
  | {
      type: ChatAttachment["kind"]
      source: { type: "data" | "url"; value: string; mimeType: string }
      metadata?: { filename?: string; size?: number }
    }

export type ChatSendPayload = {
  state?: import("@ag-ui/core").RunAgentInput["state"]
  tools?: import("@ag-ui/core").Tool[]
  context?: import("@ag-ui/core").Context[]
  conversation_id?: string | null
  project_id?: number | null
  assistant_id?: number | null
  messages: Array<{
    id: string
    role: "user"
    content: string | OutgoingContentPart[]
  }>
  forwarded_props: ForwardedProps
}
