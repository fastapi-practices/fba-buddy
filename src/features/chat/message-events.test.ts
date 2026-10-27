import { describe, expect, it } from "vitest"

import {
  applyAgUiEvent,
  completeMessageTiming,
  extractSnapshotBody,
  mergeLiveMessageTiming,
  mergeSnapshotWithLive,
  overlayLiveErrors,
  settleRunningTools,
  settleStreamingMessages,
  snapshotToChatMessages,
} from "@/features/chat/message-events"
import type { ChatMessage } from "@/lib/types"

describe("applyAgUiEvent", () => {
  it("keeps quota recovery details from top-level and nested provider errors", () => {
    const messages = applyAgUiEvent(
      [{ id: "a", role: "assistant", content: "", status: "streaming" }],
      {
        type: "RUN_ERROR",
        message: "Rate limited",
        status_code: 429,
        reset_at: "2026-10-10T12:00:00Z",
        error_detail: { provider: "demo" },
      }
    )
    expect(messages[0]?.errorDetail).toMatchObject({
      status_code: 429,
      reset_at: "2026-10-10T12:00:00Z",
      provider: "demo",
    })
  })
  it("retains distinct attempts even when providers reuse persisted turn ids", () => {
    const messages = snapshotToChatMessages([
      {
        id: "first",
        role: "assistant",
        content: "old",
        persisted_message_id: 7,
        turnContext: { attempt_id: "first" },
      },
      {
        id: "second",
        role: "assistant",
        content: "new",
        persisted_message_id: 7,
        turnContext: { attempt_id: "second" },
      },
    ])
    expect(messages.map((message) => message.content)).toEqual(["old", "new"])
  })
  it("appends streamed text, thinking, and tool calls onto the live assistant message", () => {
    let messages: ChatMessage[] = [
      { id: "user-1", role: "user", content: "查一下", status: "complete" },
    ]

    messages = applyAgUiEvent(messages, {
      type: "TEXT_MESSAGE_START",
      messageId: "asst-1",
      role: "assistant",
    })
    messages = applyAgUiEvent(messages, {
      type: "REASONING_MESSAGE_CHUNK",
      messageId: "reasoning-1",
      delta: "先检索",
    })
    messages = applyAgUiEvent(messages, {
      type: "TOOL_CALL_START",
      toolCallId: "tool-1",
      toolCallName: "web_search",
    })
    messages = applyAgUiEvent(messages, {
      type: "TOOL_CALL_ARGS",
      toolCallId: "tool-1",
      delta: '{"q":',
    })
    messages = applyAgUiEvent(messages, {
      type: "TOOL_CALL_ARGS",
      toolCallId: "tool-1",
      delta: '"x"}',
    })
    messages = applyAgUiEvent(messages, {
      type: "TEXT_MESSAGE_CONTENT",
      messageId: "asst-1",
      delta: "结果",
    })
    messages = applyAgUiEvent(messages, {
      type: "TEXT_MESSAGE_CONTENT",
      messageId: "asst-1",
      delta: "已出",
    })
    messages = applyAgUiEvent(messages, {
      type: "TEXT_MESSAGE_END",
      messageId: "asst-1",
    })

    const assistant = messages.find((item) => item.id === "asst-1")
    expect(assistant).toMatchObject({
      role: "assistant",
      content: "结果已出",
      thinking: "先检索",
      status: "complete",
    })
    expect(assistant?.tools).toEqual([
      { id: "tool-1", name: "web_search", args: '{"q":"x"}' },
    ])
  })

  it("marks interrupted write tools as awaiting approval", () => {
    let messages: ChatMessage[] = [
      { id: "user-1", role: "user", content: "删掉", status: "complete" },
      {
        id: "asst-1",
        role: "assistant",
        content: "",
        tools: [{ id: "call_write_1", name: "mcp_files_delete", args: "{}" }],
        status: "streaming",
      },
    ]

    messages = applyAgUiEvent(messages, {
      type: "RUN_FINISHED",
      outcome: {
        type: "interrupt",
        interrupts: [
          {
            id: "int-call_write_1",
            toolCallId: "call_write_1",
            reason: "tool_call",
          },
        ],
      },
    })

    expect(messages[1]).toMatchObject({
      status: "awaiting-approval",
      tools: [{ id: "call_write_1", pendingApproval: true }],
    })
  })

  it("records stream start, first token, chunks, tools, and final throughput", () => {
    let messages: ChatMessage[] = [
      { id: "user-1", role: "user", content: "查一下", status: "complete" },
    ]

    messages = applyAgUiEvent(
      messages,
      { type: "TEXT_MESSAGE_START", messageId: "asst-1", role: "assistant" },
      1_000
    )
    messages = applyAgUiEvent(
      messages,
      {
        type: "TOOL_CALL_START",
        toolCallId: "tool-1",
        toolCallName: "web_search",
      },
      1_100
    )
    messages = applyAgUiEvent(
      messages,
      { type: "TEXT_MESSAGE_CONTENT", messageId: "asst-1", delta: "结果" },
      1_200
    )
    messages = applyAgUiEvent(
      messages,
      { type: "TEXT_MESSAGE_CONTENT", messageId: "asst-1", delta: "已出" },
      1_400
    )
    messages = applyAgUiEvent(
      messages,
      { type: "TEXT_MESSAGE_END", messageId: "asst-1" },
      2_000
    )

    expect(messages.find((item) => item.id === "asst-1")?.timing).toEqual({
      streamStartTime: 1_000,
      firstTokenTime: 200,
      totalStreamTime: 1_000,
      tokenCount: 3,
      tokensPerSecond: 3,
      totalChunks: 2,
      toolCallCount: 1,
    })
  })

  it("keeps streamed text and records RUN_ERROR on the last assistant", () => {
    let messages: ChatMessage[] = [
      { id: "user-1", role: "user", content: "查一下", status: "complete" },
      {
        id: "asst-1",
        role: "assistant",
        content: "已经写了一半",
        status: "streaming",
      },
    ]

    messages = applyAgUiEvent(messages, {
      type: "RUN_ERROR",
      message: "上游超时",
      code: "model_error",
    })

    expect(messages[1]).toMatchObject({
      content: "已经写了一半",
      status: "error",
      error: "上游超时",
      errorDetail: { code: "model_error" },
    })
  })
})

