import { describe, expect, it } from "vitest"
import {
  applyAgUiEvent,
  mergeSnapshotWithLive,
  snapshotToChatMessages,
} from "@/features/chat/message-events"
import { toThreadMessage } from "@/features/chat/thread-message"
import type { ChatMessage } from "@/lib/types"

function replay(events: Record<string, unknown>[]) {
  return events.reduce(
    (messages, event) => applyAgUiEvent(messages, event),
    [] as ChatMessage[]
  )
}

const start = { type: "TEXT_MESSAGE_START", messageId: "a", role: "assistant" }

describe("conversation content fidelity", () => {
  it("preserves narration on either side of tools through rendering and snapshot synchronization", () => {
    const live = replay([
      start,
      { type: "TEXT_MESSAGE_CONTENT", messageId: "a", delta: "Before" },
      {
        type: "TOOL_CALL_START",
        parentMessageId: "a",
        toolCallId: "t",
        toolCallName: "read_file",
      },
      { type: "TOOL_CALL_ARGS", toolCallId: "t", delta: '{"path":"a.ts"}' },
      { type: "TOOL_CALL_RESULT", toolCallId: "t", content: "Contents" },
      {
        type: "REASONING_MESSAGE_START",
        messageId: "reasoning",
        role: "reasoning",
      },
      {
        type: "REASONING_MESSAGE_CONTENT",
        messageId: "reasoning",
        delta: "Analysis",
      },
      { type: "TEXT_MESSAGE_CONTENT", messageId: "a", delta: "After" },
    ])
    const expected = ["text", "tool-call", "reasoning", "text"]
    expect(toThreadMessage(live[0]!).content).toMatchObject([
      { type: "text", text: "Before" },
      { type: "tool-call", result: "Contents" },
      { type: "reasoning", text: "Analysis" },
      { type: "text", text: "After" },
    ])
    const snapshot = snapshotToChatMessages([
      { id: "a", role: "assistant", content: "BeforeAfter" },
    ])
    const merged = mergeSnapshotWithLive(snapshot, live)
    expect(merged[0]!.parts?.map((part) => part.type)).toEqual(expected)
  })

  it("keeps tool arguments and reasoning on their explicit owner during interleaved messages", () => {
    const messages = replay([
      start,
      {
        type: "TOOL_CALL_START",
        parentMessageId: "a",
        toolCallId: "t",
        toolCallName: "read_file",
      },
      { type: "TEXT_MESSAGE_START", messageId: "b", role: "assistant" },
      { type: "TOOL_CALL_ARGS", toolCallId: "t", delta: '{"path":"a.ts"}' },
      {
        type: "REASONING_MESSAGE_CONTENT",
        messageId: "a",
        delta: "Owner analysis",
      },
      {
        type: "REASONING_MESSAGE_CONTENT",
        messageId: "missing",
        delta: "Ignore",
      },
    ])
    expect(messages[0]).toMatchObject({
      thinking: "Owner analysis",
      tools: [{ args: '{"path":"a.ts"}' }],
    })
    expect(messages[1]!.thinking).toBeUndefined()
  })

  it("preserves tool failures independently of the overall successful reply", () => {
    const messages = replay([
      start,
      { type: "TOOL_CALL_START", toolCallId: "t", toolCallName: "bash" },
      {
        type: "TOOL_CALL_RESULT",
        toolCallId: "t",
        content: '{"isError":true,"message":"failed"}',
      },
      { type: "TEXT_MESSAGE_END", messageId: "a" },
    ])
    expect(messages[0]!.status).toBe("complete")
    expect(toThreadMessage(messages[0]!).content).toMatchObject([
      { type: "tool-call", isError: true },
    ])
  })

  it("restores native input sources and generated file activities", () => {
    const messages = snapshotToChatMessages([
      {
        id: "u",
        role: "user",
        content: [
          { type: "text", text: "See image" },
          {
            type: "image",
            source: { type: "data", value: "abc", mimeType: "image/png" },
            metadata: { filename: "shot.png" },
          },
          {
            type: "document",
            source: { type: "data", value: "def", mimeType: "text/plain" },
            metadata: { filename: "notes.txt" },
          },
        ],
      },
      {
        id: "a",
        role: "assistant",
        persistedMessageId: 1,
        content: "Before",
      },
      {
        id: "generated-image",
        role: "activity",
        persistedMessageId: 1,
        activityType: "pydantic_ai_file",
        content: {
          url: "https://example.com/shot.png",
          media_type: "image/png",
        },
      },
      {
        id: "a-after",
        role: "assistant",
        persistedMessageId: 1,
        content: "After",
      },
    ])
    expect(messages[0]!.attachments).toMatchObject([
      { name: "shot.png", data: "abc" },
      { name: "notes.txt", data: "def" },
    ])
    expect(toThreadMessage(messages[0]!).attachments?.length).toBe(2)
    expect(toThreadMessage(messages[1]!).content).toEqual([
      { type: "text", text: "Before" },
      {
        type: "image",
        image: "https://example.com/shot.png",
        filename: "image",
        mimeType: "image/png",
        size: 0,
      },
      { type: "text", text: "After" },
    ])
  })

  it("merges persisted fragments without moving the initial narration below the tool", () => {
    const messages = snapshotToChatMessages([
      {
        id: "msg_1_a",
        role: "assistant",
        persisted_message_id: 1,
        content: "Before",
      },
      {
        id: "msg_1_b",
        role: "assistant",
        persisted_message_id: 1,
        tool_calls: [
          { id: "t", function: { name: "read_file", arguments: "{}" } },
        ],
      },
      {
        id: "result",
        role: "tool",
        tool_call_id: "t",
        content: "Contents",
        is_error: true,
      },
      {
        id: "msg_1_c",
        role: "assistant",
        persisted_message_id: 1,
        content: "After",
      },
    ])
    expect(toThreadMessage(messages[0]!).content).toMatchObject([
      { type: "text", text: "Before" },
      { type: "tool-call", result: "Contents", isError: true },
      { type: "text", text: "After" },
    ])
  })

  it("adopts the pending assistant placeholder and tolerates duplicate start events", () => {
    const pending: ChatMessage[] = [
      { id: "pending", role: "assistant", content: "", status: "streaming" },
    ]
    const messages = applyAgUiEvent(pending, start)
    const withText = applyAgUiEvent(messages, {
      type: "TEXT_MESSAGE_CONTENT",
      messageId: "a",
      delta: "Keep",
    })
    expect(applyAgUiEvent(withText, start)).toMatchObject([
      { id: "a", content: "Keep" },
    ])
    expect(messages).toHaveLength(1)
  })
})

