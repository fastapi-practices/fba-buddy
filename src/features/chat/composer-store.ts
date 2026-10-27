import { create } from "zustand"
import { sourceStorage } from "@/lib/account-source"
import { createJSONStorage, persist } from "zustand/middleware"
import type { AcpLaunchConfig } from "@/lib/types/acp"

import { insertQuickPhrase } from "@/features/chat/quick-phrase"
import { workspaceRefFromComposerDraft } from "@/features/chat/workspace-ref"
import type {
  AcpRunnerName,
  AgentMode,
  ChatAttachment,
  ForwardedProps,
  PermissionMode,
  ThinkingMode,
  WorkspaceRef,
} from "@/lib/types"

type ComposerState = ForwardedProps & {
  draft: string
  attachments: ChatAttachment[]
  editingMessageId: string | null
  /* 编辑态归属的会话：分屏时两栏各有各的会话，编辑条只出现在所属栏 */
  editingConversationId: string | null
  locatedMessageId: string | null
  locatedNonce: number
  image_provider_id: number
  image_model_id: string
  setModel: (provider_id: number, model_id: string) => void
  setImageModel: (provider_id: number, model_id: string) => void
  setThinkingMode: (thinking: ThinkingMode) => void
  setGenerationType: (
    generation_type: NonNullable<ForwardedProps["generation_type"]>
  ) => void
  setWebSearch: (web_search: ForwardedProps["web_search"]) => void
  setAgentMode: (agent_mode: AgentMode) => void
  setPermissionMode: (permission_mode: PermissionMode) => void
  setAcpRunner: (acp_runner: boolean) => void
  setAcpRunnerName: (acp_runner_name: AcpRunnerName) => void
  acpRunnerConfigs: Partial<Record<AcpRunnerName, AcpLaunchConfig>>
  enabledAcpRunners: AcpRunnerName[]
  setAcpRunnerEnabled: (runner: AcpRunnerName, enabled: boolean) => void
  setAcpRunnerConfig: (runner: AcpRunnerName, config: AcpLaunchConfig) => void
  alwaysAllowedTools: string[]
  grantAlwaysAllowedTool: (name: string) => void
  setSampling: (patch: Partial<ForwardedProps>) => void
  setMcpIds: (mcp_ids: number[]) => void
  toggleMcp: (mcpId: number) => void
  setWorkspaceRef: (workspace_ref: WorkspaceRef | null) => void
  setDraft: (draft: string) => void
  insertPhrase: (phrase: string) => void
  addAttachment: (attachment: ChatAttachment) => void
  removeAttachment: (id: string) => void
  startEditing: (
    messageId: string,
    content: string,
    conversationId: string | null
  ) => void
  clearEditing: () => void
  flashLocate: (messageId: string) => void
  clearInput: () => void
}

let locateTimer: ReturnType<typeof setTimeout> | undefined

