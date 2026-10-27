import { create } from "zustand"
import { sourceStorage } from "@/lib/account-source"
import { createJSONStorage, persist } from "zustand/middleware"

const DRAFT_TUNING_KEY = "draft"

export type ConversationTuning = {
  temperature: number | null
  top_p: number | null
  max_tokens: number | null
  advisor_model: string | null
  file_understanding_model: string | null
  smart_search_model: string | null
  cache_enabled: boolean | null
  background_subagents_enabled: boolean | null
  request_timeout: number | null
  run_timeout: number | null
  compaction_enabled: boolean | null
  compaction_strategy: "summary" | "relevance" | null
  compaction_keep_messages: number | null
  compaction_max_messages: number | null
  mcp_approve_writes: boolean | null
  timeout: number | null
  seed: number | null
  presence_penalty: number | null
  frequency_penalty: number | null
  logit_bias: Record<string, number> | null
  stop_sequences: string[] | null
  extra_body: Record<string, unknown> | null
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function booleanOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

function numberRecordOrNull(value: unknown): Record<string, number> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const entries = Object.entries(value)
  if (
    entries.some(
      ([, item]) => typeof item !== "number" || !Number.isFinite(item)
    )
  ) {
    return null
  }
  return Object.fromEntries(entries) as Record<string, number>
}

function stringListOrNull(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    return null
  }
  return [...value]
}

function recordOrNull(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return { ...(value as Record<string, unknown>) }
}

function tuningFrom(value: unknown): ConversationTuning {
  const stored =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}
  const compactionStrategy =
    stored.compaction_strategy === "summary" ||
    stored.compaction_strategy === "relevance"
      ? stored.compaction_strategy
      : null
  return {
    temperature: numberOrNull(stored.temperature),
    top_p: numberOrNull(stored.top_p),
    max_tokens: numberOrNull(stored.max_tokens),
    advisor_model: stringOrNull(stored.advisor_model),
    file_understanding_model: stringOrNull(stored.file_understanding_model),
    smart_search_model: stringOrNull(stored.smart_search_model),
    cache_enabled: booleanOrNull(stored.cache_enabled),
    background_subagents_enabled: booleanOrNull(
      stored.background_subagents_enabled
    ),
    request_timeout: numberOrNull(stored.request_timeout),
    run_timeout: numberOrNull(stored.run_timeout),
    compaction_enabled: booleanOrNull(stored.compaction_enabled),
    compaction_strategy: compactionStrategy,
    compaction_keep_messages: numberOrNull(stored.compaction_keep_messages),
    compaction_max_messages: numberOrNull(stored.compaction_max_messages),
    mcp_approve_writes: booleanOrNull(stored.mcp_approve_writes),
    timeout: numberOrNull(stored.timeout),
    seed: numberOrNull(stored.seed),
    presence_penalty: numberOrNull(stored.presence_penalty),
    frequency_penalty: numberOrNull(stored.frequency_penalty),
    logit_bias: numberRecordOrNull(stored.logit_bias),
    stop_sequences: stringListOrNull(stored.stop_sequences),
    extra_body: recordOrNull(stored.extra_body),
  }
}

type ConversationTuningState = {
  byId: Record<string, ConversationTuning>
  patchTuning: (
    conversationId: string | null,
    patch: Partial<ConversationTuning>
  ) => void
  resetTuning: (conversationId: string | null) => void
  adoptDraftTuning: (conversationId: string) => void
}

function conversationTuningKey(
  conversationId: string | null | undefined
): string {
  return conversationId?.trim() ? conversationId : DRAFT_TUNING_KEY
}

export function isConversationTuningActive(
  tuning: ConversationTuning
): boolean {
  return (
    tuning.temperature != null ||
    tuning.top_p != null ||
    tuning.max_tokens != null ||
    tuning.timeout != null ||
    tuning.seed != null ||
    tuning.presence_penalty != null ||
    tuning.frequency_penalty != null ||
    tuning.advisor_model != null ||
    tuning.file_understanding_model != null ||
    tuning.smart_search_model != null ||
    tuning.cache_enabled != null ||
    tuning.background_subagents_enabled != null ||
    tuning.request_timeout != null ||
    tuning.run_timeout != null ||
    tuning.compaction_enabled != null ||
    tuning.compaction_strategy != null ||
    tuning.compaction_keep_messages != null ||
    tuning.compaction_max_messages != null ||
    tuning.mcp_approve_writes != null ||
    (tuning.logit_bias != null && Object.keys(tuning.logit_bias).length > 0) ||
    (tuning.stop_sequences != null && tuning.stop_sequences.length > 0) ||
    (tuning.extra_body != null && Object.keys(tuning.extra_body).length > 0)
  )
}

function tuningFor(
  byId: Record<string, ConversationTuning>,
  key: string
): ConversationTuning {
  return tuningFrom(byId[key])
}

export const useConversationTuningStore = create<ConversationTuningState>()(
  persist(
    (set) => ({
      byId: {},
      patchTuning: (conversationId, patch) =>
        set((state) => {
          const key = conversationTuningKey(conversationId)
          return {
            byId: {
              ...state.byId,
              [key]: tuningFrom({ ...tuningFor(state.byId, key), ...patch }),
            },
          }
        }),
      resetTuning: (conversationId) =>
        set((state) => {
          const key = conversationTuningKey(conversationId)
          const next = { ...state.byId }
          delete next[key]
          return { byId: next }
        }),
      adoptDraftTuning: (conversationId) =>
        set((state) => {
          const draft = state.byId[DRAFT_TUNING_KEY]
          const next = { ...state.byId }
          if (draft) {
            next[conversationId] = tuningFrom(draft)
          }
          delete next[DRAFT_TUNING_KEY]
          return { byId: next }
        }),
    }),
    {
      name: "fba-buddy.conversation-tuning",
      storage: createJSONStorage(() => sourceStorage),
    }
  )
)

export function getConversationTuning(
  conversationId: string | null | undefined
): ConversationTuning {
  const key = conversationTuningKey(conversationId)
  return tuningFor(useConversationTuningStore.getState().byId, key)
}

export function useConversationTuning(
  conversationId: string | null | undefined
): ConversationTuning {
  const byId = useConversationTuningStore((state) => state.byId)
  return tuningFor(byId, conversationTuningKey(conversationId))
}
