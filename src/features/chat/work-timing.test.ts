import { describe, expect, it } from "vitest"
import {
  applyAgUiEvent,
  settleStreamingMessages,
  snapshotToChatMessages,
} from "@/features/chat/message-events"
import { createWorkTimingCache } from "./work-timing-cache"
import { liveToolTiming, startWorkTiming } from "./work-timing"
import type { ChatMessage } from "@/lib/types"

function storage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
    values,
  }
}

function pending(): ChatMessage[] {
  return [
    { id: "u", role: "user", content: "Inspect code" },
    {
      id: "pending",
      role: "assistant",
      content: "",
      isPlaceholder: true,
      status: "streaming",
      workTiming: startWorkTiming("run", 1000),
    },
  ]
}

function completed() {
  let messages = pending()
  messages = applyAgUiEvent(
    messages,
    { type: "TEXT_MESSAGE_START", messageId: "a", role: "assistant" },
    2000
  )
  messages = applyAgUiEvent(
    messages,
    { type: "TEXT_MESSAGE_CONTENT", messageId: "a", delta: "Reply" },
    3000
  )
  messages = applyAgUiEvent(
    messages,
    { type: "TEXT_MESSAGE_END", messageId: "a" },
    4000
  )
  return applyAgUiEvent(
    messages,
    { type: "RUN_FINISHED", result: { status: "success" } },
    6000
  )
}

function snapshot(id = "persisted-a"): ChatMessage[] {
  return snapshotToChatMessages([
    {
      id: "persisted-u",
      persisted_message_id: 1,
      role: "user",
      content: "Inspect code",
    },
    { id, persisted_message_id: 2, role: "assistant", content: "Reply" },
  ])
}

describe("work timing lifecycle", () => {
  it("measures the entire run rather than freezing at the first text end", () => {
    let messages = pending()
    messages = applyAgUiEvent(
      messages,
      { type: "TEXT_MESSAGE_START", messageId: "a", role: "assistant" },
      2000
    )
    messages = applyAgUiEvent(
      messages,
      { type: "TEXT_MESSAGE_END", messageId: "a" },
      3000
    )
    expect(messages.at(-1)?.workTiming).toMatchObject({
      startedAt: 1000,
      status: "running",
    })
    messages = applyAgUiEvent(
      messages,
      { type: "TEXT_MESSAGE_START", messageId: "b", role: "assistant" },
      4000
    )
    expect(messages.at(-1)?.workTiming?.runId).toBe("run")
    messages = applyAgUiEvent(
      messages,
      { type: "RUN_FINISHED", result: { status: "success" } },
      7000
    )
    expect(
      messages
        .filter((message) => message.role === "assistant")
        .every((message) => message.workTiming?.elapsedMs === 6000)
    ).toBe(true)
    expect(messages.at(-1)?.workTiming).toMatchObject({
      status: "complete",
      endedAt: 7000,
    })
  })

  it.each(["stopped", "error"] as const)(
    "freezes %s and never grows after later settling",
    (status) => {
      const settled = settleStreamingMessages(pending(), status, 4500)
      expect(settled.at(-1)?.workTiming).toMatchObject({
        status,
        elapsedMs: 3500,
        endedAt: 4500,
      })
      expect(
        settleStreamingMessages(settled, "complete", 10000).at(-1)?.workTiming
      ).toEqual(settled.at(-1)?.workTiming)
    }
  )

  it("pauses for approval then resumes the original run start", () => {
    let messages = applyAgUiEvent(
      pending(),
      { type: "TEXT_MESSAGE_START", messageId: "a", role: "assistant" },
      2000
    )
    messages = applyAgUiEvent(
      messages,
      {
        type: "CUSTOM",
        name: "buddy.coding.approval",
        value: {
          message_id: "a",
          request_id: "approval",
          call_id: "t",
          name: "write_file",
          arguments: {},
        },
      },
      4000
    )
    expect(messages.at(-1)?.workTiming).toMatchObject({
      status: "awaiting-approval",
      elapsedMs: 3000,
    })
    messages = applyAgUiEvent(
      messages,
      {
        type: "CUSTOM",
        name: "buddy.coding.approval_resolved",
        value: { message_id: "a", request_id: "approval", approved: true },
      },
      7000
    )
    expect(messages.at(-1)?.workTiming).toMatchObject({
      startedAt: 1000,
      status: "running",
    })
    messages = applyAgUiEvent(
      messages,
      { type: "RUN_FINISHED", result: { status: "success" } },
      9000
    )
    expect(messages.at(-1)?.workTiming?.elapsedMs).toBe(8000)
  })

  it("settles a run when the stream closes after text end without RUN_FINISHED", () => {
    const ended = applyAgUiEvent(
      pending(),
      { type: "TEXT_MESSAGE_END", messageId: "pending" },
      2000
    )
    expect(
      settleStreamingMessages(ended, "complete", 7000).at(-1)?.workTiming
    ).toMatchObject({ status: "complete", elapsedMs: 6000 })
  })
})

