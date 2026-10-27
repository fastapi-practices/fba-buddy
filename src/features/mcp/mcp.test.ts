import { describe, expect, it } from "vitest"

import {
  mcpEditorSchema,
  mcpEndpoint,
  mcpMatchesQuery,
  mcpTypeLabel,
  mcpWriteBodyFromEditor,
} from "@/features/mcp/mcp"
import type { McpItem } from "@/lib/types"

const mcp: McpItem = {
  id: 1,
  name: "网页搜索",
  description: "搜网页",
  type: 2,
  url: "https://example.com/mcp",
  command: null,
  tool_prefix: "web",
}

describe("mcp helpers", () => {
  it("labels transport types", () => {
    expect(mcpTypeLabel(0)).toBe("stdio")
    expect(mcpTypeLabel(1)).toBe("SSE")
    expect(mcpTypeLabel(2)).toBe("HTTP")
  })

  it("prefers url, then command, then description", () => {
    expect(mcpEndpoint(mcp)).toBe("https://example.com/mcp")
    expect(
      mcpEndpoint({ url: "", command: "npx demo", description: "x" })
    ).toBe("npx demo")
  })

  it("filters by name, endpoint, or type", () => {
    expect(mcpMatchesQuery(mcp, "网页")).toBe(true)
    expect(mcpMatchesQuery(mcp, "HTTP")).toBe(true)
    expect(mcpMatchesQuery(mcp, "stdio")).toBe(false)
  })
})

describe("mcpEditorSchema", () => {
  it("requires a name and url for HTTP", () => {
    const result = mcpEditorSchema.safeParse({
      name: "  ",
      type: "2",
      url: "",
      command: "",
      argsText: "",
      envText: "",
      headersText: "",
    })
    expect(result.success).toBe(false)
  })

  it("builds a write body from HTTP fields", () => {
    const parsed = mcpEditorSchema.safeParse({
      name: " GitHub ",
      type: "2",
      url: " https://example.com/mcp ",
      command: "",
      argsText: "",
      envText: "",
      headersText: '{"Authorization":"Bearer x"}',
    })
    expect(parsed.success).toBe(true)
    if (!parsed.success) {
      return
    }
    expect(mcpWriteBodyFromEditor(parsed.data)).toEqual({
      name: "GitHub",
      type: 2,
      url: "https://example.com/mcp",
      headers: { Authorization: "Bearer x" },
    })
  })
})
