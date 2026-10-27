export function markdownTableSource(
  text: string,
  start?: number,
  end?: number
) {
  if (start === undefined || end === undefined || start < 0 || end <= start)
    return ""
  return text
    .slice(start, end)
    .split("\n")
    .map((line) => line.replace(/^(?:\s*>\s*)+/, "").trimStart())
    .join("\n")
    .trim()
}

export function tableRowsToMarkdown(rows: readonly (readonly string[])[]) {
  if (!rows.length) return ""
  const columns = Math.max(...rows.map((row) => row.length))
  const line = (row: readonly string[]) =>
    `| ${Array.from({ length: columns }, (_, i) => (row[i] ?? "").replaceAll("\\", "\\\\").replaceAll("|", "\\|").replace(/\r?\n/g, "<br>")).join(" | ")} |`
  return [
    line(rows[0]!),
    line(Array(columns).fill("---")),
    ...rows.slice(1).map(line),
  ].join("\n")
}
