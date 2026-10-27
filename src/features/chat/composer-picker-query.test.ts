import { describe, expect, it } from "vitest"

import { matchesPickerQuery } from "@/features/chat/composer-picker-query"

describe("matchesPickerQuery", () => {
  it("matches all items when the query is blank", () => {
    expect(matchesPickerQuery("", "Exa", "exa")).toBe(true)
    expect(matchesPickerQuery("   ", "Tavily")).toBe(true)
  })

  it("matches any field case-insensitively", () => {
    expect(matchesPickerQuery("exa", "Exa Search", "exa")).toBe(true)
    expect(matchesPickerQuery("WRITE", "文件系统", "Allow writes")).toBe(true)
    expect(matchesPickerQuery("总结", "周报", "帮我总结本周工作")).toBe(true)
    expect(
      matchesPickerQuery("github", "GitHub MCP", null, "https://api.github.com")
    ).toBe(true)
  })

  it("rejects items that do not contain the query", () => {
    expect(matchesPickerQuery("duck", "Exa", "exa")).toBe(false)
    expect(matchesPickerQuery("tavily", "关闭", "off")).toBe(false)
  })
})
