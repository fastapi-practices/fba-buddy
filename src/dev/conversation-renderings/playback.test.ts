import type { ChatMessage } from "@/lib/types"
import { afterEach, describe, expect, it, vi } from "vitest"

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("conversation rendering playback", () => {
  it("pauses approval playback before the tool result and final text", async () => {
    vi.stubGlobal("window", { location: { href: "https://preview.test/" } })
    const { buildScenePlayback } = await import("./playback")
    const steps = buildScenePlayback({
      id: "approval",
      title: "工具审批",
      description: "审批演示",
      covers: [],
      messages: [
        { id: "user", role: "user", content: "执行检查" },
        {
          id: "assistant",
          role: "assistant",
          content: "检查完成",
          status: "awaiting-approval",
          tools: [
            {
              id: "call",
              name: "run_command",
              args: JSON.stringify({ command: "pnpm typecheck" }),
              result: "TypeScript: no errors found",
              pendingApproval: true,
              approvalRequestId: "approval-1",
            },
          ],
        },
      ],
    })
    const approvalIndex = steps.findIndex(
      (step) =>
        step.kind === "event" && step.event.name === "buddy.coding.approval"
    )

    expect(steps[approvalIndex]).toMatchObject({
      waitForApproval: "approval-1",
    })
    expect(
      steps
        .slice(0, approvalIndex)
        .some(
          (step) =>
            step.kind === "event" && step.event.type === "TEXT_MESSAGE_CONTENT"
        )
    ).toBe(false)
    const resultIndex = steps.findIndex(
      (step) => step.kind === "event" && step.event.type === "TOOL_CALL_RESULT"
    )
    expect(steps[resultIndex]).toEqual(
      expect.objectContaining({
        kind: "event",
        delay: 800,
      })
    )
    expect(steps[resultIndex + 1]).toMatchObject({ kind: "wait", delay: 600 })
  })

  it("finishes the queued reply so the actions only show up when it is done", async () => {
    vi.stubGlobal("window", { location: { href: "https://preview.test/" } })
    const { buildScenePlayback, buildReplyPlayback } = await import("./playback")
    const { scenes } = await import("./fixtures")
    const scene = scenes.find((item) => item.id === "queue")
    expect(scene).toBeDefined()

    const steps = buildScenePlayback(scene!)
    expect(steps.at(-1)).toMatchObject({
      kind: "event",
      event: { type: "RUN_FINISHED" },
    })
    const reply = buildReplyPlayback("answer", "已经处理完成。")
    expect(reply.at(-1)).toMatchObject({
      kind: "event",
      event: { type: "RUN_FINISHED" },
    })
    expect(
      reply.some(
        (step) =>
          step.kind === "event" &&
          step.event.type === "TEXT_MESSAGE_CONTENT"
      )
    ).toBe(true)
  })

  it("persists messages when the run finishes so reply actions are available", async () => {
    vi.stubGlobal("window", { location: { href: "https://preview.test/" } })
    const { applyPlaybackStep } = await import("./playback")
    const streaming: ChatMessage = {
      id: "answer",
      role: "assistant",
      content: "已完成",
      status: "streaming",
    }

    const messages = applyPlaybackStep([streaming], {
      kind: "event",
      event: { type: "RUN_FINISHED" },
      delay: 0,
    })

    expect(messages[0]?.pk).toBeTypeOf("number")
    expect(messages[0]?.pk).toBeGreaterThan(0)
  })

  it("keeps the live work duration when finalizing a reply", async () => {
    vi.stubGlobal("window", { location: { href: "https://preview.test/" } })
    vi.useFakeTimers()
    vi.setSystemTime(8500)
    const { applyPlaybackStep } = await import("./playback")
    const live: ChatMessage = {
      id: "answer",
      role: "assistant",
      content: "",
      status: "streaming",
      workTiming: {
        runId: "run",
        status: "running",
        startedAt: 1000,
      },
    }

    const messages = applyPlaybackStep([live], {
      kind: "finalize",
      message: {
        id: "answer",
        role: "assistant",
        content: "已完成",
        status: "complete",
      },
      delay: 0,
    })

    expect(messages[0]?.workTiming).toMatchObject({
      status: "complete",
      startedAt: 1000,
      elapsedMs: 7500,
    })
  })

  it("resumes approved playback from the real resolution event", async () => {
    vi.stubGlobal("window", { location: { href: "https://preview.test/" } })
    const { applyPlaybackStep, respondToPlaybackApproval } =
      await import("./playback")
    const playback = [
      {
        kind: "event" as const,
        event: {
          type: "CUSTOM",
          name: "buddy.coding.approval",
          value: {
            message_id: "assistant",
            request_id: "approval-1",
            call_id: "call-1",
            name: "run_command",
            arguments: { command: "pnpm typecheck" },
          },
        },
        delay: 0,
        waitForApproval: "approval-1",
      },
      {
        kind: "event" as const,
        event: {
          type: "TOOL_CALL_RESULT",
          toolCallId: "call-1",
          content: "no errors",
        },
        delay: 0,
      },
    ]
    const pending: ChatMessage = {
      id: "assistant",
      role: "assistant",
      content: "",
      status: "awaiting-approval",
      tools: [
        {
          id: "call-1",
          name: "run_command",
          args: "{}",
          pendingApproval: true,
          approvalRequestId: "approval-1",
        },
      ],
    }

    const resumed = respondToPlaybackApproval({
      messages: [pending],
      playback,
      approvalIndex: 0,
      approved: true,
    })
    expect(resumed).toMatchObject({ cursor: 1, playing: true })
    expect(resumed.messages[0]).toMatchObject({
      status: "streaming",
      tools: [
        expect.objectContaining({
          id: "call-1",
          pendingApproval: false,
          status: "running",
        }),
      ],
    })
    const completed = applyPlaybackStep(resumed.messages, playback[1])
    expect(completed[0].tools?.[0]).toMatchObject({
      result: "no errors",
      status: "complete",
    })
  })

  it("replays only the clicked turn when regenerating", async () => {
    vi.stubGlobal("window", { location: { href: "https://preview.test/" } })
    const { applyPlaybackStep, buildScenePlayback, planRegenerate } =
      await import("./playback")
    const steps = buildScenePlayback({
      id: "regenerate",
      title: "重新生成",
      description: "重新生成演示",
      covers: [],
      messages: [
        { id: "u1", role: "user", content: "第一问", pk: 1 },
        {
          id: "a1",
          role: "assistant",
          content: "第一答",
          status: "complete",
          pk: 2,
        },
        { id: "u2", role: "user", content: "第二问", pk: 3 },
        {
          id: "a2",
          role: "assistant",
          content: "第二答",
          status: "complete",
          pk: 4,
        },
      ],
    })

    const current = planRegenerate(steps, 4)
    expect(current?.base.map((message) => message.id)).toEqual([
      "u1",
      "a1",
      "u2",
    ])
    const replayed = (current?.steps ?? []).reduce(
      (messages, step) => applyPlaybackStep(messages, step),
      current!.base
    )
    expect(replayed.map((message) => message.id)).toEqual([
      "u1",
      "a1",
      "u2",
      "a2",
    ])

    const historical = planRegenerate(steps, 2)
    expect(historical?.base.map((message) => message.id)).toEqual(["u1"])
    const branched = (historical?.steps ?? []).reduce(
      (messages, step) => applyPlaybackStep(messages, step),
      historical!.base
    )
    expect(branched.map((message) => message.id)).toEqual(["u1", "a1"])
  })

  it("rewrites the question when the history question is edited", async () => {
    vi.stubGlobal("window", { location: { href: "https://preview.test/" } })
    const { buildScenePlayback, planRegenerate } = await import("./playback")
    const steps = buildScenePlayback({
      id: "edit",
      title: "编辑历史提问",
      description: "编辑演示",
      covers: [],
      messages: [
        { id: "u1", role: "user", content: "第一问", pk: 1 },
        {
          id: "a1",
          role: "assistant",
          content: "第一答",
          status: "complete",
          pk: 2,
        },
      ],
    })

    const plan = planRegenerate(steps, 1, { question: "改过的问题" })
    expect(plan?.base.at(-1)?.content).toBe("改过的问题")
  })

  it("keeps the history up to the forked message", async () => {
    vi.stubGlobal("window", { location: { href: "https://preview.test/" } })
    const { buildScenePlayback, planFork } = await import("./playback")
    const steps = buildScenePlayback({
      id: "fork",
      title: "新建分支",
      description: "分支演示",
      covers: [],
      messages: [
        { id: "u1", role: "user", content: "第一问", pk: 1 },
        {
          id: "a1",
          role: "assistant",
          content: "第一答",
          status: "complete",
          pk: 2,
        },
        { id: "u2", role: "user", content: "第二问", pk: 3 },
      ],
    })

    expect(planFork(steps, 1)?.base.map((message) => message.id)).toEqual([
      "u1",
    ])
    expect(planFork(steps, 2)?.base.map((message) => message.id)).toEqual([
      "u1",
      "a1",
    ])
    expect(planFork(steps, 2)?.steps).toEqual([])
  })

  it("rejects the current branch without applying later generated steps", async () => {
    vi.stubGlobal("window", { location: { href: "https://preview.test/" } })
    const { respondToPlaybackApproval } = await import("./playback")
    const playback = [
      {
        kind: "event" as const,
        event: {
          type: "CUSTOM",
          name: "buddy.coding.approval",
          value: {
            message_id: "assistant",
            request_id: "approval-1",
            call_id: "call-1",
            name: "run_command",
            arguments: { command: "pnpm typecheck" },
          },
        },
        delay: 0,
        waitForApproval: "approval-1",
      },
      {
        kind: "event" as const,
        event: {
          type: "TEXT_MESSAGE_CONTENT",
          messageId: "assistant",
          delta: "不应出现",
        },
        delay: 0,
      },
    ]
    const pending: ChatMessage = {
      id: "assistant",
      role: "assistant",
      content: "",
      status: "awaiting-approval",
      tools: [
        {
          id: "call-1",
          name: "run_command",
          args: "{}",
          pendingApproval: true,
          approvalRequestId: "approval-1",
        },
      ],
    }

    const rejected = respondToPlaybackApproval({
      messages: [pending],
      playback,
      approvalIndex: 0,
      approved: false,
    })
    expect(rejected).toMatchObject({ cursor: 2, playing: false })
    expect(rejected.messages[0]).toMatchObject({
      content: "",
      status: "complete",
      tools: [
        expect.objectContaining({
          id: "call-1",
          pendingApproval: false,
          approvalRequestId: undefined,
          status: "declined",
        }),
      ],
    })
  })
})
