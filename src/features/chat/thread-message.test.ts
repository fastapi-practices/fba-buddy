import { describe, expect, it } from "vitest"

import {
  extractComposerText,
  parsePartialToolArgs,
  queueItemFromSubmission,
  submissionFromQueueItem,
  threadMessagePk,
  toThreadMessage,
  toThreadMessages,
} from "@/features/chat/thread-message"
import type { ChatMessage } from "@/lib/types"

describe("toThreadMessage", () => {
  it("maps persisted message pk onto Thread metadata", () => {
    const converted = toThreadMessage({
      id: "u1",
      pk: 17,
      role: "user",
      content: "你好",
      status: "complete",
    })
    expect(converted.metadata).toEqual({ custom: { pk: 17 } })
    expect(threadMessagePk(converted)).toBe(17)
  })

  it("does not expose invalid persisted ids to message actions", () => {
    for (const pk of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, Infinity]) {
      expect(threadMessagePk({ metadata: { custom: { pk } } })).toBeNull()
    }
    expect(
      threadMessagePk({ metadata: { custom: { pk: Number.MAX_SAFE_INTEGER } } })
    ).toBe(Number.MAX_SAFE_INTEGER)
  })

  it("maps turnContext onto Thread custom metadata", () => {
    const converted = toThreadMessage({
      id: "u1",
      pk: 17,
      role: "user",
      content: "你好",
      status: "complete",
      turnContext: { model_id: "gpt-5", agent_mode: "coding" },
    })
    expect(converted.metadata).toEqual({
      custom: {
        pk: 17,
        turnContext: { model_id: "gpt-5", agent_mode: "coding" },
      },
    })
  })

  it("maps user text and image attachments onto Thread attachments", () => {
    const message: ChatMessage = {
      id: "u1",
      role: "user",
      content: "看这张图",
      attachments: [
        {
          id: "att-1",
          name: "shot.png",
          mime: "image/png",
          size: 12,
          data: "abc123",
          kind: "image",
        },
      ],
      status: "complete",
    }

    const converted = toThreadMessage(message)
    expect(converted.role).toBe("user")
    expect(converted.status).toBeUndefined()
    expect(converted.content).toEqual([{ type: "text", text: "看这张图" }])
    expect(converted.attachments).toEqual([
      {
        id: "att-1",
        type: "image",
        name: "shot.png",
        contentType: "image/png",
        content: [
          {
            type: "image",
            image: "data:image/png;base64,abc123",
            filename: "shot.png",
            mimeType: "image/png",
            size: 12,
          },
        ],
        status: { type: "complete" },
      },
    ])
  })

  it("keeps skill Directive text on user messages for chip rendering", () => {
    const converted = toThreadMessage({
      id: "u2",
      role: "user",
      content: ":skill[摘要]{name=17} 帮我写",
      status: "complete",
    })
    expect(converted.content).toEqual([
      { type: "text", text: ":skill[摘要]{name=17} 帮我写" },
    ])
  })

  it("maps assistant thinking, tools, and streaming status", () => {
    const message: ChatMessage = {
      id: "a1",
      role: "assistant",
      content: "结论",
      thinking: "先想一步",
      tools: [{ id: "call-1", name: "search", args: '{"q":"fba"}' }],
      status: "streaming",
    }

    const converted = toThreadMessage(message)
    expect(converted.status).toEqual({ type: "running" })
    expect(converted.metadata?.custom?.workTiming).toEqual({
      runId: "a1",
      status: "running",
    })
    expect(JSON.parse(JSON.stringify(converted.content))).toEqual([
      { type: "reasoning", text: "先想一步" },
      {
        type: "tool-call",
        toolCallId: "call-1",
        toolName: "search",
        status: { type: "running" },
        args: { q: "fba" },
        argsText: '{"q":"fba"}',
      },
      { type: "text", text: "结论" },
    ])
  })

  it("passes assistant stream timing onto Thread metadata", () => {
    const timing = {
      streamStartTime: 1_000,
      firstTokenTime: 200,
      totalStreamTime: 1_000,
      tokenCount: 3,
      tokensPerSecond: 3,
      totalChunks: 2,
      toolCallCount: 0,
    }
    const converted = toThreadMessage({
      id: "a1",
      role: "assistant",
      content: "结论",
      status: "complete",
      timing,
    })
    expect(converted.metadata).toMatchObject({
      timing,
      custom: { workTiming: { status: "complete" } },
    })
  })

  it("keeps assistant pk alongside timing metadata", () => {
    const converted = toThreadMessage({
      id: "a1",
      pk: 9,
      role: "assistant",
      content: "结论",
      status: "complete",
      timing: {
        streamStartTime: 1,
        firstTokenTime: 2,
        totalStreamTime: 3,
        tokenCount: 1,
        tokensPerSecond: 1,
        totalChunks: 1,
        toolCallCount: 0,
      },
    })
    expect(threadMessagePk(converted)).toBe(9)
  })

  it("passes assistant usage onto Thread metadata", () => {
    const usage = {
      inputTokens: 12,
      outputTokens: 4,
      totalTokens: 16,
      costUsd: 0.0012,
    }
    const converted = toThreadMessage({
      id: "a1",
      role: "assistant",
      content: "结论",
      status: "complete",
      usage,
    })
    expect(converted.metadata).toMatchObject({
      usage,
      custom: { workTiming: { status: "complete" } },
    })
  })

  it("marks stopped assistants as cancelled so the thread can show 用户已取消", () => {
    expect(
      toThreadMessage({
        id: "a1",
        role: "assistant",
        content: "半段",
        status: "stopped",
      }).status
    ).toEqual({ type: "incomplete", reason: "cancelled" })
  })

  it("surfaces assistant errors on the incomplete status", () => {
    const converted = toThreadMessage({
      id: "a1",
      role: "assistant",
      content: "已经写了一半",
      status: "error",
      error: "上游超时",
      errorDetail: { type: "UserError", status_code: 400 },
    })
    expect(converted.status).toEqual({
      type: "incomplete",
      reason: "error",
      error: {
        type: "UserError",
        status_code: 400,
        message: "上游超时",
      },
    })
    expect(converted.content).toEqual([{ type: "text", text: "已经写了一半" }])
  })

  it("does not repeat an error-only snapshot as assistant markdown", () => {
    const converted = toThreadMessage({
      id: "a1",
      role: "assistant",
      content: "生成失败",
      status: "error",
      error: "生成失败",
    })
    expect(converted.content).toEqual([])
    expect(converted.status).toEqual({
      type: "incomplete",
      reason: "error",
      error: "生成失败",
    })
  })

  it("marks tool calls with their real lifecycle state", () => {
    const converted = toThreadMessage({
      id: "a1",
      role: "assistant",
      content: "",
      tools: [
        { id: "running", name: "read_file", args: "{}" },
        {
          id: "done",
          name: "read_file",
          args: "{}",
          result: "ok",
          status: "complete",
        },
        {
          id: "failed",
          name: "bash",
          args: "{}",
          result: "boom",
          isError: true,
          status: "error",
        },
      ],
      status: "streaming",
    })
    const parts = converted.content.filter((part) => part.type === "tool-call")
    expect(parts.map((part) => part.status)).toEqual([
      { type: "running" },
      { type: "complete" },
      { type: "incomplete", reason: "error", error: "boom" },
    ])
  })

  it("exposes HITL interrupts for tools waiting on deferredApprovals", () => {
    const converted = toThreadMessage({
      id: "a1",
      role: "assistant",
      content: "",
      tools: [
        {
          id: "call_write_1",
          name: "mcp_files_delete",
          args: "{}",
          pendingApproval: true,
        },
      ],
      status: "awaiting-approval",
    })
    expect(converted.status).toEqual({
      type: "requires-action",
      reason: "interrupt",
    })
    expect(JSON.parse(JSON.stringify(converted.content))).toEqual([
      {
        type: "tool-call",
        toolCallId: "call_write_1",
        toolName: "mcp_files_delete",
        status: { type: "requires-action", reason: "interrupt" },
        args: {},
        argsText: "{}",
        interrupt: { type: "human", payload: { toolCallId: "call_write_1" } },
      },
    ])
  })
})

