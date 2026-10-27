import { describe, expect, it } from "vitest"
import {
  hasPersistentLifecycleWork,
  isActiveSubagentEvent,
  isPersistentLifecycleEvent,
  latestLifecycleEvents,
  lifecycleEventKey,
  lifecycleStatus,
  mergeRichEvent,
  readRichEvents,
  type RichEvent,
} from "./rich-events"

describe("readRichEvents", () => {
  it("preserves product fields in named custom event envelopes", () => {
    const value = {
      kind: "planning.created",
      message_id: "assistant-1",
      request_id: "request-1",
      item: { id: "step-1", content: "Inspect source", status: "pending" },
    }
    const event = { name: "buddy.planning", value }

    expect(readRichEvents([event])).toEqual([event])
    expect(readRichEvents([event])[0]?.value).toBe(value)
  })

  it("rejects unwrapped lifecycle payloads and malformed values", () => {
    expect(
      readRichEvents([
        { kind: "planning.created", item: { id: "step-1" } },
        { kind: "user_input.requested", request_id: "request-1" },
        { kind: "sub_agents.delegation_start", task_id: "task-1" },
        { name: "buddy.subagent", value: [] },
        { name: "buddy.planning", value: null },
        { name: "buddy.activity", value: "running" },
        { name: 1, value: {} },
        null,
      ])
    ).toEqual([])
    expect(readRichEvents({ name: "buddy.activity", value: {} })).toEqual([])
  })
})

describe("lifecycle state", () => {
  it.each([
    ["queued", "queued"],
    ["pending", "queued"],
    ["running", "running"],
    ["sub_agents.delegation_start", "running"],
    ["completed", "completed"],
    ["sub_agents.delegation_end", "completed"],
    ["ok", "completed"],
    ["failed", "failed"],
    ["error", "failed"],
    ["cancelled", "cancelled"],
    ["canceled", "cancelled"],
    ["stopped", "cancelled"],
    ["ready", "ready"],
    ["unrecognized", "unknown"],
  ])("normalizes %s to %s", (status, expected) => {
    expect(lifecycleStatus({ name: "buddy.subagent", value: { status } })).toBe(
      expected
    )
  })

  it("distinguishes pending subagent work from a ready persistent resource", () => {
    for (const status of ["queued", "running"])
      expect(
        isActiveSubagentEvent({ name: "buddy.subagent", value: { status } })
      ).toBe(true)
    const resource = {
      name: "buddy.activity",
      value: { id: "preview", status: "ready", url: "http://localhost:3000" },
    }
    expect(isPersistentLifecycleEvent(resource)).toBe(true)
    expect(isActiveSubagentEvent(resource)).toBe(false)
    expect(
      isActiveSubagentEvent({
        name: "buddy.subagent",
        value: { status: "ready" },
      })
    ).toBe(false)
    expect(
      isActiveSubagentEvent({
        name: "buddy.subagent",
        value: { status: "unrecognized" },
      })
    ).toBe(false)
  })

  it("uses tool-call identity and agent name consistently across status changes", () => {
    const event = {
      name: "buddy.subagent",
      value: { tool_call_id: "call", kind: "sub_agents.delegation_start" },
    }
    const completed = {
      ...event,
      value: { tool_call_id: "call", kind: "sub_agents.delegation_end" },
    }
    expect(lifecycleEventKey(event)).toBe(lifecycleEventKey(completed))
    expect(
      hasPersistentLifecycleWork({ lifecycle_events: [event, completed] })
    ).toBe(false)
    expect(
      lifecycleEventKey({
        name: "buddy.subagent",
        value: { agent_name: "research" },
      })
    ).toBe("buddy.subagent:research")
  })

  it("merges the newest state without an earlier outcome masking its terminal status", () => {
    const first: RichEvent = {
      name: "buddy.subagent",
      value: { task_id: "task", outcome: "running", agent_name: "research" },
    }
    const terminal: RichEvent = {
      name: "buddy.subagent",
      value: { task_id: "task", status: "failed", output: "Could not finish" },
    }
    const events = latestLifecycleEvents([first, terminal])
    expect(events).toHaveLength(1)
    expect(events[0]?.value).toEqual({
      task_id: "task",
      agent_name: "research",
      status: "failed",
      output: "Could not finish",
    })
    expect(lifecycleStatus(events[0]!)).toBe("failed")
    expect(mergeRichEvent([first], terminal)).toEqual(events)
  })

  it("merges resource status across activity kind changes without losing its URL", () => {
    const started: RichEvent = {
      name: "buddy.activity",
      value: {
        tool_call_id: "serve",
        kind: "preview.started",
        status: "running",
        url: "http://localhost:3000",
      },
    }
    const events = mergeRichEvent([started], {
      name: "buddy.activity",
      value: {
        tool_call_id: "serve",
        kind: "preview.finished",
        state: "stopped",
      },
    })
    expect(events).toHaveLength(1)
    expect(events[0]?.value.url).toBe("http://localhost:3000")
    expect(isPersistentLifecycleEvent(events[0]!)).toBe(false)
  })
})
