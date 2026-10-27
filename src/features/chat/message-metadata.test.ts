import { describe, expect, it } from "vitest"
import { snapshotMessageMetadata } from "./message-metadata"
import { snapshotToChatMessages } from "@/features/chat/message-events"
import { toThreadMessage } from "./thread-message"

describe("message provenance", () => {
  it("renders native backend createdTime and turnContext provenance", () => {
    const [message] = snapshotToChatMessages([
      {
        id: "msg_3_assistant_0",
        role: "assistant",
        content: "Saved",
        persistedMessageId: 3,
        createdTime: "2026-10-10T01:00:00Z",
        turnContext: { origin: "web", agent_mode: "work" },
      },
    ])
    expect(message).toMatchObject({
      pk: 3,
      createdAt: "2026-10-10T01:00:00.000Z",
      origin: "web",
      turnContext: { agent_mode: "work" },
    })
    const rendered = toThreadMessage(message!)
    expect(rendered.createdAt).toEqual(new Date("2026-10-10T01:00:00Z"))
    expect(rendered.metadata?.custom).toMatchObject({ origin: "web" })
  })

  it("preserves persisted timestamps and explicit attempts through the renderer", () => {
    const metadata = snapshotMessageMetadata({
      created_at: "2026-10-10T01:00:00Z",
      input_intent: "steer",
      created_by: { agent: "researcher" },
      attempt: { id: "attempt-1", status: "superseded" },
      turnContext: { origin: "cron" },
    })
    expect(metadata).toMatchObject({
      createdAt: "2026-10-10T01:00:00.000Z",
      inputIntent: "steer",
      origin: "cron",
      attempt: { id: "attempt-1", status: "superseded" },
    })
    const rendered = toThreadMessage({
      id: "m",
      role: "assistant",
      content: "retained",
      ...metadata,
    })
    expect(rendered.createdAt).toEqual(new Date(metadata.createdAt!))
    expect(rendered.metadata?.custom).toMatchObject(metadata)
  })
  it("does not invent missing timestamps or infer attempts from errors", () => {
    expect(
      snapshotMessageMetadata({
        created_at: "invalid",
        type: "error",
        runId: "a",
      })
    ).toEqual({})
  })
  it("does not merge superseded and replacement attempts with the same persisted id", () => {
    const messages = snapshotToChatMessages([
      {
        id: "part-a",
        role: "assistant",
        content: "partial",
        persisted_message_id: 1,
        attempt: { id: "one", status: "superseded" },
      },
      {
        id: "part-b",
        role: "assistant",
        content: "final",
        persisted_message_id: 1,
        attempt: { id: "two", status: "complete" },
      },
    ] as Parameters<typeof snapshotToChatMessages>[0])
    expect(messages).toHaveLength(2)
    expect(messages.map((message) => message.content)).toEqual([
      "partial",
      "final",
    ])
  })
})
