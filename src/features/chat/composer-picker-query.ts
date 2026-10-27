export function matchesPickerQuery(
  query: string,
  ...parts: Array<string | null | undefined>
) {
  const needle = query.trim().toLowerCase()
  if (!needle) {
    return true
  }
  return parts.some((part) => part?.toLowerCase().includes(needle))
}
