import { expect, it } from "vitest"

import {
  collectInputRequests,
  hasPendingInputRequest,
  mergeInputRequestLists,
  messageInputRequests,
  normalizeInputRequest,
  pendingInputRequests,
} from "./input-requests"

const question = {
  id: "scope",
  prompt: "检查范围",
  kind: "single" as const,
  options: [{ id: "all", label: "全部" }],
  required: true,
}

const request = {
  request_id: "req-1",
  kind: "questions" as const,
  status: "pending" as const,
  title: "需要确认",
  questions: [question],
  tool_call_id: "call-1",
}

const assistant = (
  id: string,
  events: { name: string; value: Record<string, unknown> }[]
) => ({
  id,
  metadata: {
    custom: {
      turnContext: { lifecycle_events: events },
    },
  },
})

it("reads the structured input request carried by a message", () => {
  const [found] = messageInputRequests(
    assistant("m1", [{ name: "buddy.user_input", value: request }])
  )
  expect(found?.request_id).toBe("req-1")
  expect(found?.status).toBe("pending")
  expect(found?.questions[0]?.prompt).toBe("检查范围")
})

it("keeps a resolved request resolved when a pending event arrives later", () => {
  const [found] = messageInputRequests(
    assistant("m1", [
      { name: "buddy.user_input", value: { ...request, status: "answered" } },
      { name: "buddy.user_input", value: request },
    ])
  )
  expect(found?.status).toBe("answered")
})

it("ignores events without a request id", () => {
  expect(
    messageInputRequests(
      assistant("m1", [{ name: "buddy.user_input", value: { title: "x" } }])
    )
  ).toEqual([])
})

it("anchors every request to the message that asked the question", () => {
  const anchors = collectInputRequests([
    assistant("m1", [{ name: "buddy.user_input", value: request }]),
    assistant("m2", []),
  ])
  expect(anchors).toHaveLength(1)
  expect(anchors[0]?.messageId).toBe("m1")
})

it("detects a question that is still waiting for an answer", () => {
  const messages = [
    assistant("m1", [{ name: "buddy.user_input", value: request }]),
  ]
  expect(hasPendingInputRequest(messages)).toBe(true)
  expect(
    hasPendingInputRequest([
      assistant("m1", [
        { name: "buddy.user_input", value: { ...request, status: "answered" } },
      ]),
    ])
  ).toBe(false)
})

it("lists only the requests that still wait for an answer", () => {
  const requests = pendingInputRequests([
    normalizeInputRequest(request)!,
    normalizeInputRequest({ ...request, request_id: "req-2", status: "answered" })!,
  ])
  expect(requests.map((item) => item.request_id)).toEqual(["req-1"])
})

it("keeps the server answer when the body still carries a pending event", () => {
  const merged = mergeInputRequestLists(
    [normalizeInputRequest({ ...request, status: "answered" })!],
    [
      {
        request: normalizeInputRequest(request)!,
        messageId: "m1",
      },
    ]
  )
  expect(merged[0]?.status).toBe("answered")
})

it("lists a request that only the server knows about", () => {
  const merged = mergeInputRequestLists(
    [normalizeInputRequest({ ...request, request_id: "req-9" })!],
    []
  )
  expect(merged.map((item) => item.request_id)).toEqual(["req-9"])
})
