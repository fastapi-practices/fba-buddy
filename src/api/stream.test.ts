import { describe, expect, it } from "vitest"
import { readAgUiRunEvents, readSseEvents, throwIfStreamFailed } from "./stream"

const run = { type: "RUN_STARTED", threadId: "c", runId: "server-run" }
const start = { type: "TEXT_MESSAGE_START", messageId: "a", role: "assistant" }
const finish = {
  type: "RUN_FINISHED",
  threadId: "c",
  runId: "server-run",
  outcome: { type: "success" },
}

describe("native AG-UI stream completion", () => {
  it("rejects a successful JSON response where the request requires SSE", async () => {
    await expect(
      throwIfStreamFailed(
        new Response(JSON.stringify({ code: 200, data: {} }), {
          headers: { "content-type": "application/json" },
        }),
        "Expected event stream",
        true
      )
    ).rejects.toThrow("Expected event stream")
  })

  it("decodes byte-split UTF-8, CRLF boundaries and multiline data", async () => {
    const content = {
      type: "TEXT_MESSAGE_CONTENT",
      messageId: "a",
      delta: "中文 🧩",
    }
    const wire = `: ping\r\n\r\ndata: ${JSON.stringify(run)}\r\n\r\ndata: ${JSON.stringify(start)}\r\n\r\ndata: ${JSON.stringify(content)}\r\n\r\ndata: {"type":"RUN_FINISHED",\r\ndata: "threadId":"c","runId":"server-run","outcome":{"type":"success"}}\r\n\r\n`
    const bytes = new TextEncoder().encode(wire)
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const byte of bytes) controller.enqueue(Uint8Array.of(byte))
        controller.close()
      },
    })
    const events: unknown[] = []
    for await (const event of readAgUiRunEvents(body)) events.push(event)
    expect(events).toEqual([run, start, content, finish])
    expect(body.locked).toBe(false)
  })

  it("finishes on a native terminal event and releases a still-open SSE response", async () => {
    let cancelled = false
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            `: keepalive\r\n\r\ndata: ${JSON.stringify(run)}\r\n\r\ndata: ${JSON.stringify(finish)}\r\n\r\n`
          )
        )
      },
      cancel() {
        cancelled = true
      },
    })
    const events: unknown[] = []
    for await (const event of readAgUiRunEvents(body)) events.push(event)
    expect(events).toEqual([run, finish])
    expect(cancelled).toBe(true)
    expect(body.locked).toBe(false)
  })

  it("rejects malformed and disconnected streams", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(`data: ${JSON.stringify(start)}\n\n`)
        )
        controller.close()
      },
    })
    const consume = async () => {
      for await (const event of readAgUiRunEvents(body)) void event
    }
    await expect(consume()).rejects.toThrow()
    expect(body.locked).toBe(false)

    const malformed = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("data: not-json\n\n"))
        controller.close()
      },
    })
    const consumeMalformed = async () => {
      for await (const event of readAgUiRunEvents(malformed)) void event
    }
    await expect(consumeMalformed()).rejects.toThrow("Invalid AG-UI SSE frame")
    expect(malformed.locked).toBe(false)
  })
  it("carries only the server event id and drops invalid ids", async () => {
    const valid = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            `id: 12-34\ndata: ${JSON.stringify(run)}\n\nid: invalid\ndata: ${JSON.stringify(start)}\n\n`
          )
        )
        controller.close()
      },
    })
    const events: unknown[] = []
    for await (const event of readSseEvents(valid)) events.push(event)
    expect(events).toEqual([
      { id: "12-34", event: run },
      { id: null, event: start },
    ])
  })

  it("does not expose an id when the AG-UI frame is invalid", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode("id: 1-2\ndata: not-json\n\n")
        )
        controller.close()
      },
    })
    const events: unknown[] = []
    await expect(
      (async () => {
        for await (const event of readSseEvents(body)) events.push(event)
      })()
    ).rejects.toThrow("Invalid AG-UI SSE frame")
    expect(events).toEqual([])
  })
})
