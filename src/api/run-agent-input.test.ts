import { describe, expect, it } from "vitest"

import { createRunAgentInput } from "@/api/run-agent-input"
import type { OutgoingContentPart } from "@/lib/types"

describe("createRunAgentInput", () => {
  it("encodes the native RunAgentInput contract without a product envelope", () => {
    const body = createRunAgentInput({
      threadId: "conv-1",
      messages: [{ id: "m1", role: "user", content: "hi" }],
      forwardedProps: { providerId: 1, modelId: "m" },
    })
    expect(body).toEqual({
      threadId: "conv-1",
      runId: expect.any(String),
      messages: [{ id: "m1", role: "user", content: "hi" }],
      tools: [],
      context: [],
      state: {},
      forwardedProps: { providerId: 1, modelId: "m" },
    })
  })

  it("generates a complete thread and run identity for new conversations", () => {
    const input = {
      threadId: null,
      messages: [],
      forwardedProps: { providerId: 1, modelId: "m", assistantId: undefined },
    }
    const first = createRunAgentInput(input)
    const second = createRunAgentInput(input)
    expect(first.threadId).toMatch(/^[a-f0-9-]{36}$/)
    expect(second.threadId).not.toBe(first.threadId)
    expect(first.forwardedProps).toEqual({ providerId: 1, modelId: "m" })
    expect(first.runId).toMatch(/^[a-f0-9-]{36}$/)
    expect(second.runId).not.toBe(first.runId)
    expect(input.forwardedProps).toHaveProperty("assistantId")
  })

  it("preserves native multimodal message sources and metadata", () => {
    const content: OutgoingContentPart[] = [
      { type: "text", text: "Describe these files" },
      {
        type: "image",
        source: { type: "data", value: "aW1hZ2U=", mimeType: "image/png" },
        metadata: { filename: "image.png", size: 5 },
      },
      {
        type: "document",
        source: {
          type: "url",
          value: "https://example.com/files/report.pdf",
          mimeType: "application/pdf",
        },
        metadata: { filename: "report.pdf" },
      },
    ]
    const body = createRunAgentInput({
      messages: [{ id: "m1", role: "user", content }],
      forwardedProps: { providerId: 1, modelId: "m" },
    })
    expect(body.messages).toEqual([{ id: "m1", role: "user", content }])
  })

  it("continues an interrupt with explicit resume and no repeated user question", () => {
    const resume = [
      {
        interruptId: "int-call_write_1",
        status: "resolved" as const,
        payload: { approved: false },
      },
    ]
    const body = createRunAgentInput({
      threadId: "conv-1",
      messages: [{ id: "m1", role: "user", content: "Write a file" }],
      forwardedProps: { providerId: 1, modelId: "m" },
      resume,
    })
    expect(body.resume).toEqual(resume)
    expect(body.messages).toEqual([])
    expect(body.threadId).toBe("conv-1")
    expect(body).not.toHaveProperty("parentRunId")
  })

  it("omits empty resume entries without discarding a new user message", () => {
    const messages = [{ id: "m1", role: "user" as const, content: "Hello" }]
    const body = createRunAgentInput({
      messages,
      forwardedProps: { providerId: 1, modelId: "m" },
      resume: [],
    })
    expect(body.messages).toEqual(messages)
    expect(body).not.toHaveProperty("resume")
  })
})
