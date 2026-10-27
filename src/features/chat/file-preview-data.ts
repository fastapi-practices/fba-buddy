export const PREVIEW_BYTE_LIMIT = 20 * 1024 * 1024
export const TEXT_PAGE_SIZE = 64 * 1024

export async function readPreviewText(
  response: Response,
  signal: AbortSignal
): Promise<string> {
  if (Number(response.headers.get("content-length")) > PREVIEW_BYTE_LIMIT) {
    await response.body?.cancel()
    throw new RangeError("Preview resource limit")
  }
  const reader = response.body?.getReader()
  if (!reader) {
    const blob = await response.blob()
    if (blob.size > PREVIEW_BYTE_LIMIT)
      throw new RangeError("Preview resource limit")
    return blob.text()
  }
  const decoder = new TextDecoder()
  let text = "",
    bytes = 0
  try {
    for (;;) {
      signal.throwIfAborted()
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > PREVIEW_BYTE_LIMIT) {
        await reader.cancel()
        throw new RangeError("Preview resource limit")
      }
      text += decoder.decode(value, { stream: true })
    }
    return text + decoder.decode()
  } finally {
    reader.releaseLock()
  }
}

export type CsvSort = { column: number; descending: boolean } | null

export function filterSortCsvRows(
  rows: readonly string[][],
  query: string,
  sort: CsvSort
): string[][] {
  const normalized = query.toLocaleLowerCase().trim()
  const filtered = normalized
    ? rows.filter((row) =>
        row.some((cell) => cell.toLocaleLowerCase().includes(normalized))
      )
    : rows.slice()
  if (!sort) return filtered
  const collator = new Intl.Collator(undefined, {
    numeric: true,
    sensitivity: "base",
  })
  return filtered.sort(
    (left, right) =>
      (sort.descending ? -1 : 1) *
      collator.compare(left[sort.column] ?? "", right[sort.column] ?? "")
  )
}