export const useComposerStore = create<ComposerState>()(
  persist(
    (set) => ({
      provider_id: 0,
      model_id: "",
      image_provider_id: 0,
      image_model_id: "",
      thinking: false,
      web_search: "off",
      generation_type: "text",
      agent_mode: "work",
      permission_mode: "ask",
      acp_runner: false,
      acp_runner_name: null,
      acpRunnerConfigs: {},
      enabledAcpRunners: [],
      alwaysAllowedTools: [],
      mcp_ids: undefined,
      workspace_ref: null,
      image_size: null,
      image_quality: null,
      image_aspect_ratio: null,
      image_background: null,
      image_input_fidelity: null,
      image_moderation: null,
      image_output_format: null,
      image_output_compression: null,
      draft: "",
      attachments: [],
      editingMessageId: null,
      editingConversationId: null,
      locatedMessageId: null,
      locatedNonce: 0,
      setModel: (provider_id, model_id) => set({ provider_id, model_id }),
      setImageModel: (provider_id, model_id) =>
        set({ image_provider_id: provider_id, image_model_id: model_id }),
      setThinkingMode: (thinking) => set({ thinking }),
      setGenerationType: (generation_type) => set({ generation_type }),
      setWebSearch: (web_search) => set({ web_search }),
      setAgentMode: (agent_mode) => set({ agent_mode }),
      setPermissionMode: (permission_mode) => set({ permission_mode }),
      setAcpRunner: (acp_runner) =>
        set((state) => ({
          acp_runner:
            acp_runner &&
            Boolean(
              state.acp_runner_name &&
              state.enabledAcpRunners.includes(state.acp_runner_name)
            ),
        })),
      setAcpRunnerName: (acp_runner_name) =>
        set((state) =>
          state.enabledAcpRunners.includes(acp_runner_name)
            ? { acp_runner: true, acp_runner_name }
            : state
        ),
      setAcpRunnerEnabled: (runner, enabled) =>
        set((state) => ({
          enabledAcpRunners: enabled
            ? [...new Set([...state.enabledAcpRunners, runner])]
            : state.enabledAcpRunners.filter((id) => id !== runner),
          ...(!enabled && state.acp_runner_name === runner
            ? { acp_runner: false, acp_runner_name: null }
            : {}),
        })),
      setAcpRunnerConfig: (runner, config) =>
        set((state) => ({
          acpRunnerConfigs: { ...state.acpRunnerConfigs, [runner]: config },
        })),
      grantAlwaysAllowedTool: (name) =>
        set((state) => {
          const tools = state.alwaysAllowedTools
          return tools.includes(name)
            ? state
            : { alwaysAllowedTools: [...tools, name] }
        }),
      setSampling: (patch) => set(patch),
      setWorkspaceRef: (workspace_ref) => set({ workspace_ref }),
      setMcpIds: (mcp_ids) => set({ mcp_ids }),
      toggleMcp: (mcpId) =>
        set((current) => {
          const selected = current.mcp_ids ?? []
          return {
            mcp_ids: selected.includes(mcpId)
              ? selected.filter((item) => item !== mcpId)
              : [...selected, mcpId],
          }
        }),
      setDraft: (draft) =>
        set((current) => ({
          draft,
          workspace_ref: workspaceRefFromComposerDraft(
            draft,
            current.workspace_ref
          ),
        })),
      insertPhrase: (phrase) =>
        set((current) => {
          const draft = insertQuickPhrase(current.draft, phrase)
          return {
            draft,
            workspace_ref: workspaceRefFromComposerDraft(
              draft,
              current.workspace_ref
            ),
          }
        }),
      addAttachment: (attachment) =>
        set((current) => ({
          attachments: [...current.attachments, attachment],
        })),
      removeAttachment: (id) =>
        set((current) => ({
          attachments: current.attachments.filter((item) => item.id !== id),
        })),
      /* 草稿不写全局 store：分屏两栏各有输入框，写全局会把原文灌进另一栏 */
      startEditing: (messageId, content, conversationId) =>
        set((current) => ({
          editingMessageId: messageId,
          editingConversationId: conversationId,
          workspace_ref: workspaceRefFromComposerDraft(
            content,
            current.workspace_ref
          ),
        })),
      clearEditing: () =>
        set({ editingMessageId: null, editingConversationId: null }),
      flashLocate: (messageId) => {
        if (locateTimer) {
          clearTimeout(locateTimer)
        }
        set((state) => ({
          locatedMessageId: messageId,
          locatedNonce: state.locatedNonce + 1,
        }))
        locateTimer = setTimeout(() => {
          set((state) =>
            state.locatedMessageId === messageId
              ? { locatedMessageId: null }
              : state
          )
        }, 1800)
      },
      clearInput: () =>
        set((state) => ({
          draft: "",
          attachments: [],
          editingMessageId: null,
          editingConversationId: null,
          workspace_ref:
            state.workspace_ref?.kind === "skill" ? null : state.workspace_ref,
        })),
    }),
    {
      name: "fba-buddy.composer",
      storage: createJSONStorage(() => sourceStorage),
      partialize: (state) => ({
        provider_id: state.provider_id,
        model_id: state.model_id,
        image_provider_id: state.image_provider_id,
        image_model_id: state.image_model_id,
        thinking: state.thinking,
        web_search: state.web_search,
        generation_type: state.generation_type,
        agent_mode: state.agent_mode,
        permission_mode: state.permission_mode,
        acp_runner: state.acp_runner,
        acp_runner_name: state.acp_runner_name,
        acpRunnerConfigs: state.acpRunnerConfigs,
        enabledAcpRunners: state.enabledAcpRunners,
        alwaysAllowedTools: state.alwaysAllowedTools,
        mcp_ids: state.mcp_ids,
        workspace_ref:
          state.workspace_ref?.kind === "skill" ? null : state.workspace_ref,
        image_size: state.image_size,
        image_quality: state.image_quality,
        image_aspect_ratio: state.image_aspect_ratio,
        image_background: state.image_background,
        image_input_fidelity: state.image_input_fidelity,
        image_moderation: state.image_moderation,
        image_output_format: state.image_output_format,
        image_output_compression: state.image_output_compression,
      }),
    }
  )
)
