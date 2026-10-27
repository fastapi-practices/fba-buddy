import {
  parseAdvisorModel,
  parseExtraBody,
  parseLogitBias,
  parseOptionalBoundedNumber,
  parseOptionalLimit,
  parseOptionalNumber,
  parseStopSequences,
} from "@/features/chat/chat-prefs"
import { resolveAcpLaunchConfig } from "@/features/acp/acp-agents"
import { getConversationTuning } from "@/features/chat/conversation-tuning"
import { conversationAgentMode } from "@/features/chat/conversation-mode"
import { thinkingForApi } from "@/features/chat/thinking"
import { getUserChatPrefs } from "@/features/settings/user-prefs"
import type { ForwardedProps, WorkspaceRef } from "@/lib/types"
import type { AcpRunnerName } from "@/lib/types"
import type { AcpLaunchConfig } from "@/lib/types/acp"

function apiWorkspaceRef(
  ref: WorkspaceRef | null | undefined
): WorkspaceRef | undefined {
  if (
    ref == null ||
    (ref.kind !== "knowledge" &&
      ref.kind !== "skill" &&
      ref.kind !== "artifact")
  ) {
    return undefined
  }
  return ref
}

function approvalsOrOmit(
  approvals: Record<string, boolean> | null | undefined
): Record<string, boolean> | undefined {
  if (!approvals) {
    return undefined
  }
  return Object.keys(approvals).length > 0 ? approvals : undefined
}

