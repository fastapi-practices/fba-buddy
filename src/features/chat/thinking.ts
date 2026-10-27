import type { TranslationKey } from "@/lib/i18n"
import type { ModelSelectorEffortOption } from "@/features/chat/model-option"
import type {
  ChatThinkingEffort,
  ModelThinking,
  ThinkingEffort,
  ThinkingMode,
} from "@/lib/types"

const THINKING_EFFORT_LABELS: Record<ThinkingEffort, TranslationKey> = {
  none: "common.default",
  off: "common.off",
  minimal: "common.minimal",
  low: "common.low",
  medium: "thinking.medium",
  high: "common.high",
  xhigh: "common.xhigh",
  max: "common.max",
}

const NAMED_EFFORTS = new Set<ThinkingEffort>([
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "off",
])

export function thinkingToEffort(
  thinking: ThinkingMode | undefined
): ThinkingEffort {
  if (typeof thinking === "string" && NAMED_EFFORTS.has(thinking)) {
    return thinking
  }
  if (thinking === true) {
    return "high"
  }
  return "none"
}

export function effortToThinking(effort: string): ThinkingMode {
  if (NAMED_EFFORTS.has(effort as ThinkingEffort)) {
    return effort as ThinkingMode
  }
  return false
}

export function thinkingForApi(
  thinking: ThinkingMode | undefined
): ChatThinkingEffort | null {
  if (thinking === undefined || thinking === false || thinking === null) {
    return null
  }
  if (thinking === true) {
    return "high"
  }
  return thinking
}

export function buildEffortOptions(
  thinking: ModelThinking | null | undefined,
  t: (key: TranslationKey) => string
): readonly ModelSelectorEffortOption[] | undefined {
  if (!thinking?.supported || thinking.efforts.length === 0) {
    return undefined
  }
  return thinking.efforts.map((id) => ({
    id,
    name: t(THINKING_EFFORT_LABELS[id]),
  }))
}

export function resolveThinkingForModel(
  thinking: ModelThinking | null | undefined,
  current: ThinkingMode | undefined
): ThinkingMode {
  if (!thinking?.supported) {
    return false
  }
  const effort = thinkingToEffort(current)
  if (thinking.efforts.includes(effort)) {
    return effort === "none" ? false : effort
  }
  return effortToThinking(thinking.default)
}
