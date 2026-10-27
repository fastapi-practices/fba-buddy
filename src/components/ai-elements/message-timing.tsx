"use client"

import { useChatMessageState } from "@/features/chat/chat-runtime"
import { CoinsIcon } from "lucide-react"
import type { FC } from "react"

import { Badge } from "@/components/ui/badge"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import { formatUsdCost } from "@/features/chat/context-usage"
import { useT } from "@/hooks/use-t"
import type { ChatMessageTiming, ChatMessageUsage } from "@/lib/types"
import { cn } from "@/lib/utils"

const formatTimingMs = (ms: number | undefined, compact = false): string => {
  if (ms === undefined) return "—"
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60_000) {
    const seconds = (ms / 1000).toFixed(compact ? 1 : 2)
    return `${seconds.replace(/\.?0+$/, "")}s`
  }
  const totalSeconds = Math.round(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes < 60) return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`
}

const formatTokenCount = (tokens: number): string => {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1).replace(/\.0$/, "")}k`
  }
  return `${tokens}`
}

const formatRate = (value: number): string =>
  `${value >= 100 ? Math.round(value) : value.toFixed(1).replace(/\.0$/, "")} tok/s`

const hasUsageData = (usage: ChatMessageUsage | undefined): boolean =>
  Boolean(
    usage &&
    (usage.inputTokens > 0 ||
      usage.outputTokens > 0 ||
      usage.totalTokens > 0 ||
      (usage.cacheReadTokens ?? 0) > 0 ||
      (usage.cacheWriteTokens ?? 0) > 0 ||
      (usage.reasoningTokens ?? 0) > 0 ||
      usage.costUsd != null)
  )

// actions 栏展示总消耗 token，耗时已经在执行过程里出现过
function tokenSummary(
  timing: ChatMessageTiming | undefined,
  usage: ChatMessageUsage | undefined
): string | undefined {
  const total = usage?.totalTokens ?? timing?.tokenCount
  if (total === undefined || total <= 0) return undefined
  return formatTokenCount(total)
}

// 没有 token 用量时退回耗时、速度或费用
function fallbackMetric(
  timing: ChatMessageTiming | undefined,
  usage: ChatMessageUsage | undefined
): string | undefined {
  const duration = timing?.totalStreamTime ?? timing?.firstTokenTime
  if (duration !== undefined) return formatTimingMs(duration, true)
  if (timing?.tokensPerSecond !== undefined) {
    return formatRate(timing.tokensPerSecond)
  }
  if (usage?.costUsd != null) return formatUsdCost(usage.costUsd)
  return undefined
}

function readModelId(custom: Record<string, unknown> | undefined) {
  const context = custom?.turnContext
  if (!context || typeof context !== "object") return undefined
  const record = context as Record<string, unknown>
  const value = record.model_id ?? record.modelId
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono tabular-nums">{value}</span>
    </div>
  )
}

export const MessageTiming: FC<{
  className?: string
  side?: "top" | "right" | "bottom" | "left"
}> = ({ className, side = "right" }) => {
  const t = useT()
  const timing = useChatMessageState((state) => state.message.metadata?.timing)
  const usage = useChatMessageState(
    (state) => state.message.metadata?.usage as ChatMessageUsage | undefined
  )
  const modelId = useChatMessageState((state) =>
    readModelId(state.message.metadata?.custom)
  )
  const usageData = hasUsageData(usage) ? usage : undefined
  if (!timing && !usageData && !modelId) return null
  const tokens = tokenSummary(timing, usageData)
  const fallback = fallbackMetric(timing, usageData)

  return (
    <HoverCard>
      <HoverCardTrigger
        delay={0}
        render={
          <Badge
            variant="ghost"
            render={<button type="button" />}
            data-slot="message-timing-trigger"
            aria-label={t("common.messageStatistics")}
            // 与其它 action 保持同样的视觉间距：文字两侧补足图标的内边距
            className={cn("border-0 px-1", className)}
          />
        }
      >
        {tokens ? (
          <>
            <span className="sr-only">{t("common.messageStatistics")}</span>
            <span>{t("common.totalConsumed")}</span>
            <CoinsIcon className="size-3.5 shrink-0" />
            <span className="font-mono tabular-nums">{tokens}</span>
          </>
        ) : fallback ? (
          <span className="font-mono tabular-nums">{fallback}</span>
        ) : (
          t("common.messageStatistics")
        )}
      </HoverCardTrigger>
      <HoverCardContent
        side={side}
        sideOffset={8}
        data-slot="message-timing-popover"
        className="w-56"
      >
        <div className="grid gap-2.5 text-xs">
          {modelId ? (
            <div className="flex items-baseline justify-between gap-4">
              <span className="shrink-0 text-muted-foreground">
                {t("common.modelId")}
              </span>
              <span className="min-w-0 truncate font-mono" title={modelId}>
                {modelId}
              </span>
            </div>
          ) : null}
          {modelId && (timing || usageData) ? (
            <div className="h-px bg-border" />
          ) : null}
          {usageData ? (
            <section className="grid gap-1.5">
              <div className="font-medium text-foreground">
                {t("common.usage")}
              </div>
              {usageData.inputTokens > 0 ? (
                <StatRow
                  label={t("common.input")}
                  value={formatTokenCount(usageData.inputTokens)}
                />
              ) : null}
              {usageData.outputTokens > 0 ? (
                <StatRow
                  label={t("common.output")}
                  value={formatTokenCount(usageData.outputTokens)}
                />
              ) : null}
              {(usageData.cacheReadTokens ?? 0) > 0 ? (
                <StatRow
                  label={t("common.cachedInput")}
                  value={formatTokenCount(usageData.cacheReadTokens ?? 0)}
                />
              ) : null}
              {(usageData.cacheWriteTokens ?? 0) > 0 ? (
                <StatRow
                  label={t("common.cachedOutput")}
                  value={formatTokenCount(usageData.cacheWriteTokens ?? 0)}
                />
              ) : null}
              {(usageData.reasoningTokens ?? 0) > 0 ? (
                <StatRow
                  label={t("common.thinking")}
                  value={formatTokenCount(usageData.reasoningTokens ?? 0)}
                />
              ) : null}
              {usageData.totalTokens > 0 ? (
                <StatRow
                  label={t("common.totalTokens")}
                  value={formatTokenCount(usageData.totalTokens)}
                />
              ) : null}
              {usageData.costUsd != null ? (
                <StatRow
                  label={t("common.messageCost")}
                  value={formatUsdCost(usageData.costUsd)}
                />
              ) : null}
            </section>
          ) : null}
          {usageData && timing ? <div className="h-px bg-border" /> : null}
          {timing ? (
            <section className="grid gap-1.5">
              <div className="font-medium text-foreground">
                {t("common.messageTiming")}
              </div>
              {timing.firstTokenTime !== undefined ? (
                <StatRow
                  label={t("common.firstToken")}
                  value={formatTimingMs(timing.firstTokenTime)}
                />
              ) : null}
              {timing.totalStreamTime !== undefined ? (
                <StatRow
                  label={t("common.total")}
                  value={formatTimingMs(timing.totalStreamTime)}
                />
              ) : null}
              {timing.tokensPerSecond !== undefined ? (
                <StatRow
                  label={t("common.speed")}
                  value={formatRate(timing.tokensPerSecond)}
                />
              ) : null}
              <StatRow
                label={t("common.chunks")}
                value={`${timing.totalChunks}`}
              />
              {timing.toolCallCount > 0 ? (
                <StatRow
                  label={t("common.tools")}
                  value={`${timing.toolCallCount}`}
                />
              ) : null}
            </section>
          ) : null}
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}
