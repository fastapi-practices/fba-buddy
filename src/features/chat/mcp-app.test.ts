import { describe, expect, it, vi } from "vitest"
import {
  createMcpAppHost,
  mcpAppDocument,
  mcpAppReference,
  type McpAppHostOptions,
} from "./mcp-app"

function hostOptions(): McpAppHostOptions {
  return {
    post: vi.fn(),
    context: () => ({ displayMode: "inline" }),
    callTool: vi.fn(async () => ({ content: [] })),
    displayMode: vi.fn(async (mode) => mode),
    sizeChanged: vi.fn(),
    initialized: vi.fn(),
  }
}

describe("MCP app host", () => {
  it("requires a declared resource and backend server identity", () => {
    expect(
      mcpAppReference({ html: "<script>anything</script>" })
    ).toBeUndefined()
    expect(
      mcpAppReference({
        _meta: {
          ui: { resourceUri: "https://example.org" },
          "fba/source": { mcpId: 2, toolName: "chart" },
        },
      })
    ).toBeUndefined()
    expect(
      mcpAppReference(
        JSON.stringify({
          _meta: {
            ui: { resourceUri: "ui://chart" },
            "fba/source": { mcpId: 2, toolName: "chart" },
          },
        })
      )
    ).toEqual({ mcpId: 2, toolName: "chart", resourceUri: "ui://chart" })
  })
  it("constrains document networking to valid declared origins", () => {
    const document = mcpAppDocument(
      "<html><head></head><body>Hello</body></html>",
      {
        ui: {
          csp: {
            connectDomains: [
              "https://api.example.org",
              "'unsafe-inline'",
              "https://bad.example/path",
              'https://bad.example"',
            ],
            resourceDomains: ["https://cdn.example.org"],
          },
        },
      }
    )
    expect(document).toContain("connect-src https://api.example.org;")
    expect(document).toContain("base-uri 'none'")
    expect(document).not.toContain("bad.example")
    expect(document.indexOf("Content-Security-Policy")).toBeLessThan(
      document.indexOf("</head>")
    )
    const prefix = mcpAppDocument(
      '<script src="https://unlisted.invalid/a.js"></script><head></head>',
      {}
    )
    expect(prefix.indexOf("Content-Security-Policy")).toBeLessThan(
      prefix.indexOf("<script")
    )
  })
  it("initializes before calling tools and returns standard JSON RPC results", async () => {
    const options = hostOptions()
    const host = createMcpAppHost(options)
    await host.receive({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "read" },
    })
    expect(options.callTool).not.toHaveBeenCalled()
    await host.receive({ jsonrpc: "2.0", id: 2, method: "ui/initialize" })
    await host.receive({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "read", arguments: { id: 7 } },
    })
    expect(options.callTool).toHaveBeenCalledWith(
      "read",
      { id: 7 },
      expect.any(AbortSignal)
    )
    expect(options.post).toHaveBeenLastCalledWith({
      jsonrpc: "2.0",
      id: 3,
      result: { content: [] },
    })
    await host.receive({
      jsonrpc: "2.0",
      method: "ui/notifications/size-changed",
      params: { height: 99999 },
    })
    expect(options.sizeChanged).toHaveBeenCalledWith(1800)
    host.dispose()
  })
  it("cancels pending requests on disposal and prevents late replies", async () => {
    const options = hostOptions()
    let active: AbortSignal | undefined
    options.callTool = vi.fn((_name, _args, signal) => {
      active = signal
      return new Promise(() => {})
    })
    const host = createMcpAppHost(options)
    await host.receive({ jsonrpc: "2.0", id: 1, method: "ui/initialize" })
    const pending = host.receive({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "write" },
    })
    host.dispose()
    await pending
    expect(active?.aborted).toBe(true)
    expect(options.post).toHaveBeenCalledTimes(1)
  })
  it("times out unanswered approvals and cancels their signal", async () => {
    vi.useFakeTimers()
    try {
      const options = hostOptions()
      let active: AbortSignal | undefined
      options.callTool = vi.fn((_name, _args, signal) => {
        active = signal
        return new Promise(() => {})
      })
      const host = createMcpAppHost(options)
      await host.receive({ jsonrpc: "2.0", id: 1, method: "ui/initialize" })
      const pending = host.receive({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "write" },
      })
      await vi.advanceTimersByTimeAsync(120_000)
      await pending
      expect(active?.aborted).toBe(true)
      expect(options.post).toHaveBeenLastCalledWith(
        expect.objectContaining({
          id: 2,
          error: expect.objectContaining({ code: -32000 }),
        })
      )
      host.dispose()
    } finally {
      vi.useRealTimers()
    }
  })
})