describe("completeMessageTiming", () => {
  it("is a no-op when totalStreamTime is already set", () => {
    const message: ChatMessage = {
      id: "a1",
      role: "assistant",
      content: "好",
      status: "complete",
      timing: {
        streamStartTime: 1,
        totalStreamTime: 10,
        totalChunks: 1,
        toolCallCount: 0,
      },
    }
    expect(completeMessageTiming(message, 50)).toBe(message)
  })
})

describe("settleStreamingMessages", () => {
  it("finalizes timing on still-streaming assistants", () => {
    const settled = settleStreamingMessages(
      [
        { id: "u1", role: "user", content: "hi", status: "complete" },
        {
          id: "a1",
          role: "assistant",
          content: "你好",
          status: "streaming",
          timing: {
            streamStartTime: 1_000,
            firstTokenTime: 20,
            totalChunks: 1,
            toolCallCount: 0,
          },
        },
      ],
      "complete",
      1_500
    )
    expect(settled[1]).toMatchObject({
      status: "complete",
      timing: {
        streamStartTime: 1_000,
        firstTokenTime: 20,
        totalStreamTime: 500,
        tokenCount: 2,
        tokensPerSecond: 4,
        totalChunks: 1,
        toolCallCount: 0,
      },
    })
  })

  it("records the fallback error without replacing streamed content", () => {
    const settled = settleStreamingMessages(
      [
        { id: "u1", role: "user", content: "hi", status: "complete" },
        {
          id: "a1",
          role: "assistant",
          content: "已经写了一半",
          status: "streaming",
        },
      ],
      "error",
      1_500,
      "上游超时"
    )
    expect(settled[1]).toMatchObject({
      content: "已经写了一半",
      status: "error",
      error: "上游超时",
    })
  })
})

