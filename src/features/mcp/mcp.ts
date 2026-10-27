import { z } from "zod"

import type { McpItem, McpWriteBody } from "@/lib/types"

const MCP_TYPE_VALUES = ["0", "1", "2"] as const

export const MCP_TYPE_ITEMS = [
  { value: "2", label: "Streamable HTTP" },
  { value: "1", label: "SSE" },
  { value: "0", label: "stdio" },
] as const

export const mcpEditorSchema = z
  .object({
    name: z.string().trim().min(1, "common.nameIsRequired"),
    type: z.enum(MCP_TYPE_VALUES),
    url: z.string(),
    command: z.string(),
    argsText: z.string(),
    envText: z.string(),
    headersText: z.string(),
  })
  .superRefine((value, ctx) => {
    if (value.type === "0") {
      if (!value.command.trim()) {
        ctx.addIssue({
          code: "custom",
          path: ["command"],
          message: "common.stdioNeedsACommand",
        })
      }
      if (!isJsonObjectText(value.envText)) {
        ctx.addIssue({
          code: "custom",
          path: ["envText"],
          message: "common.headersMustBeAJsonObject",
        })
      }
      return
    }
    if (!value.url.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["url"],
        message: "common.enterAnMcpUrl",
      })
    }
    if (!isJsonObjectText(value.headersText)) {
      ctx.addIssue({
        code: "custom",
        path: ["headersText"],
        message: "common.headersMustBeAJsonObject",
      })
    }
  })

export const mcpImportSchema = z.object({
  jsonText: z.string().trim().min(1, "common.pasteMcpJson"),
})

export const EMPTY_MCP_EDITOR = {
  name: "",
  type: "2" as const,
  url: "",
  command: "",
  argsText: "",
  envText: "",
  headersText: "",
}

export type McpEditorValues = z.output<typeof mcpEditorSchema>

function parseJsonObject(raw: string): Record<string, string> | null {
  const trimmed = raw.trim()
  if (!trimmed) {
    return null
  }
  const parsed = JSON.parse(trimmed) as unknown
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("common.headersMustBeAJsonObject")
  }
  return Object.fromEntries(
    Object.entries(parsed as Record<string, unknown>).map(([key, value]) => [
      key,
      String(value),
    ])
  )
}

function isJsonObjectText(raw: string): boolean {
  try {
    parseJsonObject(raw)
    return true
  } catch {
    return false
  }
}

export function mcpEditorValuesFromItem(mcp: McpItem): McpEditorValues {
  return {
    name: mcp.name,
    type: mcp.type === 0 ? "0" : mcp.type === 1 ? "1" : "2",
    url: mcp.url ?? "",
    command: mcp.command ?? "",
    argsText: (mcp.args ?? []).join("\n"),
    envText:
      mcp.env && Object.keys(mcp.env).length > 0
        ? JSON.stringify(mcp.env, null, 2)
        : "",
    headersText:
      mcp.headers && Object.keys(mcp.headers).length > 0
        ? JSON.stringify(mcp.headers, null, 2)
        : "",
  }
}

export function mcpWriteBodyFromEditor(
  value: McpEditorValues,
  extra?: Partial<McpWriteBody>
): McpWriteBody {
  const mcpType = Number(value.type)
  const body: McpWriteBody = {
    name: value.name,
    type: mcpType,
    ...extra,
  }
  if (mcpType === 0) {
    body.command = value.command.trim()
    /* 一行一个参数，空行忽略 */
    const args = value.argsText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
    if (args.length > 0) {
      body.args = args
    }
    body.env = parseJsonObject(value.envText)
  } else {
    body.url = value.url.trim()
    body.headers = parseJsonObject(value.headersText)
  }
  return body
}

export function mcpTypeLabel(type: number) {
  if (type === 0) {
    return "stdio"
  }
  if (type === 1) {
    return "SSE"
  }
  return "HTTP"
}

export function mcpEndpoint(
  mcp: Pick<McpItem, "url" | "command" | "description">
) {
  return mcp.url?.trim() || mcp.command?.trim() || mcp.description?.trim() || ""
}

export function mcpMatchesQuery(mcp: McpItem, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) {
    return true
  }
  return [
    mcp.name,
    mcp.description,
    mcp.url,
    mcp.command,
    mcp.tool_prefix,
    mcpTypeLabel(mcp.type),
  ].some((part) => part?.toLowerCase().includes(needle))
}
