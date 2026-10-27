import { z } from "zod"

import { modelOptionId, parseModelOptionId } from "@/features/chat/model-option"
import type { AppLocale } from "@/lib/general-settings"
import type { CronItem, CronWriteBody, ResourceStatus } from "@/lib/types"

export const CRON_NAME_MAX_LEN = 80
export const CRON_PROMPT_MAX_LEN = 2000

export const SCHEDULE_PRESETS = [
  { value: "every_5min", cron: "*/5 * * * *", label: "common.every5Minutes" },
  {
    value: "every_10min",
    cron: "*/10 * * * *",
    label: "common.every10Minutes",
  },
  {
    value: "every_30min",
    cron: "*/30 * * * *",
    label: "common.every30Minutes",
  },
  { value: "every_hour", cron: "0 * * * *", label: "common.everyHour" },
  { value: "every_2hours", cron: "0 */2 * * *", label: "common.every2Hours" },
  { value: "daily_9am", cron: "0 9 * * *", label: "common.dailyAt900" },
  { value: "daily_8pm", cron: "0 20 * * *", label: "common.dailyAt2000" },
  { value: "weekday_9am", cron: "0 9 * * 1-5", label: "common.weekdaysAt900" },
  { value: "weekly_mon_9am", cron: "0 9 * * 1", label: "common.mondaysAt900" },
  {
    value: "monthly_1st_9am",
    cron: "0 9 1 * *",
    label: "common.monthlyOnThe1stAt900",
  },
] as const

type SchedulePresetValue = (typeof SCHEDULE_PRESETS)[number]["value"]

export type CronTriggerKind = "cron" | "interval" | "date"
export type CronIntervalUnit = "seconds" | "minutes" | "hours"

export const cronEditorSchema = z
  .object({
    name: z.string().trim().max(CRON_NAME_MAX_LEN, "validation.nameTooLong"),
    conversationId: z.string().trim().min(1, "common.chooseAChat"),
    triggerKind: z.enum(["cron", "interval", "date"]),
    scheduleMode: z.enum(["preset", "custom"]),
    preset: z.string(),
    cronExpression: z.string().trim(),
    intervalAmount: z.string().trim(),
    intervalUnit: z.enum(["seconds", "minutes", "hours"]),
    runAt: z.string().trim(),
    prompt: z
      .string()
      .trim()
      .min(1, "common.promptIsRequired")
      .max(CRON_PROMPT_MAX_LEN, "validation.promptTooLong"),
    freshThread: z.boolean(),
    model: z.string(),
    mcpIds: z.array(z.number().int().positive()),
    active: z.boolean(),
  })
  .superRefine((value, context) => {
    if (value.triggerKind === "cron") {
      const expression =
        value.scheduleMode === "preset"
          ? presetToCron(value.preset)
          : value.cronExpression
      if (!expression) {
        context.addIssue({
          code: "custom",
          path: [value.scheduleMode === "preset" ? "preset" : "cronExpression"],
          message: "validation.executionTimeRequired",
        })
      } else if (expression.split(/\s+/).length !== 5) {
        context.addIssue({
          code: "custom",
          path: [value.scheduleMode === "preset" ? "preset" : "cronExpression"],
          message: "validation.cronExpressionMustHaveFiveFields",
        })
      }
      return
    }
    if (
      value.triggerKind === "interval" &&
      intervalInputToSeconds(value.intervalAmount, value.intervalUnit) == null
    ) {
      context.addIssue({
        code: "custom",
        path: ["intervalAmount"],
        message: "validation.intervalMustBePositive",
      })
      return
    }
    if (
      value.triggerKind === "date" &&
      localDateInputToIso(value.runAt) == null
    ) {
      context.addIssue({
        code: "custom",
        path: ["runAt"],
        message: "validation.runAtIsInvalid",
      })
    }
  })

export type CronEditorValues = z.output<typeof cronEditorSchema>

export function parseCronTrigger(trigger: string): {
  kind: CronTriggerKind
  value: string
} {
  const text = trigger.trim()
  const separator = text.indexOf(":")
  if (separator <= 0) {
    return { kind: "cron", value: text }
  }
  const kind = text.slice(0, separator)
  const value = text.slice(separator + 1).trim()
  if (kind === "cron" || kind === "interval" || kind === "date") {
    return { kind, value }
  }
  return { kind: "cron", value: text }
}

function normalizeCronExpression(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

function intervalInputToSeconds(
  amount: string,
  unit: CronIntervalUnit
): number | null {
  if (!/^\d+$/.test(amount.trim())) {
    return null
  }
  const multiplier = unit === "hours" ? 3600 : unit === "minutes" ? 60 : 1
  const seconds = Number(amount) * multiplier
  if (!Number.isSafeInteger(seconds) || seconds <= 0) {
    return null
  }
  return seconds
}

function intervalSecondsToInput(seconds: number): {
  amount: string
  unit: CronIntervalUnit
} {
  if (!Number.isSafeInteger(seconds) || seconds <= 0) {
    return { amount: "", unit: "seconds" }
  }
  if (seconds % 3600 === 0) {
    return { amount: String(seconds / 3600), unit: "hours" }
  }
  if (seconds % 60 === 0) {
    return { amount: String(seconds / 60), unit: "minutes" }
  }
  return { amount: String(seconds), unit: "seconds" }
}

function padDatePart(value: number): string {
  return String(value).padStart(2, "0")
}

export function dateTriggerToInput(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ""
  }
  return [
    `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`,
    `${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}:${padDatePart(date.getSeconds())}`,
  ].join("T")
}

