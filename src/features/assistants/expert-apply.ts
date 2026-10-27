import { z } from "zod"

import { normalizeStarters } from "@/features/assistants/starters"
import { zodFieldErrors } from "@/lib/form"
import type {
  ApplyExpertResult,
  ExpertItem,
  ExpertWriteBody,
} from "@/lib/types"

export function expertOpenings(expert: Pick<ExpertItem, "starters">): string[] {
  return (expert.starters ?? []).map((item) => item.trim()).filter(Boolean)
}

export function expertOpening(expert: Pick<ExpertItem, "starters">): string {
  return expertOpenings(expert)[0] ?? ""
}

function expertMatchesQuery(item: ExpertItem, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) {
    return true
  }
  const haystack = [
    item.name,
    item.description,
    item.prompt,
    ...(item.starters ?? []),
  ]
  return haystack.some((part) => part?.toLowerCase().includes(needle))
}

export function filterExperts(
  items: ExpertItem[],
  query: string
): ExpertItem[] {
  return items.filter((item) => expertMatchesQuery(item, query))
}

const expertEditorSchema = z.object({
  name: z.string().trim().min(1, "common.nameIsRequired"),
  prompt: z.string().trim().min(1, "validation.promptRequired"),
  description: z.string(),
  starters: z.array(z.string()),
  mcp_ids: z.array(z.number().int()),
  skill_ids: z.array(z.number().int()),
  knowledge_ids: z.array(z.number().int()),
  sort: z.number().int(),
})

export const expertEditorFormSchema = expertEditorSchema.omit({
  sort: true,
})

export type ExpertEditorField = "name" | "prompt"

export type ExpertEditorInput = {
  name: string
  prompt: string
  description: string
  starters: string[]
  mcp_ids: number[]
  skill_ids: number[]
  knowledge_ids: number[]
  sort?: number
}

export function parseExpertEditorInput(
  input: ExpertEditorInput
):
  | { ok: true; body: ExpertWriteBody }
  | { ok: false; errors: Partial<Record<ExpertEditorField, string>> } {
  const result = expertEditorSchema.safeParse({
    name: input.name,
    prompt: input.prompt,
    description: input.description.trim(),
    starters: input.starters,
    mcp_ids: input.mcp_ids,
    skill_ids: input.skill_ids,
    knowledge_ids: input.knowledge_ids,
    sort: input.sort ?? 0,
  })
  if (!result.success) {
    return {
      ok: false,
      errors: zodFieldErrors<ExpertEditorField>(result.error),
    }
  }
  const value = result.data
  return {
    ok: true,
    body: {
      name: value.name,
      prompt: value.prompt,
      description: value.description || null,
      starters: normalizeStarters(value.starters),
      mcp_ids: value.mcp_ids,
      skill_ids: value.skill_ids,
      knowledge_ids: value.knowledge_ids,
      sort: value.sort,
    },
  }
}

export function composerPatchFromExpert(result: ApplyExpertResult): {
  assistantId: number | null
  mcpIds: number[]
  opening: string
} {
  return {
    assistantId: result.assistant_id,
    mcpIds: result.mcp_ids ?? [],
    opening: expertOpening({ starters: result.starters ?? [] }),
  }
}