describe("mergeLiveMessageTiming", () => {
  it("copies live timing onto snapshot assistants by id, then by latest order", () => {
    const snapshot: ChatMessage[] = [
      { id: "u1", role: "user", content: "hi", status: "complete" },
      { id: "old-a", role: "assistant", content: "先前", status: "complete" },
      {
        id: "persisted-a",
        role: "assistant",
        content: "结果已出",
        status: "complete",
      },
    ]
    const live: ChatMessage[] = [
      { id: "u1", role: "user", content: "hi", status: "complete" },
      { id: "old-a", role: "assistant", content: "先前", status: "complete" },
      {
        id: "live-a",
        role: "assistant",
        content: "结果已出",
        status: "complete",
        timing: {
          streamStartTime: 1_000,
          firstTokenTime: 200,
          totalStreamTime: 1_000,
          tokenCount: 3,
          tokensPerSecond: 3,
          totalChunks: 2,
          toolCallCount: 0,
        },
      },
    ]

    const merged = mergeLiveMessageTiming(snapshot, live)
    expect(merged[1]?.timing).toBeUndefined()
    expect(merged[2]).toMatchObject({
      id: "persisted-a",
      timing: live[2]?.timing,
    })
  })
})

describe("overlayLiveErrors", () => {
  it("keeps backend error text when the snapshot already failed", () => {
    const snapshot: ChatMessage[] = [
      { id: "u1", role: "user", content: "hi", status: "complete" },
      {
        id: "persisted-a",
        role: "assistant",
        content: "半段",
        status: "error",
        error: "Invalid request",
        errorDetail: { type: "UserError" },
      },
    ]
    const live: ChatMessage[] = [
      { id: "u1", role: "user", content: "hi", status: "complete" },
      {
        id: "live-a",
        role: "assistant",
        content: "半段",
        status: "error",
        error: "生成失败",
      },
    ]

    expect(overlayLiveErrors(snapshot, live)[1]).toMatchObject({
      id: "persisted-a",
      content: "半段",
      status: "error",
      error: "Invalid request",
      errorDetail: { type: "UserError" },
    })
  })

  it("keeps the live error if the snapshot has not marked it yet", () => {
    const snapshot: ChatMessage[] = [
      {
        id: "persisted-a",
        role: "assistant",
        content: "半段",
        status: "complete",
      },
    ]
    const live: ChatMessage[] = [
      {
        id: "live-a",
        role: "assistant",
        content: "半段",
        status: "error",
        error: "上游超时",
      },
    ]

    expect(mergeSnapshotWithLive(snapshot, live)[0]).toMatchObject({
      id: "persisted-a",
      content: "半段",
      status: "error",
      error: "上游超时",
    })
  })

  it("keeps live thinking and tools when the snapshot omitted them", () => {
    const snapshot: ChatMessage[] = [
      {
        id: "persisted-a",
        role: "assistant",
        content: "结论",
        status: "complete",
      },
    ]
    const live: ChatMessage[] = [
      {
        id: "live-a",
        role: "assistant",
        content: "结论",
        status: "complete",
        thinking: "先检索再答",
        tools: [{ id: "t1", name: "lookup", args: "{}", result: "ok" }],
      },
    ]

    expect(mergeSnapshotWithLive(snapshot, live)[0]).toMatchObject({
      id: "persisted-a",
      content: "结论",
      thinking: "先检索再答",
      tools: [{ id: "t1", name: "lookup", args: "{}", result: "ok" }],
    })
  })

  it("keeps the live stream when the snapshot is still empty", () => {
    const live: ChatMessage[] = [
      {
        id: "live-u1",
        role: "user",
        content: "当前对话继续回复",
        status: "complete",
      },
      {
        id: "live-a1",
        role: "assistant",
        content: "回复完成",
        status: "complete",
      },
    ]

    // 空快照表示后端尚未回填，不能把流式现场的消息抹掉
    expect(mergeSnapshotWithLive([], live)).toEqual(live)
  })
})

describe("extractSnapshotBody", () => {
  it("splits think tags and local thinking from native text content", () => {
    expect(
      extractSnapshotBody({
        content: "<think>内部</think>\n可见",
      })
    ).toEqual({ text: "可见", thinking: "内部" })
    expect(
      extractSnapshotBody({
        thinking: "字段思考",
        content: [{ type: "text", text: "答案" }],
      })
    ).toEqual({ text: "答案", thinking: "字段思考" })
    expect(
      extractSnapshotBody({
        content: [
          {
            type: "image",
            source: { type: "data", value: "YWJj", mimeType: "image/png" },
          },
          { type: "text", text: "正文" },
        ],
      })
    ).toEqual({ text: "正文", thinking: "" })
  })
})