describe("persistent work timing", () => {
  it("recovers elapsed time across fresh cache instances and changed server IDs", () => {
    const disk = storage()
    createWorkTimingCache(disk, "user-1").remember(
      "conversation",
      completed(),
      true
    )
    const restored = createWorkTimingCache(disk, "user-1").restore(
      "conversation",
      snapshot(),
      false
    )
    expect(restored.at(-1)?.workTiming).toMatchObject({
      runId: "run",
      status: "complete",
      elapsedMs: 5000,
    })
    createWorkTimingCache(disk, "user-1").remember(
      "conversation",
      restored,
      true
    )
    expect(
      createWorkTimingCache(disk, "user-1")
        .restore("conversation", snapshot(), false)
        .at(-1)?.workTiming?.elapsedMs
    ).toBe(5000)
    expect([...disk.values.values()].join("")).not.toContain("Inspect code")
  })

  it("resumes from the original start after reconnecting to a live turn", () => {
    const disk = storage()
    createWorkTimingCache(disk, "user").remember("c", pending(), true)
    const restored = createWorkTimingCache(disk, "user").restore(
      "c",
      snapshot(),
      true
    )
    expect(restored.at(-1)?.workTiming).toMatchObject({
      startedAt: 1000,
      status: "running",
    })
  })

  it("isolates users and conversations and tolerates corrupt storage", () => {
    const disk = storage()
    createWorkTimingCache(disk, "user-1").remember("a", completed(), true)
    expect(
      createWorkTimingCache(disk, "user-2")
        .restore("a", snapshot(), false)
        .at(-1)?.workTiming?.elapsedMs
    ).toBeUndefined()
    expect(
      createWorkTimingCache(disk, "user-1")
        .restore("b", snapshot(), false)
        .at(-1)?.workTiming?.elapsedMs
    ).toBeUndefined()
    disk.getItem = () => "invalid json"
    expect(() =>
      createWorkTimingCache(disk, "user-1").restore("a", snapshot(), false)
    ).not.toThrow()
  })

  it("does not assign an old response duration to a regenerated reply with different content", () => {
    const disk = storage()
    createWorkTimingCache(disk, "user").remember("c", completed(), true)
    const history = snapshot()
    history.at(-1)!.content = "Regenerated response"
    expect(
      createWorkTimingCache(disk, "user").restore("c", history, false).at(-1)
        ?.workTiming?.elapsedMs
    ).toBeUndefined()
  })

  it("uses backend timestamps when provided and keeps unknown old duration absent", () => {
    const known = snapshotToChatMessages([
      {
        id: "a",
        role: "assistant",
        content: "Reply",
        started_at: "2026-10-08T01:00:00Z",
        completed_at: "2026-10-08T01:00:12Z",
      },
    ])
    expect(known[0]?.workTiming).toMatchObject({
      status: "complete",
      elapsedMs: 12000,
    })
    const unknown = createWorkTimingCache(null, "u").restore(
      "c",
      snapshot(),
      false
    )
    expect(unknown.at(-1)?.workTiming).toEqual({
      runId: "persisted-a",
      status: "complete",
    })
  })

  it("keeps stopped state when the server snapshot lacks the cancellation marker", () => {
    const disk = storage()
    const messages = settleStreamingMessages(pending(), "stopped", 5000)
    messages.at(-1)!.content = "Reply"
    createWorkTimingCache(disk, "user").remember("c", messages, true)
    expect(
      createWorkTimingCache(disk, "user").restore("c", snapshot(), false).at(-1)
        ?.workTiming
    ).toMatchObject({ status: "stopped", elapsedMs: 4000 })
  })
})

it("replaces an exact persisted message's old clock when the regenerated content changes", () => {
  const disk = storage()
  const cache = createWorkTimingCache(disk, "user")
  cache.remember("c", completed(), true)
  const restored = cache.restore("c", snapshot(), false)
  cache.remember("c", restored, true)
  const replacement = snapshot()
  replacement.at(-1)!.content = "Replacement"
  expect(
    createWorkTimingCache(disk, "user").restore("c", replacement, false).at(-1)
      ?.workTiming?.elapsedMs
  ).toBeUndefined()
})

it("retains a stopped clock before the first server assistant message exists", () => {
  const disk = storage()
  const cache = createWorkTimingCache(disk, "user")
  cache.remember("c", settleStreamingMessages(pending(), "stopped", 4000), true)
  const history = [
    { id: "server-u", role: "user" as const, content: "Inspect code" },
  ]
  expect(
    createWorkTimingCache(disk, "user").restore("c", history, false).at(-1)
  ).toMatchObject({
    role: "assistant",
    status: "stopped",
    workTiming: { elapsedMs: 3000 },
  })
})

it("does not allow a stale pane's running cache to overwrite a finished clock", () => {
  const disk = storage()
  const first = createWorkTimingCache(disk, "user")
  first.remember("c", pending(), true)
  createWorkTimingCache(disk, "user").remember("c", completed(), true)
  expect(
    first.restore("c", snapshot(), false).at(-1)?.workTiming
  ).toMatchObject({ status: "complete", elapsedMs: 5000 })
})

it("keeps the reply usable when local storage rejects writes", () => {
  const disk = {
    getItem: () => null,
    setItem: () => {
      throw new Error("storage full")
    },
  }
  const cache = createWorkTimingCache(disk, "user")
  expect(() => cache.remember("c", completed(), true)).not.toThrow()
  expect(
    cache.restore("c", snapshot(), false).at(-1)?.workTiming?.elapsedMs
  ).toBe(5000)
})

it("keeps the tool timer running while the turn waits for an answer", () => {
  expect(
    liveToolTiming({
      toolRunning: true,
      messageRunning: false,
      turnRunning: true,
    })
  ).toBe(true)
})

it("stops the tool timer once the tool call is finished", () => {
  expect(
    liveToolTiming({
      toolRunning: false,
      messageRunning: true,
      turnRunning: true,
    })
  ).toBe(false)
})

it("keeps the tool timer running while the user decides an approval", () => {
  expect(
    liveToolTiming({
      toolRunning: true,
      messageRunning: false,
      turnRunning: false,
      waitingForUser: true,
    })
  ).toBe(true)
})