describe("toThreadMessages approval gate", () => {
  it("keeps pending approvals visible and hides every generated surface after them", () => {
    const pendingTool = {
      name: "run_command",
      args: '{"command":"pnpm typecheck"}',
      result: "不应在审批前出现",
      status: "complete" as const,
      pendingApproval: true,
      approvalRequestId: "approval-1",
    }
    const messages: ChatMessage[] = [
      { id: "u1", role: "user", content: "执行检查", status: "complete" },
      {
        id: "a1",
        role: "assistant",
        content: "审批前输出审批后文本",
        thinking: "审批后推理",
        status: "awaiting-approval",
        parts: [
          { type: "text", text: "审批前输出" },
          { type: "tool-call", toolCallId: "t1" },
          { type: "tool-call", toolCallId: "t2" },
          { type: "reasoning", text: "审批后推理" },
          { type: "text", text: "审批后文本" },
          { type: "attachment", attachmentId: "att-1" },
        ],
        tools: [
          { id: "t1", ...pendingTool },
          { id: "t2", ...pendingTool, approvalRequestId: "approval-2" },
          { id: "t3", name: "read_file", args: "{}", result: "ok" },
        ],
        attachments: [
          {
            id: "att-1",
            name: "after.txt",
            mime: "text/plain",
            size: 5,
            data: "aGVsbG8=",
            kind: "document",
          },
        ],
        sources: [
          {
            url: "https://example.com",
            title: "审批后来源",
            domain: "example.com",
          },
        ],
        turnContext: {
          lifecycle_events: [{ name: "buddy.activity", value: {} }],
          custom_events: [{ name: "buddy.coding.approval", value: {} }],
          raw_events: [{ type: "RUN_FINISHED" }],
        },
      },
      {
        id: "a2",
        role: "assistant",
        content: "后续生成",
        status: "complete",
      },
      { id: "u2", role: "user", content: "审批后的追问", status: "complete" },
    ]

    const converted = toThreadMessages(messages)
    expect(converted.map((message) => message.id)).toEqual(["u1", "a1"])
    expect(converted[1].content).toEqual([
      { type: "text", text: "审批前输出" },
      expect.objectContaining({ type: "tool-call", toolCallId: "t1" }),
      expect.objectContaining({ type: "tool-call", toolCallId: "t2" }),
    ])
    expect(converted[1].content).not.toContainEqual(
      expect.objectContaining({ type: "reasoning" })
    )
    expect(converted[1].content).not.toContainEqual(
      expect.objectContaining({ type: "file" })
    )
    expect(converted[1].attachments).toBeUndefined()
    expect(converted[1].metadata?.custom?.sources).toBeUndefined()
    expect(converted[1].metadata?.custom?.turnContext).toEqual({})
  })
})

