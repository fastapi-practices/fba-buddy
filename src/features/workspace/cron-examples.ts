import {
  cronEditorValuesFromItem,
  type CronEditorValues,
} from "@/features/chat/conversation-cron"
import type { TranslationKey } from "@/lib/i18n"
import type { CronItem } from "@/lib/types"

export type CronExample = {
  id: string
  titleKey: TranslationKey
  descriptionKey: TranslationKey
  promptKey: TranslationKey
  trigger: string
  freshThread: boolean
}

export type CronExampleDraft = Pick<
  CronItem,
  "name" | "trigger" | "prompt" | "fresh_thread"
>

export const CRON_EXAMPLES: readonly CronExample[] = [
  {
    id: "aiNews",
    titleKey: "cronExample.aiNewsTitle",
    descriptionKey: "cronExample.aiNewsDescription",
    promptKey: "cronExample.aiNewsPrompt",
    trigger: "cron:0 9 * * *",
    freshThread: true,
  },
  {
    id: "englishWords",
    titleKey: "cronExample.englishWordsTitle",
    descriptionKey: "cronExample.englishWordsDescription",
    promptKey: "cronExample.englishWordsPrompt",
    trigger: "cron:0 9 * * *",
    freshThread: true,
  },
  {
    id: "bedtimeStory",
    titleKey: "cronExample.bedtimeStoryTitle",
    descriptionKey: "cronExample.bedtimeStoryDescription",
    promptKey: "cronExample.bedtimeStoryPrompt",
    trigger: "cron:0 20 * * *",
    freshThread: true,
  },
  {
    id: "weeklyReport",
    titleKey: "cronExample.weeklyReportTitle",
    descriptionKey: "cronExample.weeklyReportDescription",
    promptKey: "cronExample.weeklyReportPrompt",
    trigger: "cron:0 18 * * 5",
    freshThread: true,
  },
  {
    id: "movieRecommendation",
    titleKey: "cronExample.movieRecommendationTitle",
    descriptionKey: "cronExample.movieRecommendationDescription",
    promptKey: "cronExample.movieRecommendationPrompt",
    trigger: "cron:0 20 * * *",
    freshThread: true,
  },
  {
    id: "todayInHistory",
    titleKey: "cronExample.todayInHistoryTitle",
    descriptionKey: "cronExample.todayInHistoryDescription",
    promptKey: "cronExample.todayInHistoryPrompt",
    trigger: "cron:0 9 * * *",
    freshThread: true,
  },
  {
    id: "dailyWhy",
    titleKey: "cronExample.dailyWhyTitle",
    descriptionKey: "cronExample.dailyWhyDescription",
    promptKey: "cronExample.dailyWhyPrompt",
    trigger: "cron:0 9 * * *",
    freshThread: true,
  },
  {
    id: "parentsContact",
    titleKey: "cronExample.parentsContactTitle",
    descriptionKey: "cronExample.parentsContactDescription",
    promptKey: "cronExample.parentsContactPrompt",
    trigger: "cron:0 10 * * 0",
    freshThread: true,
  },
  {
    id: "healthAppointment",
    titleKey: "cronExample.healthAppointmentTitle",
    descriptionKey: "cronExample.healthAppointmentDescription",
    promptKey: "cronExample.healthAppointmentPrompt",
    trigger: "date:2026-10-28T07:00:00+08:00",
    freshThread: true,
  },
]

export function cronEditorValuesFromExample(
  example: CronExampleDraft,
  conversationId: string
): CronEditorValues {
  return cronEditorValuesFromItem(
    { id: 0, ...example, conversation_id: conversationId, status: 1 },
    conversationId
  )
}
