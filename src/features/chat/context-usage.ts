import type { ComposerUsage } from "@/components/ai-elements/composer-context"
import type { TokenUsage } from "@/components/ai-elements/context"
import type {
  ChatMessage,
  ChatMessageUsage,
  SnapshotMessageUsage,
} from "@/lib/types"

const CJK_RE =
  /\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/u

export function estimateTextTokens(text: string): number {
  if (!text) {
    return 0
  }
  let cjk = 0
  let other = 0
  for (const char of text) {
    if (CJK_RE.test(char)) {
      cjk += 1
    } else {
      other += 1
    }
  }
  return Math.ceil(cjk / 1.5) + Math.ceil(other / 4)
}

type ThreadPart = {
  type?: string
  text?: string
  argsText?: string
  toolName?: string
}

export function textsFromMessageContent(content: unknown): {
  text: string
  reasoning: string
  tools: string
} {
  if (typeof content === "string") {
    return { text: content, reasoning: "", tools: "" }
  }
  if (!Array.isArray(content)) {
    return { text: "", reasoning: "", tools: "" }
  }
  let text = ""
  let reasoning = ""
  let tools = ""
  for (const part of content) {
    if (!part || typeof part !== "object") {
      continue
    }
    const item = part as ThreadPart
    if (item.type === "text") {
      text += item.text ?? ""
    } else if (item.type === "reasoning") {
      reasoning += item.text ?? ""
    } else if (item.type === "tool-call") {
      tools += `${item.toolName ?? ""}${item.argsText ?? ""}`
    }
  }
  return { text, reasoning, tools }
}

type ThreadUsageMessage = {
  role: string
  content?: unknown
  usage?: ChatMessageUsage
  metadata?: unknown
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return null
}

function asFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return undefined
}

function pickNumber(
  record: Record<string, unknown>,
  ...keys: string[]
): number | undefined {
  for (const key of keys) {
    const value = asFiniteNumber(record[key])
    if (value !== undefined) {
      return value
    }
  }
  return undefined
}

function reasoningTokensFromDetails(
  details: Record<string, unknown> | null
): number | undefined {
  if (!details) {
    return undefined
  }
  return pickNumber(
    details,
    "reasoning_tokens",
    "reasoningTokens",
    "output_reasoning_tokens"
  )
}

export function parseSnapshotUsage(
  raw: SnapshotMessageUsage | null | undefined,
  fallbackCost?: number | string | null
): ChatMessageUsage | undefined {
  const record = asRecord(raw)
  const cost =
    asFiniteNumber(record?.cost) ?? asFiniteNumber(fallbackCost ?? undefined)
  if (!record && cost === undefined) {
    return undefined
  }
  const source = record ?? {}
  const inputTokens = pickNumber(source, "inputTokens", "input_tokens") ?? 0
  const outputTokens = pickNumber(source, "outputTokens", "output_tokens") ?? 0
  const cacheReadTokens = pickNumber(
    source,
    "cacheReadTokens",
    "cache_read_tokens"
  )
  const cacheWriteTokens = pickNumber(
    source,
    "cacheWriteTokens",
    "cache_write_tokens"
  )
  const totalTokens =
    pickNumber(source, "totalTokens", "total_tokens") ??
    inputTokens + outputTokens
  const reasoningTokens = reasoningTokensFromDetails(asRecord(source.details))
  if (
    inputTokens === 0 &&
    outputTokens === 0 &&
    totalTokens === 0 &&
    !cacheReadTokens &&
    !cacheWriteTokens &&
    !reasoningTokens &&
    cost === undefined
  ) {
    return undefined
  }
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    ...(cacheReadTokens ? { cacheReadTokens } : {}),
    ...(cacheWriteTokens ? { cacheWriteTokens } : {}),
    ...(reasoningTokens ? { reasoningTokens } : {}),
    ...(cost !== undefined ? { costUsd: cost } : {}),
  }
}

function reportedUsage(
  message: ThreadUsageMessage
): ChatMessageUsage | undefined {
  if (message.usage) {
    return message.usage
  }
  const metadata = asRecord(message.metadata)
  const usage = metadata?.usage
  if (!usage || typeof usage !== "object") {
    return undefined
  }
  return usage as ChatMessageUsage
}

function totalCostUsd(messages: readonly ThreadUsageMessage[]): number | undefined {
  let total = 0
  let found = false
  for (const message of messages) {
    const cost = reportedUsage(message)?.costUsd
    if (cost !== undefined) {
      total += cost
      found = true
    }
  }
  return found ? total : undefined
}

function estimateUsageFromThreadMessages(
  messages: readonly ThreadUsageMessage[]
): TokenUsage {
  let inputTokens = 0
  let outputTokens = 0
  let reasoningTokens = 0
  for (const message of messages) {
    const parts = textsFromMessageContent(message.content)
    const textTokens = estimateTextTokens(parts.text)
    const toolTokens = estimateTextTokens(parts.tools)
    const thinkTokens = estimateTextTokens(parts.reasoning)
    if (message.role === "user") {
      inputTokens += textTokens + toolTokens
    } else {
      outputTokens += textTokens
      inputTokens += toolTokens
      reasoningTokens += thinkTokens
    }
  }
  return {
    inputTokens,
    outputTokens,
    reasoningTokens,
    totalTokens: inputTokens + outputTokens + reasoningTokens,
  }
}

export function usageFromThreadMessages(
  messages: readonly ThreadUsageMessage[]
): TokenUsage {
  const cost = totalCostUsd(messages)
  const lastReported = [...messages]
    .reverse()
    .map(reportedUsage)
    .find((item) => item && item.totalTokens > 0)
  if (lastReported) {
    return {
      inputTokens: lastReported.inputTokens,
      outputTokens: lastReported.outputTokens,
      cachedInputTokens: lastReported.cacheReadTokens,
      reasoningTokens: lastReported.reasoningTokens,
      totalTokens: lastReported.totalTokens,
      costUsd: lastReported.costUsd,
      totalCostUsd: cost,
    }
  }
  return {
    ...estimateUsageFromThreadMessages(messages),
    totalCostUsd: cost,
  }
}

export function formatUsdCost(value: number): string {
  if (value === 0) {
    return "$0"
  }
  if (value >= 0.01) {
    return `$${value.toFixed(2)}`
  }
  return `$${value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "")}`
}

export function tokensToK(tokens: number): number {
  return Math.max(0, Math.round(tokens / 1000))
}

export function composerUsageFromThreadMessages(
  messages: readonly { role: string; content?: unknown }[],
  modelContextWindow: number
): ComposerUsage {
  let tools = 0
  let conversation = 0
  for (const message of messages) {
    const parts = textsFromMessageContent(message.content)
    tools += estimateTextTokens(parts.tools)
    conversation +=
      estimateTextTokens(parts.text) + estimateTextTokens(parts.reasoning)
  }
  return {
    system: 0,
    tools: tokensToK(tools),
    messages: tokensToK(conversation),
    total: tokensToK(modelContextWindow),
  }
}

export function usageFromChatMessages(
  messages: readonly ChatMessage[]
): TokenUsage {
  return usageFromThreadMessages(
    messages.map((message) => ({
      role: message.role,
      usage: message.usage,
      content: [
        ...(message.thinking
          ? [{ type: "reasoning", text: message.thinking }]
          : []),
        ...(message.tools ?? []).map((tool) => ({
          type: "tool-call",
          toolName: tool.name,
          argsText: tool.args,
        })),
        { type: "text", text: message.content },
      ],
    }))
  )
}