it("keeps pre-start reasoning when a local placeholder adopts the server message", () => {
  const pending: ChatMessage[] = [
    {
      id: "pending",
      role: "assistant",
      content: "",
      isPlaceholder: true,
      status: "streaming",
    },
  ]
  const thought = applyAgUiEvent(pending, {
    type: "REASONING_MESSAGE_CHUNK",
    messageId: "early-reasoning",
    delta: "Early thought",
  })
  const messages = applyAgUiEvent(thought, start)
  expect(messages).toHaveLength(1)
  expect(toThreadMessage(messages[0]!).content).toMatchObject([
    { type: "reasoning", text: "Early thought" },
  ])
  expect(messages[0]!.id).toBe("a")
})

it("renders a repeated persisted tool identity once while retaining surrounding narration", () => {
  const tools = [{ id: "t", function: { name: "read_file", arguments: "{}" } }]
  const messages = snapshotToChatMessages([
    {
      id: "msg_1_a",
      role: "assistant",
      persisted_message_id: 1,
      content: "Before",
      tool_calls: tools,
    },
    {
      id: "msg_1_b",
      role: "assistant",
      persisted_message_id: 1,
      content: "After",
      tool_calls: tools,
    },
  ])
  expect(toThreadMessage(messages[0]!).content).toMatchObject([
    { type: "text", text: "Before" },
    { type: "tool-call", toolCallId: "t" },
    { type: "text", text: "After" },
  ])
})

it("cancels a deferred tool approval even without a live request identifier", async () => {
  const { settleStreamingMessages } =
    await import("@/features/chat/message-events")
  const messages: ChatMessage[] = [
    {
      id: "a",
      role: "assistant",
      content: "",
      status: "awaiting-approval",
      tools: [
        { id: "t", name: "write_file", args: "{}", pendingApproval: true },
      ],
    },
  ]
  const settled = settleStreamingMessages(messages, "stopped")
  expect(settled[0]).toMatchObject({
    status: "stopped",
    tools: [{ status: "stopped", pendingApproval: false }],
  })
  expect(toThreadMessage(settled[0]!).content).toMatchObject([
    { type: "tool-call", providerMetadata: { buddy: { status: "stopped" } } },
  ])
})
