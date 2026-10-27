export type McpAppReference = {
  mcpId: number
  toolName: string
  resourceUri: string
}
type RecordValue = Record<string, unknown>
const record = (value: unknown): RecordValue | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : undefined

export function mcpAppReference(content: unknown): McpAppReference | undefined {
  let activity = record(content)
  if (typeof content === "string") {
    try {
      activity = record(JSON.parse(content))
    } catch {
      return
    }
  }
  const metadata = record(activity?._meta ?? record(activity?.result)?._meta)
  const ui = record(metadata?.ui)
  const source = record(metadata?.["fba/source"])
  const resourceUri =
    typeof activity?.resourceUri === "string"
      ? activity.resourceUri
      : typeof ui?.resourceUri === "string"
        ? ui.resourceUri
        : undefined
  if (
    typeof source?.mcpId !== "number" ||
    !Number.isSafeInteger(source.mcpId) ||
    source.mcpId <= 0 ||
    typeof source.toolName !== "string" ||
    !source.toolName ||
    !resourceUri?.startsWith("ui://") ||
    (activity?.serverId !== undefined &&
      activity.serverId !== `mcp_${source.mcpId}`)
  )
    return
  return {
    mcpId: source.mcpId,
    toolName: source.toolName,
    resourceUri,
  }
}

function domains(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .filter(
      (item): item is string =>
        typeof item === "string" &&
        /^https?:\/\/[a-z0-9.-]+(?::\d{1,5})?$/i.test(item)
    )
    .slice(0, 32)
}

export function mcpAppDocument(html: string, metadata: unknown): string {
  const csp = record(record(record(metadata)?.ui)?.csp)
  const resources = domains(csp?.resourceDomains).join(" ")
  const connect = domains(csp?.connectDomains).join(" ")
  const frames = domains(csp?.frameDomains).join(" ")
  const policy = `default-src 'none'; script-src 'unsafe-inline' ${resources}; style-src 'unsafe-inline' ${resources}; img-src data: blob: ${resources}; font-src data: ${resources}; media-src blob: data: ${resources}; connect-src ${connect || "'none'"}; frame-src ${frames || "'none'"}; object-src 'none'; base-uri 'none'; form-action 'none'`
  const tag = `<meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="referrer" content="no-referrer">`
  return `<!doctype html><html><head><meta charset="utf-8">${tag}</head><body>${html}</body></html>`
}

export type McpAppHostOptions = {
  post: (message: unknown) => void
  context: () => RecordValue
  callTool: (
    name: string,
    args: RecordValue,
    signal: AbortSignal
  ) => Promise<unknown>
  readResource?: (uri: string, signal: AbortSignal) => Promise<unknown>
  sendMessage?: (text: string, signal: AbortSignal) => Promise<void>
  downloadFile?: (contents: unknown[], signal: AbortSignal) => Promise<void>
  displayMode: (
    mode: "inline" | "fullscreen"
  ) => Promise<"inline" | "fullscreen">
  sizeChanged: (height: number) => void
  initialized: () => void
}

/** Each host belongs to one sandbox window; its caller verifies MessageEvent.source */
export function createMcpAppHost(options: McpAppHostOptions) {
  let initialized = false
  let disposed = false
  const pending = new Map<string | number, AbortController>()
  const post = (message: unknown) => {
    if (!disposed) options.post(message)
  }
  return {
    dispose: () => {
      disposed = true
      pending.forEach((controller) => controller.abort())
      pending.clear()
    },
    notify: (method: string, params: unknown) =>
      post({ jsonrpc: "2.0", method, params }),
    receive: async (data: unknown) => {
      const message = record(data)
      if (
        disposed ||
        message?.jsonrpc !== "2.0" ||
        typeof message.method !== "string"
      )
        return
      const params = record(message.params) ?? {}
      const id = message.id
      if (id === undefined) {
        if (!initialized) return
        if (message.method === "ui/notifications/initialized")
          options.initialized()
        if (
          message.method === "ui/notifications/size-changed" &&
          typeof params.height === "number" &&
          Number.isFinite(params.height)
        )
          options.sizeChanged(Math.min(1800, Math.max(120, params.height)))
        return
      }
      if ((typeof id !== "string" && typeof id !== "number") || pending.has(id))
        return
      const fail = (code: number, error: string) =>
        post({ jsonrpc: "2.0", id, error: { code, message: error } })
      if (pending.size >= 16) {
        fail(-32000, "Too many pending requests")
        return
      }
      if (
        message.method !== "ui/initialize" &&
        message.method !== "ping" &&
        !initialized
      ) {
        fail(-32000, "Initialize the app first")
        return
      }
      const controller = new AbortController()
      pending.set(id, controller)
      const timeout = setTimeout(
        () => controller.abort(new Error("App request timed out")),
        120_000
      )
      const bounded = <T>(operation: Promise<T>): Promise<T> =>
        Promise.race([
          operation,
          new Promise<T>((_, reject) => {
            controller.signal.addEventListener(
              "abort",
              () => reject(new Error("App request cancelled or timed out")),
              { once: true }
            )
          }),
        ])
      try {
        let result: unknown = {}
        switch (message.method) {
          case "ui/initialize":
            initialized = true
            result = {
              protocolVersion: "2026-01-26",
              hostInfo: { name: "FbaBuddy", version: "0.1.0" },
              hostCapabilities: {
                serverTools: {},
                ...(options.readResource ? { serverResources: {} } : {}),
                ...(options.sendMessage ? { message: { text: {} } } : {}),
                ...(options.downloadFile ? { downloadFile: {} } : {}),
              },
              hostContext: options.context(),
            }
            break
          case "ping":
            break
          case "tools/call": {
            const args = record(params.arguments) ?? {}
            if (
              typeof params.name !== "string" ||
              !params.name ||
              (params.arguments !== undefined && !record(params.arguments)) ||
              JSON.stringify(args).length > 1_000_000
            )
              throw new Error("Invalid tool request")
            result = await bounded(
              options.callTool(params.name, args, controller.signal)
            )
            break
          }
          case "resources/read":
            if (!options.readResource || typeof params.uri !== "string")
              throw new Error("Resource unavailable")
            result = await bounded(
              options.readResource(params.uri, controller.signal)
            )
            break
          case "ui/message": {
            const blocks = Array.isArray(params.content)
              ? params.content
              : [params.content]
            const texts = blocks.map((block) =>
              record(block)?.type === "text" ? record(block)?.text : undefined
            )
            if (
              !options.sendMessage ||
              params.role !== "user" ||
              !texts.length ||
              texts.some((text) => typeof text !== "string")
            )
              throw new Error("Only user text messages are supported")
            const text = texts.join("\n").trim()
            if (!text || text.length > 100_000)
              throw new Error("Invalid message")
            await bounded(options.sendMessage(text, controller.signal))
            break
          }
          case "ui/request-display-mode":
            result = {
              mode: await bounded(
                options.displayMode(
                  params.mode === "fullscreen" ? "fullscreen" : "inline"
                )
              ),
            }
            break
          case "ui/download-file":
            if (
              !options.downloadFile ||
              !Array.isArray(params.contents) ||
              !params.contents.length ||
              params.contents.length > 10
            )
              throw new Error("Invalid download request")
            await bounded(
              options.downloadFile(params.contents, controller.signal)
            )
            break
          default:
            fail(-32601, "Unsupported host method")
            return
        }
        post({ jsonrpc: "2.0", id, result })
      } catch (error) {
        fail(
          -32000,
          error instanceof Error ? error.message : "App request failed"
        )
      } finally {
        clearTimeout(timeout)
        pending.delete(id)
      }
    },
  }
}
