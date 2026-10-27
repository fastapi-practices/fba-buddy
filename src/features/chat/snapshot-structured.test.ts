import { describe, expect, it } from "vitest"
import { snapshotToChatMessages } from "./message-events"
import { toThreadMessage } from "./thread-message"

describe("structured snapshot history", () => {
  it("replays inline narration, tools and reasoning in their persisted order", () => {
    const [message] = snapshotToChatMessages([
      {
        id: "a",
        role: "assistant",
        content: [
          { type: "text", text: "Before reading" },
          {
            type: "tool-call",
            toolCallId: "read",
            toolName: "read_file",
            args: { path: "input.txt" },
            result: "File contents",
          },
          { type: "reasoning", text: "After reading thought" },
          { type: "text", text: "Final reply" },
        ],
      },
    ])
    expect(message?.content).toBe("Before readingFinal reply")
    expect(message?.thinking).toBe("After reading thought")
    expect(
      JSON.parse(JSON.stringify(toThreadMessage(message!).content))
    ).toEqual([
      { type: "text", text: "Before reading" },
      {
        type: "tool-call",
        toolCallId: "read",
        toolName: "read_file",
        args: { path: "input.txt" },
        argsText: '{"path":"input.txt"}',
        result: "File contents",
        status: { type: "complete" },
      },
      { type: "reasoning", text: "After reading thought" },
      { type: "text", text: "Final reply" },
    ])
  })

  it("uses explicit ordered parts and snake-case tool fields without duplicating content", () => {
    const [message] = snapshotToChatMessages([
      {
        id: "a",
        role: "assistant",
        content: "Aggregate reply",
        parts: [
          { part_kind: "text", content: "Before" },
          {
            type: "tool-call",
            tool_call_id: "write",
            tool_name: "write_file",
            arguments: '{"path":"output.txt"}',
            result: { message: "Denied by host" },
            is_error: true,
            status: "error",
          },
          { type: "reasoning", summary: [{ text: "Thought" }] },
          { type: "text", text: "After" },
        ],
      },
    ])
    expect(message?.content).toBe("BeforeAfter")
    expect(message?.thinking).toBe("Thought")
    expect(message?.parts?.map((part) => part.type)).toEqual([
      "text",
      "tool-call",
      "reasoning",
      "text",
    ])
    expect(message?.tools).toEqual([
      {
        id: "write",
        name: "write_file",
        args: '{"path":"output.txt"}',
        result: '{"message":"Denied by host"}',
        isError: true,
        status: "error",
      },
    ])
  })
  it("merges inline details with tool_calls and attaches later role-tool results once", () => {
    const [message] = snapshotToChatMessages([
      {
        id: "a",
        role: "assistant",
        content: [
          { type: "text", text: "Before" },
          { type: "tool-call", toolCallId: "call", result: "Inline result" },
          { type: "text", text: "After" },
        ],
        tool_calls: [
          {
            id: "call",
            function: { name: "bash", arguments: '{"command":"false"}' },
          },
        ],
      },
      {
        id: "result",
        role: "tool",
        tool_call_id: "call",
        content: "Authoritative failure",
        isError: true,
      },
    ])
    expect(message?.tools).toEqual([
      {
        id: "call",
        name: "bash",
        args: '{"command":"false"}',
        result: "Authoritative failure",
        resultMessageId: "result",
        pendingApproval: false,
        isError: true,
        status: "error",
      },
    ])
    expect(message?.parts).toEqual([
      { type: "text", text: "Before" },
      { type: "tool-call", toolCallId: "call" },
      { type: "text", text: "After" },
    ])
  })

  it("deduplicates repeated inline calls while preserving their original placement and request", () => {
    const [message] = snapshotToChatMessages([
      {
        id: "a",
        role: "assistant",
        thinking: "Persisted thought",
        content: [
          { type: "reasoning", text: "Persisted thought" },
          {
            type: "tool-call",
            toolCallId: "read",
            toolName: "read_file",
            args: { path: "file.txt" },
          },
          { type: "text", text: "Reading done" },
          {
            type: "tool-call",
            toolCallId: "read",
            result: "Final contents",
            status: "complete",
          },
        ],
      },
    ])
    expect(message?.thinking).toBe("Persisted thought")
    expect(message?.parts).toEqual([
      { type: "reasoning", text: "Persisted thought" },
      { type: "tool-call", toolCallId: "read" },
      { type: "text", text: "Reading done" },
    ])
    expect(message?.tools).toEqual([
      {
        id: "read",
        name: "read_file",
        args: '{"path":"file.txt"}',
        result: "Final contents",
        status: "complete",
      },
    ])
  })

  it("does not request approval again for completed inline calls in a suspended snapshot", () => {
    const [message] = snapshotToChatMessages([
      {
        id: "a",
        role: "assistant",
        messageType: "suspended",
        parts: [
          {
            type: "tool-call",
            toolCallId: "done",
            toolName: "read_file",
            args: {},
            result: "Read result",
            status: "complete",
          },
          { type: "tool-call", toolCallId: "pending" },
        ],
        toolCalls: [
          { id: "pending", function: { name: "write_file", arguments: "{}" } },
        ],
      },
    ])
    expect(
      message?.tools?.find((tool) => tool.id === "done")
    ).not.toHaveProperty("pendingApproval")
    expect(message?.tools?.find((tool) => tool.id === "pending")).toMatchObject(
      {
        id: "pending",
        name: "write_file",
        pendingApproval: true,
      }
    )
  })

  it("keeps standalone text when explicit parts are empty or only contain tool records", () => {
    for (const parts of [
      [],
      [
        {
          type: "tool-call",
          toolCallId: "read",
          toolName: "read_file",
          args: {},
          result: "Contents",
        },
      ],
    ]) {
      const [message] = snapshotToChatMessages([
        { id: "a", role: "assistant", content: "Final reply", parts },
      ])
      const rendered = toThreadMessage(message!).content
      expect(rendered).toContainEqual({ type: "text", text: "Final reply" })
      expect(message?.content).toBe("Final reply")
    }
  })
})
