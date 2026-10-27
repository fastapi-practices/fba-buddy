import { describe, expect, it } from "vitest"
import { applyAgUiEvent, snapshotToChatMessages } from "./message-events"
import { approvalsForResume } from "@/features/chat/tool-approvals"
import type { ChatMessage } from "@/lib/types"

function replay(events: Record<string, unknown>[]) {
  return events.reduce(
    (messages, event) => applyAgUiEvent(messages, event, 1000),
    [] as ChatMessage[]
  )
}

const run = { type: "RUN_STARTED", threadId: "c", runId: "server-run" }
const start = { type: "TEXT_MESSAGE_START", messageId: "a", role: "assistant" }
const finish = {
  type: "RUN_FINISHED",
  threadId: "c",
  runId: "server-run",
  outcome: { type: "success" },
}

describe("native AG-UI event sequences", () => {
  it("associates a distinct reasoning ID before and after the assistant starts", () => {
    const messages = replay([
      run,
      { type: "REASONING_START", messageId: "reasoning" },
      {
        type: "REASONING_MESSAGE_START",
        messageId: "reasoning",
        role: "reasoning",
      },
      {
        type: "REASONING_MESSAGE_CONTENT",
        messageId: "reasoning",
        delta: "Plan",
      },
      start,
      {
        type: "REASONING_MESSAGE_CONTENT",
        messageId: "reasoning",
        delta: " carefully",
      },
      { type: "TEXT_MESSAGE_CONTENT", messageId: "a", delta: "Answer" },
      finish,
    ])
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({
      id: "a",
      content: "Answer",
      thinking: "Plan carefully",
      status: "complete",
      workTiming: { runId: "server-run", status: "complete" },
    })
  })

  it("does not display encrypted reasoning as visible content", () => {
    const messages = replay([
      { type: "REASONING_START", messageId: "hidden" },
      {
        type: "REASONING_ENCRYPTED_VALUE",
        subtype: "reasoning",
        entityId: "hidden",
        encryptedValue: "opaque secret",
      },
      { type: "REASONING_END", messageId: "hidden" },
    ])
    expect(messages).toEqual([])
  })

  it.each([
    ["failed", "error", true],
    ["denied", "declined", false],
    ["interrupted", "stopped", false],
  ])(
    "keeps tool %s outcomes independent of overall run success",
    (outcome, status, isError) => {
      const encryptedValue = JSON.stringify({ pydantic_ai: { outcome } })
      const messages = replay([
        run,
        start,
        {
          type: "TOOL_CALL_START",
          parentMessageId: "a",
          toolCallId: "t",
          toolCallName: "write",
        },
        {
          type: "TOOL_CALL_RESULT",
          messageId: "result",
          toolCallId: "t",
          role: "tool",
          content: "Tool outcome",
        },
        {
          type: "REASONING_ENCRYPTED_VALUE",
          subtype: "message",
          entityId: "unrelated",
          encryptedValue: JSON.stringify({
            pydantic_ai: { outcome: "failed" },
          }),
        },
        {
          type: "REASONING_ENCRYPTED_VALUE",
          subtype: "message",
          entityId: "result",
          encryptedValue,
        },
        finish,
      ])
      expect(messages[0]?.status).toBe("complete")
      expect(messages[0]?.tools?.[0]).toMatchObject({
        result: "Tool outcome",
        status,
        isError,
      })
      const history = snapshotToChatMessages([
        {
          id: "a",
          role: "assistant",
          content: "",
          toolCalls: [
            { id: "t", function: { name: "write", arguments: "{}" } },
          ],
        },
        {
          id: "result",
          role: "tool",
          toolCallId: "t",
          content: "Tool outcome",
          error: "Tool outcome",
          encryptedValue,
        },
      ])
      expect(history[0]?.tools?.[0]).toMatchObject({ status, isError })
    }
  )

  it("returns the exact interrupt ID for live approvals and restores SDK IDs on reload", () => {
    const messages = replay([
      run,
      start,
      { type: "TOOL_CALL_START", toolCallId: "t", toolCallName: "write" },
      {
        type: "RUN_FINISHED",
        threadId: "c",
        runId: "server-run",
        outcome: {
          type: "interrupt",
          interrupts: [
            { id: "opaque-interrupt", toolCallId: "t", reason: "tool_call" },
          ],
        },
      },
    ])
    expect(messages[0]).toMatchObject({
      status: "awaiting-approval",
      tools: [
        { id: "t", pendingApproval: true, interruptId: "opaque-interrupt" },
      ],
    })
    expect(approvalsForResume(messages, { t: false })).toEqual({
      "opaque-interrupt": false,
    })
    const history = snapshotToChatMessages([
      {
        id: "a",
        role: "assistant",
        messageType: "suspended",
        toolCalls: [{ id: "t", function: { name: "write", arguments: "{}" } }],
      },
    ])
    expect(approvalsForResume(history, { t: true })).toEqual({ "int-t": true })
  })

  it("preserves the server run across a messages snapshot before text starts", () => {
    const messages = replay([
      run,
      {
        type: "MESSAGES_SNAPSHOT",
        messages: [{ id: "u", role: "user", content: "Question" }],
      },
      start,
      { type: "TEXT_MESSAGE_CONTENT", messageId: "a", delta: "Answer" },
      finish,
    ])
    expect(messages).toHaveLength(2)
    expect(messages[1]).toMatchObject({
      id: "a",
      content: "Answer",
      workTiming: { runId: "server-run", status: "complete" },
    })
  })

  it("keeps reasoning owners across snapshot replacement and history reload", () => {
    const events = [
      run,
      { type: "REASONING_MESSAGE_START", messageId: "r", role: "reasoning" },
      { type: "REASONING_MESSAGE_CONTENT", messageId: "r", delta: "one" },
      start,
      { type: "TEXT_MESSAGE_CONTENT", messageId: "a", delta: "text" },
      {
        type: "MESSAGES_SNAPSHOT",
        messages: [{ id: "a", role: "assistant", content: "text" }],
      },
      { type: "REASONING_MESSAGE_CONTENT", messageId: "r", delta: "two" },
    ]
    expect(replay(events)[0]?.thinking).toBe("onetwo")
    const history = snapshotToChatMessages([
      { id: "r", role: "reasoning", content: "one", persistedMessageId: 1 },
      { id: "a", role: "assistant", content: "text", persistedMessageId: 1 },
    ])
    expect(
      applyAgUiEvent(history, {
        type: "REASONING_MESSAGE_CONTENT",
        messageId: "r",
        delta: "two",
      })[0]?.thinking
    ).toBe("onetwo")
  })

  it("uses native file activities as attachments in live and persistent snapshots", () => {
    const file = {
      id: "file",
      role: "activity",
      activityType: "pydantic_ai_file",
      persistedMessageId: 4,
      createdTime: "2026-10-10T10:00:00Z",
      origin: "web",
      turnContext: { generation_type: "image" },
      content: {
        url: "data:image/png;base64,aW1hZ2U=",
        media_type: "image/png",
      },
    }
    const messages = replay([
      run,
      { type: "MESSAGES_SNAPSHOT", messages: [file] },
      finish,
    ])
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({
      pk: 4,
      createdAt: "2026-10-10T10:00:00.000Z",
      origin: "web",
      turnContext: { generation_type: "image" },
    })
    expect(messages[0]?.attachments).toMatchObject([
      { id: "file", kind: "image", mime: "image/png", data: "aW1hZ2U=" },
    ])
    const live = replay([
      run,
      {
        type: "ACTIVITY_SNAPSHOT",
        messageId: "file",
        activityType: file.activityType,
        content: file.content,
      },
      finish,
    ])
    expect(live[0]?.attachments).toEqual(messages[0]?.attachments)
  })

  it("does not reset optimistic work timing when RUN_STARTED is replayed", () => {
    const pending: ChatMessage[] = [
      {
        id: "placeholder",
        role: "assistant",
        content: "",
        isPlaceholder: true,
        status: "streaming",
        workTiming: { runId: "optimistic", status: "running", startedAt: 100 },
      },
    ]
    const started = applyAgUiEvent(pending, run, 1000)
    const replayed = applyAgUiEvent(started, run, 5000)
    expect(replayed[0]?.workTiming).toMatchObject({
      runId: "server-run",
      startedAt: 100,
    })
  })

  it("uses the native start timestamp when no cached timing is available", () => {
    const messages = applyAgUiEvent([], { ...run, timestamp: 200 }, 5000)
    expect(messages[0]?.workTiming?.startedAt).toBe(200)
  })

  it("ignores legacy stream field aliases and thinking event names", () => {
    const messages = replay([
      start,
      { type: "TEXT_MESSAGE_CONTENT", message_id: "a", delta: "Legacy" },
      { type: "TEXT_MESSAGE_CONTENT", messageId: "a", content: "Legacy" },
      {
        type: "THINKING_TEXT_MESSAGE_CONTENT",
        messageId: "a",
        delta: "Legacy",
      },
    ])
    expect(messages[0]?.content).toBe("")
    expect(messages[0]?.thinking).toBeUndefined()
  })
})
