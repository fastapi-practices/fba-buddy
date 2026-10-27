import { thinkingForApi } from "@/features/chat/thinking"
import { createRunAgentInput } from "@/api/run-agent-input"
import type { ResumeEntry } from "@ag-ui/core"
import type { ChatSendPayload, ForwardedProps } from "@/lib/types"

function omitUndefined(
  value: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) {
      result[key] = item
    }
  }
  return result
}

export function toForwardedPropsApi(
  props: ForwardedProps
): Record<string, unknown> {
  const thinking = thinkingForApi(props.thinking)
  const coding = props.agent_mode === "coding"
  return omitUndefined({
    quote: props.quote,
    providerId: props.provider_id,
    modelId: props.model_id,
    thinking: thinking ?? undefined,
    mcpIds: props.mcp_ids,
    webSearch: props.web_search,
    generationType: "text",
    workspaceRef: props.workspace_ref ?? undefined,
    workspaceId: props.workspace_id ?? undefined,
    advisorModel: props.advisor_model,
    fileUnderstandingModel: props.file_understanding_model ?? undefined,
    smartSearchModel: coding ? props.smart_search_model ?? undefined : undefined,
    cacheEnabled: props.cache_enabled ?? undefined,
    backgroundSubagentsEnabled: props.background_subagents_enabled ?? undefined,
    requestTimeout: props.request_timeout ?? undefined,
    runTimeout: props.run_timeout ?? undefined,
    compactionEnabled: props.compaction_enabled ?? undefined,
    compactionStrategy: props.compaction_strategy ?? undefined,
    compactionKeepMessages: props.compaction_keep_messages ?? undefined,
    compactionMaxMessages: props.compaction_max_messages ?? undefined,
    mcpApproveWrites: props.mcp_approve_writes,
    memoryEnabled: props.memory_enabled,
    toolPolicies: props.tool_policies,
    agentMode: props.agent_mode,
    permissionMode: coding ? props.permission_mode : undefined,
    executionBackend: props.execution_backend,
    sandboxProvider: props.sandbox_provider,
    executionBridgeId:
      coding && !props.acp_runner ? props.execution_bridge_id : undefined,
    acpRunner: coding ? (props.acp_runner ?? false) : undefined,
    acpRunnerName:
      coding && props.acp_runner
        ? (props.acp_runner_name ?? undefined)
        : undefined,
    maxTokens: props.max_tokens,
    acpImportedAttachmentHashes:
      coding && props.acp_runner
        ? props.acp_imported_attachment_hashes
        : undefined,
    acpBridgeId: coding && props.acp_runner ? props.acp_bridge_id : undefined,
    temperature: props.temperature,
    topP: props.top_p,
    timeout: props.timeout,
    seed: props.seed,
    presencePenalty: props.presence_penalty,
    frequencyPenalty: props.frequency_penalty,
    logitBias: props.logit_bias,
    stopSequences: props.stop_sequences,
    extraBody: props.extra_body,
  })
}

export function toChatCompletionBody(payload: ChatSendPayload) {
  const resume: ResumeEntry[] = Object.entries(
    payload.forwarded_props.deferred_approvals ?? {}
  ).map(([interruptId, approved]) => ({
    interruptId,
    status: "resolved",
    payload: { approved },
  }))
  return createRunAgentInput({
    threadId: payload.conversation_id,
    state: payload.state,
    tools: payload.tools,
    context: payload.context,
    messages: payload.messages,
    forwardedProps: omitUndefined({
      ...toForwardedPropsApi(payload.forwarded_props),
      projectId: payload.project_id ?? undefined,
      assistantId: payload.assistant_id ?? undefined,
    }),
    resume,
  })
}

export function toChatRegenerateBody(body: {
  threadId: string
  forwarded_props: ForwardedProps
  content?: string | null
  state?: ChatSendPayload["state"]
}) {
  return createRunAgentInput({
    threadId: body.threadId,
    state: body.state,
    messages:
      body.content == null
        ? []
        : [{ id: crypto.randomUUID(), role: "user", content: body.content }],
    forwardedProps: toForwardedPropsApi(body.forwarded_props),
  })
}