describe("extractComposerText", () => {
  it("joins text parts and ignores images", () => {
    expect(
      extractComposerText([
        { type: "text", text: "你好" },
        { type: "image", image: "data:image/png;base64,xx" },
        { type: "text", text: "世界" },
      ])
    ).toBe("你好世界")
  })

  it("keeps skill Directive text from the composer", () => {
    expect(
      extractComposerText([
        { type: "text", text: ":skill[摘要]{name=17} 帮我写" },
      ])
    ).toBe(":skill[摘要]{name=17} 帮我写")
  })
})

describe("queue submission conversion", () => {
  it("round-trips text and image attachments through a queue item", () => {
    const submission = {
      text: "hi",
      attachments: [
        {
          id: "att-1",
          name: "shot.png",
          mime: "image/png",
          size: 6,
          data: "abc123",
          kind: "image" as const,
        },
      ],
    }
    const item = queueItemFromSubmission("queued", submission)
    expect(submissionFromQueueItem(item)).toEqual(submission)
  })
})

describe("parsePartialToolArgs", () => {
  it("keeps the tool target while the arguments are still streaming", () => {
    const args = JSON.stringify({
      artifact_id: 42,
      title: "发布检查报告",
      content: "# 报告\n\n检查构建与回滚。",
    })
    const targets: (string | undefined)[] = []
    for (let index = 1; index <= args.length; index += 1) {
      const parsed = parsePartialToolArgs(args.slice(0, index)) as Record<
        string,
        unknown
      >
      targets.push(
        typeof parsed.title === "string" ? parsed.title : undefined
      )
    }
    const first = targets.findIndex((target) => target !== undefined)
    expect(first).toBeGreaterThan(-1)
    expect(targets.slice(first).every((target) => target !== undefined)).toBe(
      true
    )
  })

  it("reads the artifact id from a partial argument list", () => {
    const parsed = parsePartialToolArgs(
      '{"artifact_id": 42, "title": "发布检查报告"'
    ) as Record<string, unknown>
    expect(parsed.artifact_id).toBe(42)
    expect(parsed.title).toBe("发布检查报告")
  })
})
