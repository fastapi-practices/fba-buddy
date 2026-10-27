import { describe, expect, it } from "vitest"
import type {
  ThreadMessage,
  ThreadMessagePart,
} from "@/features/chat/thread-types"
import { turnStream } from "./turn-stream"

const text = (value: string): ThreadMessagePart => ({
  type: "text",
  text: value,
})
const reasoning = (value: string): ThreadMessagePart => ({
  type: "reasoning",
  text: value,
})
const tool = (
  toolCallId: string,
  extra: Partial<Extract<ThreadMessagePart, { type: "tool-call" }>> = {}
): ThreadMessagePart => ({
  type: "tool-call",
  toolCallId,
  toolName: "read_file",
  ...extra,
})
const message = (id: string, content: ThreadMessagePart[]): ThreadMessage => ({
  id,
  role: "assistant",
  content,
  status: { type: "running" },
})

describe("turn stream", () => {
  it("keeps a preamble text inside the work process when a tool follows it", () => {
    const stream = turnStream([
      message("preamble", [text("让我先看看文件")]),
      message("work", [tool("t1")]),
    ])
    expect(stream.finalReplyStarted).toBe(false)
    expect(stream.finalId).toBeUndefined()
    expect(stream.finalParts).toEqual({})
    expect(stream.hasWork).toBe(true)
  })

  it("marks text after the last execution step as the final answer", () => {
    const stream = turnStream([
      message("work", [reasoning("先看看"), tool("t1")]),
      message("answer", [text("已经改好了")]),
    ])
    expect(stream.finalReplyStarted).toBe(true)
    expect(stream.finalId).toBe("answer")
    expect(stream.finalParts).toEqual({ answer: [0] })
  })

  it("splits text and tool calls inside one message by real order", () => {
    const stream = turnStream([
      message("mixed", [text("先读文件"), tool("t1"), text("读完了")]),
    ])
    expect(stream.finalId).toBe("mixed")
    expect(stream.finalParts).toEqual({ mixed: [2] })
    expect(stream.finalReplyStarted).toBe(true)
  })

  it("treats text before a later tool call as work again", () => {
    const stream = turnStream([
      message("mixed", [text("先读文件"), tool("t1")]),
    ])
    expect(stream.finalId).toBeUndefined()
    expect(stream.finalReplyStarted).toBe(false)
  })

  it("keeps a pure text answer as the final answer", () => {
    const stream = turnStream([message("answer", [text("你好")])])
    expect(stream.finalId).toBe("answer")
    expect(stream.finalParts).toEqual({ answer: [0] })
    expect(stream.hasWork).toBe(false)
  })

  it("keeps earlier text messages in the work process so nothing is lost", () => {
    const stream = turnStream([
      message("first", [text("第一段")]),
      message("second", [text("第二段")]),
    ])
    expect(stream.finalId).toBe("second")
    expect(stream.finalParts).toEqual({ second: [0] })
    expect(stream.hasWork).toBe(true)
  })

  it("ignores empty text segments", () => {
    const stream = turnStream([message("answer", [text("   ")])])
    expect(stream.finalId).toBeUndefined()
    expect(stream.finalReplyStarted).toBe(false)
  })

  it("treats images after the last tool call as the final answer", () => {
    const stream = turnStream([
      message("work", [tool("t1")]),
      message("answer", [{ type: "image", image: "data:image/png;base64,x" }]),
    ])
    expect(stream.finalId).toBe("answer")
    expect(stream.finalParts).toEqual({ answer: [0] })
  })

  it("keeps the text before an input request as the final answer", () => {
    const stream = turnStream([
      message("ask", [
        text("在继续之前，我先确认一下范围"),
        tool("ask-user", { toolName: "ask_user" }),
      ]),
    ])
    expect(stream.finalId).toBe("ask")
    expect(stream.finalParts).toEqual({ ask: [0] })
    expect(stream.finalReplyStarted).toBe(true)
  })

  it("keeps the text before an input request tool as the final answer", () => {
    const asked = message("ask", [
      text("在继续之前，我先确认一下范围"),
      tool("ask-user"),
    ])
    asked.metadata = {
      custom: {
        turnContext: {
          lifecycle_events: [
            {
              name: "buddy.user_input",
              value: { tool_call_id: "ask-user", status: "pending" },
            },
          ],
        },
      },
    }
    const stream = turnStream([asked])
    expect(stream.finalId).toBe("ask")
    expect(stream.finalParts).toEqual({ ask: [0] })
  })

  it("excludes persistent tool results from the work process", () => {
    const stream = turnStream(
      [message("work", [tool("t1", { result: "ok" })])],
      { persistentTools: { work: ["t1"] } }
    )
    expect(stream.hasWork).toBe(false)
    expect(stream.finalId).toBeUndefined()
  })

  it("treats a declined approval as an outcome instead of work", () => {
    const stream = turnStream(
      [
        message("approval", [
          tool("t1", {
            hadApproval: true,
            status: { type: "incomplete", reason: "cancelled" },
            providerMetadata: { buddy: { status: "declined" } },
          }),
        ]),
      ],
      {
        lifecycleEvents: {
          approval: [
            { name: "buddy.coding.approval", value: { tool_call_id: "t1" } },
            {
              name: "buddy.coding.approval_resolved",
              value: { tool_call_id: "t1" },
            },
          ],
        },
      }
    )

    expect(stream.hasWork).toBe(false)
    expect(stream.finalId).toBeUndefined()
  })
})
