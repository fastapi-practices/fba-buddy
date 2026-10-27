export const STARTER_MAX = 8
export const STARTER_TEXT_MAX = 256

export function normalizeStarters(starters: readonly string[]): string[] {
  const values: string[] = []
  for (const item of starters) {
    const text = item.trim().slice(0, STARTER_TEXT_MAX)
    if (!text) {
      continue
    }
    values.push(text)
    if (values.length >= STARTER_MAX) {
      break
    }
  }
  return values
}
