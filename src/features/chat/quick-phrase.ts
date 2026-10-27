export function insertQuickPhrase(draft: string, phrase: string): string {
  const next = phrase.trim()
  if (!next) {
    return draft
  }
  const current = draft.trimEnd()
  if (!current) {
    return next
  }
  return `${current}\n${next}`
}