export function buildForwardedProps(
  composer: ForwardedProps & {
    acpRunnerConfigs?: Partial<Record<AcpRunnerName, AcpLaunchConfig>>
    enabledAcpRunners?: AcpRunnerName[]
  }
): ForwardedProps {
  const image = composer.generation_type === "image"
  const useAcp =
    Boolean(composer.acp_runner) &&
    (composer.enabledAcpRunners === undefined ||
      Boolean(
        composer.acp_runner_name &&
        composer.enabledAcpRunners.includes(composer.acp_runner_name)
      ))
  return {
    provider_id: composer.provider_id,
    model_id: composer.model_id,
    thinking: thinkingForApi(composer.thinking),
    mcp_ids:
      composer.mcp_ids && composer.mcp_ids.length > 0
        ? composer.mcp_ids
        : undefined,
    web_search: composer.web_search,
    generation_type: composer.generation_type,
    memory_enabled: image ? undefined : (composer.memory_enabled ?? true),
    workspace_ref: apiWorkspaceRef(composer.workspace_ref),
    workspace_id:
      image || composer.agent_mode !== "coding"
        ? undefined
        : composer.workspace_id,
    advisor_model: image
      ? undefined
      : parseAdvisorModel(composer.advisor_model),
    file_understanding_model: image ? undefined : composer.file_understanding_model?.trim() || undefined,
    smart_search_model: image || composer.agent_mode !== "coding" || composer.acp_runner
      ? undefined : composer.smart_search_model?.trim() || undefined,
    cache_enabled: image ? undefined : composer.cache_enabled ?? undefined,
    background_subagents_enabled: image || composer.agent_mode === "chat"
      ? undefined : composer.background_subagents_enabled ?? undefined,
    request_timeout: image ? undefined : parseOptionalBoundedNumber(composer.request_timeout, 0.001, Number.MAX_SAFE_INTEGER),
    run_timeout: image ? undefined : parseOptionalBoundedNumber(composer.run_timeout, 0.001, Number.MAX_SAFE_INTEGER),
    compaction_enabled: image ? undefined : composer.compaction_enabled ?? undefined,
    compaction_strategy: image ? undefined : composer.compaction_strategy ?? undefined,
    compaction_keep_messages: image ? undefined : parseOptionalLimit(composer.compaction_keep_messages),
    compaction_max_messages: image ? undefined : parseOptionalLimit(composer.compaction_max_messages),
    mcp_approve_writes: image
      ? undefined
      : composer.mcp_approve_writes
        ? true
        : undefined,
    tool_policies: image
      ? undefined
      : composer.tool_policies && Object.keys(composer.tool_policies).length > 0
        ? composer.tool_policies
        : undefined,
    deferred_approvals: image
      ? undefined
      : approvalsOrOmit(composer.deferred_approvals),
    agent_mode: image ? undefined : (composer.agent_mode ?? "work"),
    permission_mode: image
      ? undefined
      : composer.agent_mode === "coding"
        ? (composer.permission_mode ?? "ask")
        : undefined,
    acp_runner: image
      ? undefined
      : composer.agent_mode === "coding"
        ? useAcp
        : undefined,
    acp_runner_name: image
      ? undefined
      : composer.agent_mode === "coding" && useAcp
        ? (composer.acp_runner_name ?? undefined)
        : undefined,
    acp_runner_config:
      !image &&
      composer.agent_mode === "coding" &&
      useAcp &&
      composer.acp_runner_name
        ? (composer.acp_runner_config ??
          resolveAcpLaunchConfig(
            composer.acp_runner_name,
            composer.acpRunnerConfigs
          ) ??
          undefined)
        : undefined,
    max_tokens: image ? undefined : parseOptionalLimit(composer.max_tokens),
    temperature: image
      ? undefined
      : parseOptionalBoundedNumber(composer.temperature, 0, 2),
    top_p: image ? undefined : parseOptionalBoundedNumber(composer.top_p, 0, 1),
    timeout: image ? undefined : parseOptionalNumber(composer.timeout),
    seed: image ? undefined : parseOptionalNumber(composer.seed),
    presence_penalty: image
      ? undefined
      : parseOptionalBoundedNumber(composer.presence_penalty, -2, 2),
    frequency_penalty: image
      ? undefined
      : parseOptionalBoundedNumber(composer.frequency_penalty, -2, 2),
    logit_bias: image ? undefined : parseLogitBias(composer.logit_bias),
    stop_sequences: image
      ? undefined
      : parseStopSequences(composer.stop_sequences),
    extra_body: image ? undefined : parseExtraBody(composer.extra_body),
    image_background: image
      ? composer.image_background || undefined
      : undefined,
    image_input_fidelity: image
      ? composer.image_input_fidelity || undefined
      : undefined,
    image_moderation: image
      ? composer.image_moderation || undefined
      : undefined,
    image_output_compression: image
      ? (composer.image_output_compression ?? undefined)
      : undefined,
    image_output_format: image
      ? composer.image_output_format || undefined
      : undefined,
    image_size: image ? composer.image_size || undefined : undefined,
    image_quality: image ? composer.image_quality || undefined : undefined,
    image_aspect_ratio: image
      ? composer.image_aspect_ratio || undefined
      : undefined,
  }
}

export function buildImageForwardedProps(
  composer: ForwardedProps
): ForwardedProps {
  return buildForwardedProps({
    ...composer,
    thinking: false,
    web_search: "off",
    generation_type: "image",
    mcp_ids: undefined,
    workspace_ref: null,
    advisor_model: undefined,
    mcp_approve_writes: undefined,
    deferred_approvals: undefined,
    extra_body: undefined,
    logit_bias: undefined,
    agent_mode: undefined,
    permission_mode: undefined,
    acp_runner: undefined,
    acp_runner_name: undefined,
  })
}

export function resolveChatForwardedProps(
  composer: ForwardedProps,
  extra?: Partial<ForwardedProps> & { conversationId?: string | null }
): ForwardedProps {
  const prefs = getUserChatPrefs()
  const extraProps = { ...extra }
  const mode = conversationAgentMode(extraProps.conversationId)
  const tuning = getConversationTuning(extraProps.conversationId)
  delete extraProps.conversationId
  return buildForwardedProps({
    ...composer,
    ...tuning,
    advisor_model: tuning.advisor_model ?? prefs.advisor_model,
    mcp_approve_writes: tuning.mcp_approve_writes ?? prefs.mcp_approve_writes,
    generation_type: "text",
    ...extraProps,
    agent_mode: mode ?? extraProps.agent_mode ?? composer.agent_mode,
    memory_enabled: prefs.memory_enabled,
  })
}