function localDateInputToIso(value: string): string | null {
  const text = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(text)) {
    return null
  }
  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function displayInterval(seconds: number, locale: AppLocale): string {
  if (!Number.isSafeInteger(seconds) || seconds <= 0) {
    return String(seconds)
  }
  const { amount, unit } = intervalSecondsToInput(seconds)
  const formatted = new Intl.NumberFormat(locale, {
    style: "unit",
    unit: unit === "hours" ? "hour" : unit === "minutes" ? "minute" : "second",
    unitDisplay: "long",
  }).format(Number(amount))
  return locale === "en-US" ? `Every ${formatted}` : `每${formatted}`
}

export function displayCronTrigger(
  trigger: string,
  locale: AppLocale = "zh-CN"
): string {
  const parsed = parseCronTrigger(trigger)
  if (parsed.kind === "cron") {
    return parsed.value
  }
  if (parsed.kind === "interval") {
    const seconds = Number(parsed.value)
    return Number.isSafeInteger(seconds) && seconds > 0
      ? displayInterval(seconds, locale)
      : parsed.value
  }
  const date = new Date(parsed.value)
  return Number.isNaN(date.getTime())
    ? parsed.value
    : new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date)
}

function cronToPreset(cron: string): SchedulePresetValue | null {
  const normalized = cron.replace(/\s+/g, " ").trim()
  const preset = SCHEDULE_PRESETS.find((item) => item.cron === normalized)
  return preset ? preset.value : null
}

function presetToCron(presetValue: string): string | null {
  const preset = SCHEDULE_PRESETS.find((item) => item.value === presetValue)
  return preset ? preset.cron : null
}

export function resolveCronTrigger(value: CronEditorValues): string {
  if (value.triggerKind === "interval") {
    const seconds = intervalInputToSeconds(
      value.intervalAmount,
      value.intervalUnit
    )
    return `interval:${seconds ?? value.intervalAmount.trim()}`
  }
  if (value.triggerKind === "date") {
    const iso = localDateInputToIso(value.runAt)
    return `date:${iso ?? value.runAt.trim()}`
  }
  const cron =
    value.scheduleMode === "preset"
      ? presetToCron(value.preset)
      : normalizeCronExpression(value.cronExpression)
  return `cron:${cron ?? ""}`
}

export function cronEditorValuesFromItem(
  item: CronItem | null | undefined,
  fallbackConversationId = ""
): CronEditorValues {
  const parsed = parseCronTrigger(item?.trigger ?? "0 9 * * *")
  const matchedPreset =
    parsed.kind === "cron" ? cronToPreset(parsed.value) : null
  const interval =
    parsed.kind === "interval"
      ? intervalSecondsToInput(Number(parsed.value))
      : { amount: "1", unit: "hours" as const }
  return {
    name: item?.name ?? "",
    conversationId: item?.conversation_id ?? fallbackConversationId,
    triggerKind: parsed.kind,
    scheduleMode: matchedPreset ? "preset" : "custom",
    preset: matchedPreset ?? "daily_9am",
    cronExpression:
      parsed.kind === "cron"
        ? normalizeCronExpression(parsed.value)
        : "0 9 * * *",
    intervalAmount: interval.amount,
    intervalUnit: interval.unit,
    runAt: parsed.kind === "date" ? dateTriggerToInput(parsed.value) : "",
    prompt: item?.prompt ?? "",
    freshThread: Boolean(item?.fresh_thread),
    model: cronModelValue(item),
    mcpIds: item?.mcp_ids ?? [],
    active: item ? isCronActive(item.status) : true,
  }
}

export const CRON_MODEL_FOLLOW = "auto"

function cronModelValue(item: CronItem | null | undefined): string {
  if (!item?.provider_id || !item.model_id) {
    return CRON_MODEL_FOLLOW
  }
  return modelOptionId(item.provider_id, item.model_id)
}

export function cronWriteBodyFromEditor(
  value: CronEditorValues
): CronWriteBody {
  const parsed =
    value.model && value.model !== CRON_MODEL_FOLLOW
      ? parseModelOptionId(value.model)
      : null
  return {
    name: value.name.trim(),
    conversation_id: value.conversationId,
    trigger: resolveCronTrigger(value),
    prompt: value.prompt,
    fresh_thread: value.freshThread,
    provider_id: parsed?.providerId ?? null,
    model_id: parsed?.modelId ?? null,
    mcp_ids: value.mcpIds,
    status: cronStatus(value.active),
  }
}

export function isCronActive(status: number | undefined): boolean {
  return status === 1
}

export function cronStatus(active: boolean): ResourceStatus {
  return active ? 1 : 0
}

export function cronsForConversation(
  items: CronItem[],
  conversationId: string | null | undefined
): CronItem[] {
  if (!conversationId) {
    return []
  }
  return items.filter((item) => item.conversation_id === conversationId)
}

export function cronMatchesQuery(
  item: CronItem,
  query: string,
  conversationTitle?: string
): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) {
    return true
  }
  return [
    item.name,
    item.trigger,
    displayCronTrigger(item.trigger),
    item.prompt,
    conversationTitle,
  ].some((part) => part?.toLowerCase().includes(needle))
}
