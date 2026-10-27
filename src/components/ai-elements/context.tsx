"use client"

import {
  createContext,
  useContext,
  useMemo,
  type ComponentProps,
  type ReactNode,
} from "react"

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import { Progress } from "@/components/ui/progress"
import type { TranslationKey } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { useT } from "@/hooks/use-t"

export type TokenUsage = {
  totalTokens?: number | undefined
  inputTokens?: number | undefined
  cachedInputTokens?: number | undefined
  outputTokens?: number | undefined
  reasoningTokens?: number | undefined
  costUsd?: number | undefined
  totalCostUsd?: number | undefined
}

type ContextState = {
  usedTokens: number
  maxTokens: number
  percent: number
  usage: TokenUsage | undefined
  modelId: string | undefined
}

const ContextContext = createContext<ContextState | null>(null)

function useContextState() {
  const state = useContext(ContextContext)
  if (!state) {
    throw new Error("Context.* must be used within Context")
  }
  return state
}

function formatTokens(value: number) {
  if (value < 1000) {
    return String(value)
  }
  return `${(value / 1000).toFixed(1).replace(/\.0$/, "")}k`
}

const formatCost = (value: number): string => {
  if (value === 0) return "$0"
  if (value >= 0.01) return `$${value.toFixed(2)}`
  return `$${value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "")}`
}

type UsageSeverity = "normal" | "warning" | "critical"

const getUsageSeverity = (percent: number): UsageSeverity => {
  if (percent > 85) return "critical"
  if (percent >= 65) return "warning"
  return "normal"
}

const getStrokeColor = (percent: number): string => {
  const severity = getUsageSeverity(percent)
  if (severity === "critical") return "stroke-red-500"
  if (severity === "warning") return "stroke-amber-500"
  return "stroke-foreground"
}

/** 上下文用量：HoverCard 展示对话占掉了模型上下文窗口的多大比例 */
export function Context({
  maxTokens,
  usage,
  modelId,
  children,
}: {
  maxTokens: number
  usage?: TokenUsage | undefined
  modelId?: string | undefined
  children: ReactNode
}) {
  const usedTokens = usage?.totalTokens ?? 0
  const percent =
    maxTokens > 0 ? Math.min((usedTokens / maxTokens) * 100, 100) : 0
  const state = useMemo(
    () => ({ usedTokens, maxTokens, percent, usage, modelId }),
    [usedTokens, maxTokens, percent, usage, modelId]
  )
  if (!usage && usedTokens <= 0) return null
  return (
    <ContextContext.Provider value={state}>
      <HoverCard>{children}</HoverCard>
    </ContextContext.Provider>
  )
}

export function ContextTrigger({
  className,
  children,
  ...props
}: ComponentProps<"button">) {
  const { percent } = useContextState()
  const t = useT()
  return (
    <HoverCardTrigger
      delay={10}
      closeDelay={100}
      render={
        <button
          type="button"
          data-slot="context-trigger"
          aria-label={t("common.contextUsage")}
          className={cn(
            "inline-flex items-center rounded-md transition-colors",
            className
          )}
          {...props}
        />
      }
    >
      {children ?? (
        <span className="font-mono tabular-nums">{Math.round(percent)}%</span>
      )}
    </HoverCardTrigger>
  )
}

export function ContextContent({
  side = "top",
  className,
  ...props
}: ComponentProps<typeof HoverCardContent>) {
  return (
    <HoverCardContent
      side={side}
      data-slot="context-content"
      className={cn("flex w-64 flex-col gap-3", className)}
      {...props}
    />
  )
}

export function ContextContentHeader({
  className,
  ...props
}: ComponentProps<"div">) {
  const { usedTokens, maxTokens, percent } = useContextState()
  const t = useT()
  return (
    <div className={cn("flex flex-col gap-3", className)} {...props}>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium">{t("common.context")}</span>
        <span className="text-muted-foreground">
          {formatTokens(Math.min(usedTokens, maxTokens))} /{" "}
          {formatTokens(maxTokens)}
        </span>
      </div>
      <Progress value={percent} aria-label={t("common.contextUsage")} />
    </div>
  )
}

type ContextSegment = {
  label: TranslationKey
  tokens: number
}

const getContextSegments = (
  usage: TokenUsage | undefined
): ContextSegment[] => {
  if (!usage) return []
  const segments: ContextSegment[] = [
    { label: "common.input", tokens: usage.inputTokens ?? 0 },
    { label: "common.cachedInput", tokens: usage.cachedInputTokens ?? 0 },
    { label: "common.output", tokens: usage.outputTokens ?? 0 },
    { label: "common.thinking", tokens: usage.reasoningTokens ?? 0 },
  ]
  return segments.filter((segment) => segment.tokens > 0)
}

export function ContextContentBody({
  className,
  ...props
}: ComponentProps<"div">) {
  const { usage } = useContextState()
  const t = useT()
  const segments = getContextSegments(usage)
  if (segments.length === 0) return null
  return (
    <div className={cn("flex flex-col gap-1 text-sm", className)} {...props}>
      {segments.map((segment) => (
        <div key={segment.label} className="flex justify-between gap-3">
          <span className="text-muted-foreground">{t(segment.label)}</span>
          <span>{formatTokens(segment.tokens)}</span>
        </div>
      ))}
    </div>
  )
}

export function ContextContentFooter({
  className,
  ...props
}: ComponentProps<"div">) {
  const { usage } = useContextState()
  const t = useT()
  if (usage?.costUsd == null && usage?.totalCostUsd == null) return null
  return (
    <div className={cn("flex flex-col gap-1 text-sm", className)} {...props}>
      {usage.costUsd != null ? (
        <div className="flex justify-between gap-3">
          <span className="text-muted-foreground">{t("common.turnCost")}</span>
          <span>{formatCost(usage.costUsd)}</span>
        </div>
      ) : null}
      {usage.totalCostUsd != null ? (
        <div className="flex justify-between gap-3">
          <span className="text-muted-foreground">{t("common.totalCost")}</span>
          <span>{formatCost(usage.totalCostUsd)}</span>
        </div>
      ) : null}
    </div>
  )
}

const RING_SIZE = 18
const RING_STROKE = 2.5
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

/** 触发器上的环形用量指示 */
export function ContextRing() {
  const { percent } = useContextState()
  return (
    <svg
      aria-hidden="true"
      width={RING_SIZE}
      height={RING_SIZE}
      viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
      className="-rotate-90"
    >
      <circle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={RING_RADIUS}
        fill="none"
        strokeWidth={RING_STROKE}
        className="stroke-muted-foreground"
      />
      <circle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={RING_RADIUS}
        fill="none"
        strokeWidth={RING_STROKE}
        strokeLinecap="round"
        strokeDasharray={RING_CIRCUMFERENCE}
        strokeDashoffset={
          RING_CIRCUMFERENCE - (percent / 100) * RING_CIRCUMFERENCE
        }
        className={cn(
          "transition-[stroke-dashoffset,stroke] duration-300",
          getStrokeColor(percent)
        )}
      />
    </svg>
  )
}
