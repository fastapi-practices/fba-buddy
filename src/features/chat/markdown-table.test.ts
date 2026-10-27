import { describe, expect, it } from "vitest"
import { markdownTableSource, tableRowsToMarkdown } from "./markdown-table"

describe("Markdown table copy", () => {
  it("copies only the selected table and preserves alignment and inline Markdown", () => {
    const table =
      "| Name | Value |\n| :--- | ---: |\n| **bold** | `a\\|b` |\n| [link](https://example.com) | 3 |"
    const text = `Before\n\n${table}\n\nAfter\n\n| Other |\n| --- |\n| 4 |`
    expect(markdownTableSource(text, 8, 8 + table.length)).toBe(table)
  })

  it("copies blockquote tables as standalone Markdown tables", () => {
    const text = "| A | B |\n> | --- | --- |\n> | 1 | 2 |"
    expect(markdownTableSource(text, 0, text.length)).toBe(
      "| A | B |\n| --- | --- |\n| 1 | 2 |"
    )
  })

  it("escapes pipes and line breaks when original source is unavailable", () => {
    expect(
      tableRowsToMarkdown([
        ["A", "B"],
        ["x|y", "one\ntwo"],
      ])
    ).toBe("| A | B |\n| --- | --- |\n| x\\|y | one<br>two |")
    expect(markdownTableSource("text")).toBe("")
  })
})
