import { z } from "zod"

import { zodFieldErrors } from "@/lib/form"
import type { QuickPhraseWriteBody } from "@/lib/types"

export const phraseEditorSchema = z.object({
  title: z.string().trim().min(1, "common.titleIsRequired"),
  content: z.string().trim().min(1, "common.contentIsRequired"),
})

export type PhraseEditorField = "title" | "content"

export function parsePhraseEditorInput(input: {
  title: string
  content: string
}):
  | { ok: true; body: QuickPhraseWriteBody }
  | { ok: false; errors: Partial<Record<PhraseEditorField, string>> } {
  const result = phraseEditorSchema.safeParse(input)
  if (!result.success) {
    return {
      ok: false,
      errors: zodFieldErrors<PhraseEditorField>(result.error),
    }
  }
  return {
    ok: true,
    body: {
      title: result.data.title,
      content: result.data.content,
    },
  }
}
