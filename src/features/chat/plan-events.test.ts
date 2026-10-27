import { expect, it } from "vitest"
import {
  planAwaitingExecution,
  planFromEvents,
  planProposalBody,
  proposalFromEvents,
} from "./plan-events"
import {
  mergeRichEvent,
  hasPersistentLifecycleWork,
  isPersistentToolResult,
} from "./rich-events"
import type { PlanItem } from "@/api/chat-interactions"

it("applies local plan snapshots and cloud deltas in arrival order", () => {
  const first = { id: "a", content: "Inspect", status: "pending" }
  let events = [{ name: "buddy.planning", value: { items: [first] } }]
  events = mergeRichEvent(events, {
    name: "buddy.planning",
    value: {
      kind: "planning.updated",
      item: { ...first, status: "completed" },
    },
  }) as typeof events
  expect(planFromEvents(events)[0]?.status).toBe("completed")
  events = mergeRichEvent(events, {
    name: "buddy.planning",
    value: { items: [] },
  }) as typeof events
  expect(planFromEvents(events)).toEqual([])
})
it("retains question details when a resolved event contains only answers", () => {
  const events = mergeRichEvent(
    [
      {
        name: "buddy.user_input",
        value: { request_id: "r", status: "pending", questions: ["q"] },
      },
    ],
    {
      name: "buddy.user_input",
      value: { request_id: "r", status: "answered", answers: { q: "a" } },
    }
  )
  expect(events[0]?.value).toMatchObject({
    status: "answered",
    questions: ["q"],
    answers: { q: "a" },
  })
})
it("extracts the latest markdown proposal", () => {
  expect(
    proposalFromEvents([
      { name: "buddy.planning", value: { proposal: "# Plan", title: "Plan" } },
    ])
  ).toEqual({ markdown: "# Plan", title: "Plan" })
})
it("only offers plan execution while no step has started", () => {
  const item = (status: PlanItem["status"]) => ({
    id: "a",
    content: "Task",
    status,
  })
  expect(planAwaitingExecution([])).toBe(true)
  expect(planAwaitingExecution([item("pending"), item("pending")])).toBe(true)
  expect(planAwaitingExecution([item("completed"), item("pending")])).toBe(
    false
  )
  expect(planAwaitingExecution([item("in_progress")])).toBe(false)
})
it("drops the duplicated heading from the plan proposal body", () => {
  expect(planProposalBody("# 发布流程\n\n先跑检查再打包")).toBe(
    "先跑检查再打包"
  )
  expect(planProposalBody("先跑检查再打包")).toBe("先跑检查再打包")
  expect(planProposalBody("")).toBe("")
})
it("removes deleted plan items when the event carries only an id", () => {
  expect(
    planFromEvents([
      {
        name: "buddy.planning",
        value: { items: [{ id: "a", content: "Task", status: "pending" }] },
      },
      {
        name: "buddy.planning",
        value: { kind: "planning.deleted", item: { id: "a" } },
      },
    ])
  ).toEqual([])
})
it("keeps only explicitly persistent resources outside completed work", () => {
  expect(
    isPersistentToolResult({ url: "https://example.com", status: "running" })
  ).toBe(true)
  expect(isPersistentToolResult({ url: "https://example.com" })).toBe(false)
  expect(
    isPersistentToolResult({ url: "javascript:alert(1)", persistent: true })
  ).toBe(false)
  expect(
    isPersistentToolResult({
      url: "https://example.com",
      persistent: true,
      status: "stopped",
    })
  ).toBe(false)
  expect(
    hasPersistentLifecycleWork({
      lifecycle_events: [
        { name: "buddy.activity", value: { id: "a", persistent: true } },
      ],
    })
  ).toBe(true)
  expect(
    hasPersistentLifecycleWork({
      lifecycle_events: [
        { name: "buddy.subagent", value: { task_id: "a", status: "running" } },
        {
          name: "buddy.subagent",
          value: { task_id: "a", status: "completed" },
        },
      ],
    })
  ).toBe(false)
})