describe("snapshotToChatMessages", () => {
  it("keeps user text and assistant tools from a persisted snapshot", () => {
    const messages = snapshotToChatMessages([
      {
        id: "u1",
        role: "user",
        content: [{ type: "text", text: "你好" }],
        persisted_message_id: 11,
      },
      {
        id: "a1",
        role: "assistant",
        content: "好的",
        persistedMessageId: 12,
        tool_calls: [
          { id: "t1", function: { name: "lookup", arguments: "{}" } },
        ],
      },
    ])

    expect(messages).toEqual([
      { id: "u1", pk: 11, role: "user", content: "你好", status: "complete" },
      {
        id: "a1",
        pk: 12,
        role: "assistant",
        content: "好的",
        parts: [
          { type: "text", text: "好的" },
          { type: "tool-call", toolCallId: "t1" },
        ],
        tools: [{ id: "t1", name: "lookup", args: "{}" }],
        status: "complete",
      },
    ])
  })

  it("keeps skill Directive text on snapshot user messages", () => {
    const messages = snapshotToChatMessages([
      {
        id: "u1",
        role: "user",
        content: [{ type: "text", text: ":skill[摘要]{name=17} 帮我写" }],
      },
    ])
    expect(messages[0]?.content).toBe(":skill[摘要]{name=17} 帮我写")
  })

  it("keeps turnContext on snapshot user messages for playback tags", () => {
    const messages = snapshotToChatMessages([
      {
        id: "u1",
        role: "user",
        content: "继续",
        turnContext: {
          origin: "web",
          model_id: "gpt-5",
          agent_mode: "work",
          mcp_ids: [3],
        },
      },
    ])
    expect(messages[0]?.turnContext).toEqual({
      origin: "web",
      model_id: "gpt-5",
      agent_mode: "work",
      mcp_ids: [3],
    })
  })

  it("keeps assistant usage and cost from the snapshot", () => {
    const messages = snapshotToChatMessages([
      {
        id: "a1",
        role: "assistant",
        content: "好的",
        usage: {
          inputTokens: 12,
          outputTokens: 4,
          totalTokens: 16,
          cacheReadTokens: 3,
          cost: 0.0012,
        },
      },
    ])
    expect(messages[0]?.usage).toEqual({
      inputTokens: 12,
      outputTokens: 4,
      totalTokens: 16,
      cacheReadTokens: 3,
      costUsd: 0.0012,
    })
  })

  it("marks persisted assistant errors without repeating the error as content", () => {
    const messages = snapshotToChatMessages([
      {
        id: "a1",
        role: "assistant",
        content: "生成失败",
        messageType: "error",
        error: "生成失败",
        errorDetail: { type: "UserError", status_code: 400 },
        persistedMessageId: 22,
      },
    ])
    expect(messages[0]).toMatchObject({
      id: "a1",
      pk: 22,
      content: "",
      status: "error",
      error: "生成失败",
      errorDetail: { type: "UserError", status_code: 400 },
    })
  })

  it("keeps partial assistant text next to an independent backend error", () => {
    const messages = snapshotToChatMessages([
      {
        id: "a1",
        role: "assistant",
        content: "半段",
        message_type: "error",
        error: "Invalid request",
        error_detail: { model_id: "gpt-5.2" },
      },
    ])
    expect(messages[0]).toMatchObject({
      content: "半段",
      status: "error",
      error: "Invalid request",
      errorDetail: { model_id: "gpt-5.2" },
    })
  })

  it("keeps suspended assistant tools pending approval", () => {
    const messages = snapshotToChatMessages([
      {
        id: "a1",
        role: "assistant",
        content: "",
        messageType: "suspended",
        toolCalls: [
          { id: "t1", function: { name: "mcp_files_write", arguments: "{}" } },
        ],
      },
    ])
    expect(messages[0]).toMatchObject({
      status: "awaiting-approval",
      tools: [{ id: "t1", name: "mcp_files_write", pendingApproval: true }],
    })
  })

  it("reads local thinking, native reasoning messages, and think tags", () => {
    expect(
      snapshotToChatMessages([
        {
          id: "a1",
          role: "assistant",
          content: "结论",
          thinking: "先检索",
        },
      ])[0]
    ).toMatchObject({ content: "结论", thinking: "先检索" })

    expect(
      snapshotToChatMessages([
        {
          id: "msg_2_reasoning_0",
          role: "reasoning",
          persistedMessageId: 2,
          content: "拆步骤",
        },
        {
          id: "a2",
          role: "assistant",
          persistedMessageId: 2,
          content: "答案",
        },
      ])[0]
    ).toMatchObject({ content: "答案", thinking: "拆步骤" })

    expect(
      snapshotToChatMessages([
        {
          id: "a3",
          role: "assistant",
          thinking: "内部推理",
          content: "结果",
        },
      ])[0]
    ).toMatchObject({ content: "结果", thinking: "内部推理" })

    expect(
      snapshotToChatMessages([
        {
          id: "a4",
          role: "assistant",
          content: "<think>想清楚</think>\n\n可以",
        },
      ])[0]
    ).toMatchObject({ content: "可以", thinking: "想清楚" })

    expect(
      snapshotToChatMessages([
        {
          id: "t1",
          role: "reasoning",
          content: "旁路思考",
          persisted_message_id: 9,
        },
        {
          id: "a5",
          role: "assistant",
          content: "回复",
          persisted_message_id: 9,
        },
      ])[0]
    ).toMatchObject({ content: "回复", thinking: "旁路思考" })
  })

  it("attaches reasoning that arrives before the assistant fragment", () => {
    const messages = snapshotToChatMessages([
      {
        id: "msg_12_reasoning_0",
        role: "reasoning",
        content: "先想一步",
        persisted_message_id: 12,
      },
      {
        id: "msg_12_assistant_0",
        role: "assistant",
        content: "结论",
        persisted_message_id: 12,
      },
    ])
    expect(messages).toEqual([
      {
        id: "msg_12_assistant_0",
        reasoningMessageIds: ["msg_12_reasoning_0"],
        pk: 12,
        role: "assistant",
        content: "结论",
        thinking: "先想一步",
        parts: [
          {
            type: "reasoning",
            text: "先想一步",
            messageId: "msg_12_reasoning_0",
          },
          { type: "text", text: "结论" },
        ],
        status: "complete",
      },
    ])
  })

  it("merges tool-call and text fragments from the same persisted turn", () => {
    const messages = snapshotToChatMessages([
      {
        id: "msg_2_reasoning_0",
        role: "reasoning",
        content: "检索",
        persisted_message_id: 2,
      },
      {
        id: "msg_2_assistant_0",
        role: "assistant",
        content: null,
        persisted_message_id: 2,
        tool_calls: [
          { id: "t1", function: { name: "lookup", arguments: '{"q":"x"}' } },
        ],
      },
      {
        id: "msg_3_tool_0",
        role: "tool",
        content: "ok",
        tool_call_id: "t1",
        persisted_message_id: 3,
      },
      {
        id: "msg_4",
        role: "assistant",
        content: "结论",
        persisted_message_id: 4,
      },
    ])
    expect(messages).toEqual([
      {
        id: "msg_2_assistant_0",
        reasoningMessageIds: ["msg_2_reasoning_0"],
        pk: 2,
        role: "assistant",
        content: "",
        thinking: "检索",
        parts: [
          { type: "reasoning", text: "检索", messageId: "msg_2_reasoning_0" },
          { type: "tool-call", toolCallId: "t1" },
        ],
        tools: [
          {
            id: "t1",
            name: "lookup",
            args: '{"q":"x"}',
            result: "ok",
            resultMessageId: "msg_3_tool_0",
            status: "complete",
            pendingApproval: false,
          },
        ],
        status: "complete",
      },
      {
        id: "msg_4",
        pk: 4,
        role: "assistant",
        content: "结论",
        parts: [{ type: "text", text: "结论" }],
        status: "complete",
      },
    ])
  })

  it("marks interrupted and incomplete assistants as stopped", () => {
    expect(
      snapshotToChatMessages([
        {
          id: "a1",
          role: "assistant",
          content: "半段",
          message_type: "interrupted",
        },
      ])[0]
    ).toMatchObject({ content: "半段", status: "stopped" })
    expect(
      snapshotToChatMessages([
        {
          id: "a2",
          role: "assistant",
          content: "还没写完",
          messageType: "incomplete",
        },
      ])[0]
    ).toMatchObject({ content: "还没写完", status: "stopped" })
  })
})

