import { describe, expect, it } from "vitest"
import type { ThreadMessage } from "@/features/chat/thread-types"
import type { RichEvent } from "./rich-events"
import {
  parseDelimitedText,
  replyActionsVisible,
  tableRowsToCsv,
  textMatches,
  transcriptTurns,
} from "./transcript-render"

const message = (
  id: string,
  role: "user" | "assistant",
  content: unknown[],
  status = { type: "complete", reason: "stop" }
) =>
  ({
    id,
    role,
    content,
    status,
    metadata: { custom: {} },
  }) as unknown as ThreadMessage

function lifecycleMessage(id: string, events: RichEvent[]) {
  const item = message(id, "assistant", [])
  item.metadata!.custom!.turnContext = { lifecycle_events: events }
  return item
}

describe("transcript turns", () => {
  it("keeps the turn running after a text message ends until its run settles", () => {
    const text = message("text", "assistant", [
      { type: "text", text: "Still working" },
    ])
    text.metadata!.custom!.workTiming = {
      runId: "run",
      status: "running",
      startedAt: 1000,
    }
    expect(transcriptTurns([text])[0]?.running).toBe(true)
    text.metadata!.custom!.workTiming = {
      runId: "run",
      status: "complete",
      startedAt: 1000,
      endedAt: 7000,
    }
    expect(transcriptTurns([text])[0]?.running).toBe(false)
    text.metadata!.custom!.workTiming = {
      runId: "run",
      status: "running",
      startedAt: 1000,
    }
    text.metadata!.custom!.attempt = { id: "old", status: "superseded" }
    expect(transcriptTurns([text])[0]?.running).toBe(false)
  })
  it("keeps the reply actions hidden until the background agents finish", () => {
    expect(replyActionsVisible({ running: false, background: false })).toBe(
      true
    )
    expect(replyActionsVisible({ running: false, background: true })).toBe(
      false
    )
    expect(replyActionsVisible({ running: true, background: false })).toBe(
      false
    )
  })
  it("retains only explicitly superseded attempts separately from the final response", () => {
    const partial = message("partial", "assistant", [
      { type: "text", text: "Incomplete approach" },
    ])
    partial.metadata!.custom!.attempt = {
      id: "attempt-1",
      status: "superseded",
      number: 1,
    }
    const answer = message("final", "assistant", [
      { type: "text", text: "Final answer" },
    ])
    const turn = transcriptTurns([
      message("user", "user", []),
      partial,
      answer,
    ])[0]
    expect(turn).toMatchObject({
      final: "final",
      attempts: [{ id: "attempt-1", messages: ["partial"], number: 1 }],
    })
    expect(transcriptTurns([answer])[0]?.attempts).toBeUndefined()
  })
  it("keeps running subagents inside the execution process", () => {
    const agent = message("agent", "assistant", [])
    agent.metadata!.custom!.turnContext = {
      lifecycle_events: [
        { name: "buddy.subagent", value: { task_id: "t1", status: "running" } },
      ],
    }
    const resource = message("resource", "assistant", [
      {
        type: "tool-call",
        toolCallId: "serve",
        toolName: "serve",
        result: { status: "running", url: "http://localhost:3000" },
      },
    ])
    const turn = transcriptTurns([agent, resource])[0]!
    expect(turn.persistent).toEqual(["resource"])
    expect(turn.lifecycleEvents?.agent).toEqual([
      { name: "buddy.subagent", value: { task_id: "t1", status: "running" } },
    ])
    expect(turn).toMatchObject({
      background: true,
      running: false,
      persistentTools: { resource: ["serve"] },
    })
  })
  it.each(["completed", "failed", "cancelled"])(
    "settles a subagent across assistant messages when its newest state is %s",
    (status) => {
      const started = lifecycleMessage("started", [
        {
          name: "buddy.subagent",
          value: { task_id: "task", status: "running", agent_name: "Research" },
        },
      ])
      const ended = lifecycleMessage("ended", [
        { name: "buddy.subagent", value: { task_id: "task", status } },
      ])
      const turn = transcriptTurns([started, ended])[0]!
      expect(turn.background).toBeFalsy()
      expect(turn.persistent).toBeUndefined()
      expect(turn.lifecycleEvents).toEqual({
        ended: [
          {
            name: "buddy.subagent",
            value: { task_id: "task", status, agent_name: "Research" },
          },
        ],
      })
    }
  )
  it("keeps only current active task entries when a message contains multiple tasks", () => {
    const started = lifecycleMessage("started", [
      { name: "buddy.subagent", value: { task_id: "a", status: "running" } },
      { name: "buddy.subagent", value: { task_id: "b", status: "queued" } },
    ])
    const ended = lifecycleMessage("ended", [
      { name: "buddy.subagent", value: { task_id: "a", status: "completed" } },
    ])
    const turn = transcriptTurns([started, ended])[0]!
    expect(turn.background).toBe(true)
    expect(turn.running).toBe(false)
    expect(turn.persistent).toBeUndefined()
    expect(turn.lifecycleEvents?.started).toEqual([
      { name: "buddy.subagent", value: { task_id: "b", status: "queued" } },
    ])
  })
  it("uses the latest tool-call resource state across messages", () => {
    const resource = (id: string, status: string) =>
      message(id, "assistant", [
        {
          type: "tool-call",
          toolCallId: "serve",
          toolName: "serve",
          result: { status, url: "http://localhost:3000" },
        },
      ])
    const running = resource("running", "running")
    const ready = resource("ready", "ready")
    const completed = resource("completed", "completed")
    const turn = transcriptTurns([running, ready])[0]!
    expect(turn.persistent).toEqual(["ready"])
    expect(turn.persistentTools).toEqual({ ready: ["serve"] })
    expect(turn.background).toBeFalsy()
    expect(turn.running).toBe(false)
    expect(
      transcriptTurns([running, ready, completed])[0]?.persistent
    ).toBeUndefined()
  })
  it("excludes superseded tasks and resources from parent activity", () => {
    const old = lifecycleMessage("old", [
      { name: "buddy.subagent", value: { task_id: "old", status: "running" } },
    ])
    old.metadata!.custom!.attempt = { id: "attempt", status: "superseded" }
    const oldResource = message("old-resource", "assistant", [
      {
        type: "tool-call",
        toolCallId: "serve",
        result: { status: "running", url: "http://localhost:3000" },
      },
    ])
    oldResource.metadata!.custom!.attempt = { status: "superseded" }
    const turn = transcriptTurns([old, oldResource])[0]!
    expect(turn.background).toBeFalsy()
    expect(turn.persistent).toBeUndefined()
    expect(turn.lifecycleEvents).toBeUndefined()
  })
  it("keeps lifecycle identity local to each user turn", () => {
    const first = lifecycleMessage("first", [
      { name: "buddy.subagent", value: { task_id: "task", status: "running" } },
    ])
    const second = lifecycleMessage("second", [
      {
        name: "buddy.subagent",
        value: { task_id: "task", status: "completed" },
      },
    ])
    const turns = transcriptTurns([
      message("u1", "user", []),
      first,
      message("u2", "user", []),
      second,
    ])
    expect(turns[0]?.background).toBe(true)
    expect(turns[1]?.background).toBeFalsy()
  })
  it("does not merge anonymous lifecycle events from different messages", () => {
    const turns = transcriptTurns([
      lifecycleMessage("a", [
        { name: "buddy.subagent", value: { status: "running" } },
      ]),
      lifecycleMessage("b", [
        { name: "buddy.subagent", value: { status: "completed" } },
      ]),
    ])
    expect(turns[0]?.background).toBe(true)
    expect(turns[0]?.lifecycleEvents).toEqual({
      a: [{ name: "buddy.subagent", value: { status: "running" } }],
      b: [{ name: "buddy.subagent", value: { status: "completed" } }],
    })
    expect(turns[0]?.persistent).toBeUndefined()
  })
  it("keeps intermediate messages in their turn and locates the final reply", () => {
    const turns = transcriptTurns([
      message("u1", "user", []),
      message("a1", "assistant", [{ type: "text", text: "Investigating" }]),
      message("a2", "assistant", [{ type: "tool-call", toolName: "read" }]),
      message("a3", "assistant", [{ type: "text", text: "Done" }]),
      message("u2", "user", []),
      message("a4", "assistant", [], { type: "running", reason: "" }),
    ])
    expect(turns[0]).toMatchObject({
      user: "u1",
      assistants: ["a1", "a2", "a3"],
      final: "a3",
      running: false,
    })
    expect(turns[1]).toMatchObject({
      user: "u2",
      assistants: ["a4"],
      running: true,
    })
  })
  it("keeps approvals and tool failures marked for attention", () => {
    expect(
      transcriptTurns([
        message("a", "assistant", [], {
          type: "requires-action",
          reason: "interrupt",
        }),
      ])[0]?.attention
    ).toBe(true)
    expect(
      transcriptTurns([
        message("a", "assistant", [{ type: "tool-call", isError: true }]),
      ])[0]?.attention
    ).toBe(true)
  })
  it("keeps rendered turn identity when a snapshot replaces temporary message IDs", () => {
    const submitted = transcriptTurns([message("temporary-u", "user", [])])
    const running = transcriptTurns(
      [
        message("temporary-u", "user", []),
        message("a", "assistant", [{ type: "text", text: "Selected code" }]),
      ],
      submitted
    )
    const restored = transcriptTurns(
      [
        message("older-u", "user", []),
        message("older-a", "assistant", []),
        message("canonical-u", "user", []),
        message("a", "assistant", [{ type: "text", text: "Selected code" }]),
      ],
      running
    )
    expect(running[0]?.renderKey).toBe(submitted[0]?.renderKey)
    expect(restored[1]).toMatchObject({
      id: "canonical-u",
      user: "canonical-u",
      renderKey: running[0]?.renderKey,
    })
    expect(new Set(restored.map((turn) => turn.renderKey)).size).toBe(2)
    expect(
      transcriptTurns([message("different", "user", [])], restored)[0]
        ?.renderKey
    ).toBe("different")
  })
})

describe("literal matching and delimited data", () => {
  it("finds repeated literal queries without treating them as regular expressions", () => {
    expect(textMatches("A+B and a+b", "a+b")).toEqual([
      { start: 0, end: 3 },
      { start: 8, end: 11 },
    ])
    expect(textMatches("text", "")).toEqual([])
  })
  it("preserves quoted commas, escaped quotes, multiline cells and empty trailing columns", () => {
    const rows = [
      ["Name", "Note", ""],
      ["A,B", 'a "quote"', "one\ntwo"],
    ]
    expect(parseDelimitedText(tableRowsToCsv(rows))).toEqual(rows)
    expect(parseDelimitedText("A\tB\r\n1\t2\r\n", "\t")).toEqual([
      ["A", "B"],
      ["1", "2"],
    ])
  })
})
