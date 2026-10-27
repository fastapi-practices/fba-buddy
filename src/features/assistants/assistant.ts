import type { TranslationKey } from "@/lib/i18n"
import { z } from "zod"

import { normalizeStarters } from "@/features/assistants/starters"
import { zodFieldErrors } from "@/lib/form"
import type { AppLocale } from "@/lib/general-settings"
import type {
  AssistantCategoryItem,
  AssistantItem,
  AssistantSortType,
  AssistantWriteBody,
} from "@/lib/types"

function formatOneDecimal(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

export function formatUsageCount(
  count: number,
  locale: AppLocale = "zh-CN"
): string {
  const safe = Number.isFinite(count) && count > 0 ? count : 0
  if (locale === "en-US") {
    if (safe < 1000) {
      return `${safe} uses`
    }
    if (safe < 1_000_000) {
      return `${formatOneDecimal(safe / 1000)}K uses`
    }
    if (safe < 1_000_000_000) {
      return `${formatOneDecimal(safe / 1_000_000)}M uses`
    }
    return `${formatOneDecimal(safe / 1_000_000_000)}B uses`
  }
  if (safe < 1000) {
    return `${safe} 次使用`
  }
  if (safe < 10_000) {
    return `${formatOneDecimal(safe / 1000)} 千次使用`
  }
  if (safe < 100_000_000) {
    return `${formatOneDecimal(safe / 10_000)} 万次使用`
  }
  return `${formatOneDecimal(safe / 100_000_000)} 亿次使用`
}

export const ALL_ASSISTANT_CATEGORY = "all"
export const NONE_ASSISTANT_CATEGORY = "none"

const assistantEditorSchema = z.object({
  name: z.string().trim().min(1, "common.nameIsRequired"),
  prompt: z.string().trim().min(1, "validation.promptRequired"),
  description: z.string(),
  category: z.string(),
  starters: z.array(z.string()),
  sort: z.number().int(),
})

export const assistantEditorFormSchema = assistantEditorSchema.omit({
  sort: true,
})

export type AssistantEditorField = "name" | "prompt"

export type AssistantEditorInput = {
  name: string
  prompt: string
  description: string
  category: string
  starters: string[]
  sort?: number
}

export function parseAssistantEditorInput(
  input: AssistantEditorInput
):
  | { ok: true; body: AssistantWriteBody }
  | { ok: false; errors: Partial<Record<AssistantEditorField, string>> } {
  const result = assistantEditorSchema.safeParse({
    name: input.name,
    prompt: input.prompt,
    description: input.description.trim(),
    category: input.category.trim() || NONE_ASSISTANT_CATEGORY,
    starters: input.starters,
    sort: input.sort ?? 0,
  })
  if (!result.success) {
    return {
      ok: false,
      errors: zodFieldErrors<AssistantEditorField>(result.error),
    }
  }
  const value = result.data
  return {
    ok: true,
    body: {
      name: value.name,
      prompt: value.prompt,
      description: value.description || null,
      category:
        value.category === NONE_ASSISTANT_CATEGORY ? null : value.category,
      starters: normalizeStarters(value.starters),
      sort: value.sort,
    },
  }
}

export const ASSISTANT_SORT_OPTIONS: ReadonlyArray<{
  value: AssistantSortType
  label: TranslationKey
}> = [
  { value: "comprehensive", label: "common.recommended" },
  { value: "hottest", label: "common.popular" },
  { value: "newest", label: "common.newest" },
]

export function sortAssistants(items: AssistantItem[]): AssistantItem[] {
  return [...items].sort((a, b) => a.sort - b.sort || a.id - b.id)
}

export function assistantOpenings(item: AssistantItem): string[] {
  return (item.starters ?? []).map((starter) => starter.trim()).filter(Boolean)
}

export function assistantOpening(item: AssistantItem): string {
  return assistantOpenings(item)[0] ?? ""
}

export function pickAssistantOpening(
  item: AssistantItem,
  random = Math.random
): string {
  const openings = assistantOpenings(item)
  if (openings.length === 0) {
    return ""
  }
  const index = Math.min(
    openings.length - 1,
    Math.floor(random() * openings.length)
  )
  return openings[index] ?? ""
}

export function composerTextFromAssistantOpening(
  item: AssistantItem,
  random = Math.random
): string {
  return pickAssistantOpening(item, random)
}

export const NONE_ASSISTANT_OPTION_ID = "none"

export function parseAssistantOptionId(
  value: string
): number | null | undefined {
  if (value === NONE_ASSISTANT_OPTION_ID) {
    return null
  }
  const id = Number(value)
  if (!Number.isInteger(id)) {
    return undefined
  }
  return id
}

export function assistantInitial(item: AssistantItem): string {
  return item.name.trim().slice(0, 1) || "?"
}

function assistantMatchesQuery(
  item: AssistantItem,
  query: string
): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) {
    return true
  }
  const haystack = [
    item.name,
    item.description,
    item.category,
    ...assistantOpenings(item),
  ]
  return haystack.some((part) => part?.toLowerCase().includes(needle))
}

export function filterAssistants(
  items: AssistantItem[],
  query: string,
  category = ALL_ASSISTANT_CATEGORY
): AssistantItem[] {
  return items.filter((item) => {
    if (!assistantMatchesQuery(item, query)) {
      return false
    }
    if (category === ALL_ASSISTANT_CATEGORY) {
      return true
    }
    const code = item.category?.trim() ?? ""
    return code === category
  })
}

export function assistantCategoryLabel(
  code: string,
  categories: readonly AssistantCategoryItem[],
  uncategorizedLabel: string
): string {
  const trimmed = code.trim()
  if (!trimmed) {
    return uncategorizedLabel
  }
  return categories.find((item) => item.code === trimmed)?.name ?? trimmed
}

export function groupAssistantsByCategory(
  items: AssistantItem[],
  categories: readonly AssistantCategoryItem[] = []
): Array<{ category: string; items: AssistantItem[] }> {
  const groups: Array<{ category: string; items: AssistantItem[] }> = []
  const indexByCategory = new Map<string, number>()
  for (const item of sortAssistants(items)) {
    const category = item.category?.trim() ?? ""
    const existing = indexByCategory.get(category)
    if (existing == null) {
      indexByCategory.set(category, groups.length)
      groups.push({ category, items: [item] })
    } else {
      groups[existing]?.items.push(item)
    }
  }
  if (categories.length === 0) {
    return groups
  }
  const rank = new Map(
    categories.map((item, index) => [item.code, item.sort || index + 1])
  )
  return [...groups].sort((left, right) => {
    if (!left.category) {
      return 1
    }
    if (!right.category) {
      return -1
    }
    return (rank.get(left.category) ?? 999) - (rank.get(right.category) ?? 999)
  })
}

export function completionAssistantId(input: {
  isNewConversation: boolean
  assistantId: number | null | undefined
}): number | undefined {
  if (!input.isNewConversation || input.assistantId == null) {
    return undefined
  }
  return input.assistantId
}