describe("live coding approvals", () => {
  const start = () =>
    applyAgUiEvent([], {
      type: "TEXT_MESSAGE_START",
      messageId: "a",
      role: "assistant",
    })
  const approval = (request = "req") => ({
    type: "CUSTOM",
    name: "buddy.coding.approval",
    value: {
      message_id: "a",
      request_id: request,
      call_id: "t",
      name: "bash",
      arguments: { command: "ls" },
    },
  })

  it("replays approval events idempotently and resolves only the matching request", () => {
    let messages = applyAgUiEvent(start(), approval())
    messages = applyAgUiEvent(messages, approval())
    expect(messages[0].tools).toHaveLength(1)
    expect(messages[0].status).toBe("awaiting-approval")
    messages = applyAgUiEvent(messages, {
      type: "CUSTOM",
      name: "buddy.coding.approval_resolved",
      value: { message_id: "a", request_id: "old", approved: true },
    })
    expect(messages[0].tools?.[0].pendingApproval).toBe(true)
    messages = applyAgUiEvent(messages, {
      type: "CUSTOM",
      name: "buddy.coding.approval_resolved",
      value: { message_id: "a", request_id: "req", approved: false },
    })
    expect(messages[0].status).toBe("streaming")
    expect(messages[0].tools?.[0]).toMatchObject({
      pendingApproval: false,
      result: "已拒绝",
      status: "declined",
    })
  })

  it("updates live tool output and clears approvals when interrupted", () => {
    let messages = applyAgUiEvent(start(), approval())
    messages = applyAgUiEvent(messages, {
      type: "TOOL_CALL_RESULT",
      toolCallId: "t",
      content: "partial",
    })
    expect(messages[0].tools?.[0].result).toBe("partial")
    messages = applyAgUiEvent(messages, {
      type: "TEXT_MESSAGE_END",
      messageId: "a",
    })
    messages = applyAgUiEvent(messages, {
      type: "RUN_FINISHED",
      result: { status: "interrupted" },
    })
    expect(messages[0].status).toBe("stopped")
    expect(messages[0].tools?.[0].pendingApproval).toBe(false)
    expect(messages[0].tools?.[0].approvalRequestId).toBeUndefined()
  })

  it("clears live approvals on a failed stream or local stop", () => {
    const messages = applyAgUiEvent(start(), approval())
    const failed = applyAgUiEvent(messages, {
      type: "RUN_ERROR",
      message: "failed",
    })
    expect(failed[0].status).toBe("error")
    expect(failed[0].tools?.[0].pendingApproval).toBe(false)
    const stopped = settleStreamingMessages(messages, "stopped")
    expect(stopped[0].status).toBe("stopped")
    expect(stopped[0].tools?.[0].pendingApproval).toBe(false)
  })
})

describe("settleRunningTools", () => {
  it("settles a tool that is still running when the run ends", () => {
    const tools = settleRunningTools(
      [{ id: "t1", name: "write_artifact", args: "{}", status: "running" }],
      "complete"
    )
    expect(tools?.[0]?.status).toBe("stopped")
  })

  it("keeps a tool that already returned its result", () => {
    const tools = settleRunningTools(
      [
        {
          id: "t1",
          name: "write_artifact",
          args: "{}",
          result: "已保存",
          status: "running",
        },
      ],
      "complete"
    )
    expect(tools?.[0]?.status).toBe("complete")
  })

  it("leaves a tool that is waiting for an approval untouched", () => {
    const tools = settleRunningTools(
      [
        {
          id: "t1",
          name: "run_command",
          args: "{}",
          status: "running",
          pendingApproval: true,
        },
      ],
      "complete"
    )
    expect(tools?.[0]?.status).toBe("running")
  })
})
