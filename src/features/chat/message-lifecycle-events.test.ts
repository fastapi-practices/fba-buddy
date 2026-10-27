import { describe, expect, it } from "vitest"
import { applyAgUiEvent, snapshotToChatMessages } from "./message-events"
import { toThreadMessage } from "@/features/chat/thread-message"
import { toChatCompletionBody } from "@/api/chat-body"
import { buildChatSendPayload } from "@/features/chat/send-payload"
import type { ChatMessage, SnapshotMessage } from "@/lib/types"

const start: ChatMessage[] = [
  { id: "assistant-1", role: "assistant", content: "", status: "streaming" },
]
describe("rich conversation events", () => {
  it("retains separate plan steps and request resolution without duplicating requests", () => {
    let messages = start
    for (const id of ["a", "b"])
      messages = applyAgUiEvent(messages, {
        type: "CUSTOM",
        name: "buddy.planning",
        value: {
          kind: "planning.created",
          item: { id, content: id, status: "pending" },
          message_id: "assistant-1",
        },
      })
    for (const status of ["pending", "answered"])
      messages = applyAgUiEvent(messages, {
        type: "CUSTOM",
        name: "buddy.user_input",
        value: { request_id: "r1", status, message_id: "assistant-1" },
      })
    const events = messages[0]!.turnContext!.lifecycle_events!
    expect(events).toHaveLength(3)
    expect(events.at(-1)?.value.status).toBe("answered")
  })
  it("renders provider compaction and retains empty activities for later patches", () => {
    const next = applyAgUiEvent(start, {
      type: "ACTIVITY_SNAPSHOT",
      messageId: "compaction-1",
      activityType: "pydantic_ai_compaction",
      content: { content: "summary" },
    })
    expect(next[0]?.turnContext?.lifecycle_events?.[0]?.value.content).toBe(
      "summary"
    )
    expect(
      applyAgUiEvent(start, {
        type: "ACTIVITY_SNAPSHOT",
        messageId: "random",
        activityType: "random_status",
        content: {},
      })
    ).toMatchObject([
      {
        agUiActivities: [{ id: "random", content: {} }],
        turnContext: { lifecycle_events: [] },
      },
    ])
  })
  it("restores object-shaped activity content into the correct user turn", () => {
    const messages = snapshotToChatMessages([
      { id: "old", role: "assistant", content: "old reply" },
      { id: "u2", role: "user", content: "new request" },
      {
        id: "compact",
        role: "activity",
        activityType: "pydantic_ai_compaction",
        content: { content: "compacted summary" },
      },
    ] as unknown as SnapshotMessage[])
    expect(messages[0]?.turnContext).toBeUndefined()
    expect(
      messages.at(-1)?.turnContext?.lifecycle_events?.[0]?.value.content
    ).toBe("compacted summary")
  })
  it("replaces complete activity content and retains empty restored activity", () => {
    const titled = applyAgUiEvent(start, {
      type: "ACTIVITY_SNAPSHOT",
      messageId: "activity-1",
      activityType: "task_progress",
      content: { title: "Building preview", summary: "Preparing assets" },
    })
    expect(titled[0]?.turnContext?.lifecycle_events?.[0]?.value.title).toBe(
      "Building preview"
    )
    const resource = applyAgUiEvent(start, {
      type: "ACTIVITY_SNAPSHOT",
      messageId: "preview-1",
      activityType: "preview",
      content: {
        url: "http://localhost:5173",
        status: "running",
        persistent: true,
      },
    })
    expect(resource[0]?.turnContext?.lifecycle_events?.[0]?.value.url).toBe(
      "http://localhost:5173"
    )
    const stopped = applyAgUiEvent(
      [
        ...resource,
        {
          id: "later",
          role: "assistant",
          content: "Next turn",
          status: "complete",
        },
      ],
      {
        type: "ACTIVITY_SNAPSHOT",
        messageId: "preview-1",
        activityType: "preview",
        content: { status: "stopped" },
      }
    )
    expect(stopped[0]?.turnContext?.lifecycle_events?.[0]?.value).toMatchObject(
      { status: "stopped" }
    )
    expect(
      stopped[0]?.turnContext?.lifecycle_events?.[0]?.value
    ).not.toHaveProperty("url")
    expect(stopped[1]?.turnContext?.lifecycle_events).toBeUndefined()
    expect(
      snapshotToChatMessages([
        {
          id: "unknown",
          role: "activity",
          activityType: "random_status",
          content: {},
        },
      ] as unknown as SnapshotMessage[])
    ).toMatchObject([{ agUiActivities: [{ id: "unknown", content: {} }] }])
  })
  it("preserves quote anchors through request and restored history", () => {
    const quote = {
      messageId: "source",
      conversationId: "source-chat",
      text: "quoted",
      occurrence: 1,
    }
    const payload = buildChatSendPayload({
      conversationId: "c",
      messageId: "u",
      text: "answer",
      attachments: [],
      composer: { provider_id: 1, model_id: "test" },
      quote,
    })
    expect(
      (toChatCompletionBody(payload).forwardedProps as Record<string, unknown>)
        .quote
    ).toEqual(quote)
    const messages = snapshotToChatMessages([
      { id: "u", role: "user", content: "answer", turnContext: { quote } },
    ])
    expect(toThreadMessage(messages[0]!).metadata?.custom?.quote).toEqual(quote)
  })
  it("restores lifecycle events on merged assistant fragments", () => {
    const event = {
      name: "buddy.subagent",
      value: {
        task_id: "task",
        kind: "sub_agents.delegation_end",
        outcome: "ok",
      },
    }
    const messages = snapshotToChatMessages([
      {
        id: "first",
        role: "assistant",
        persisted_message_id: 3,
        content: "First",
        turnContext: { lifecycle_events: [event] },
      },
      {
        id: "last",
        role: "assistant",
        persisted_message_id: 3,
        content: "Last",
        turnContext: { model_id: "test" },
      },
    ])
    expect(messages).toHaveLength(1)
    expect(messages[0]?.turnContext?.lifecycle_events).toEqual([event])
  })
  it("keeps document URLs separate from inline base64 payloads", () => {
    const messages = snapshotToChatMessages([
      {
        id: "u",
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "url",
              value: "https://example.com/report.pdf",
              mimeType: "application/pdf",
            },
            metadata: { filename: "report.pdf" },
          },
        ],
      },
    ])
    const converted = toThreadMessage(messages[0]!)
    expect(converted.attachments?.[0]?.content[0]).toMatchObject({
      type: "file",
      filename: "report.pdf",
      data: "https://example.com/report.pdf",
      mimeType: "application/pdf",
    })
  })
})
