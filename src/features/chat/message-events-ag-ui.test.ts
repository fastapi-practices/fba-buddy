import { describe, expect, it } from "vitest"

import {
  applyAgUiEvent,
  latestAgentState,
  snapshotToChatMessages,
} from "./message-events"
import { parseAgUiEvent } from "@/api/ag-ui"
import { toThreadMessage } from "./thread-message"
import { artifactCardsFromMessages } from "./artifact-cards"
import type { ChatMessage } from "@/lib/types"
import { toChatCompletionBody } from "@/api/chat-body"

const replay = (events: Record<string, unknown>[]) =>
  events.reduce(
    (messages, event) => applyAgUiEvent(messages, parseAgUiEvent(event), 1000),
    [] as ChatMessage[]
  )

describe("official AG-UI event projection", () => {
  it("restores activity ownership and state before applying later deltas and sending the next request", () => {
    const history = snapshotToChatMessages([
      {
        id: "first",
        role: "assistant",
        content: "one",
        turnContext: { agent_state: { count: 1 } },
      },
      {
        id: "activity",
        role: "activity",
        activityType: "review",
        content: { title: "Original" },
      },
      { id: "last", role: "assistant", content: "two" },
    ])
    const changed = applyAgUiEvent(
      history,
      parseAgUiEvent({
        type: "ACTIVITY_DELTA",
        messageId: "activity",
        activityType: "review",
        patch: [{ op: "replace", path: "/title", value: "Updated" }],
      })
    )
    expect(changed[0]?.agUiActivities?.[0]?.content).toEqual({
      title: "Updated",
    })
    expect(changed[0]?.turnContext?.lifecycle_events?.[0]?.value.title).toBe(
      "Updated"
    )
    expect(changed[1]?.turnContext?.lifecycle_events).toBeUndefined()
    const state = applyAgUiEvent(
      changed,
      parseAgUiEvent({
        type: "STATE_DELTA",
        subagentRunId: "child",
        delta: [{ op: "replace", path: "/count", value: 2 }],
      })
    )
    const request = toChatCompletionBody({
      conversation_id: "thread",
      messages: [],
      state: latestAgentState(state),
      forwarded_props: { provider_id: 1, model_id: "test" },
    })
    expect(request.state).toEqual({ count: 2 })
    expect(() =>
      applyAgUiEvent(changed, {
        type: "ACTIVITY_DELTA",
        messageId: "activity",
        activityType: "review",
        patch: [{ op: "replace", path: "", value: [] }],
      })
    ).toThrow()
  })

  it("keeps chunk owners when text, tools and reasoning IDs switch", () => {
    const messages = replay([
      { type: "RUN_STARTED", threadId: "thread", runId: "run" },
      { type: "TEXT_MESSAGE_CHUNK", messageId: "one", delta: "A" },
      { type: "TEXT_MESSAGE_CHUNK", messageId: "two", delta: "B" },
      { type: "TEXT_MESSAGE_CHUNK", messageId: "one", delta: "C" },
      { type: "TEXT_MESSAGE_CHUNK", delta: "D" },
      {
        type: "TOOL_CALL_START",
        parentMessageId: "one",
        toolCallId: "a",
        toolCallName: "read",
      },
      { type: "TOOL_CALL_CHUNK", delta: '{"a":1}' },
      { type: "TOOL_CALL_END", toolCallId: "a" },
      {
        type: "TOOL_CALL_START",
        parentMessageId: "two",
        toolCallId: "b",
        toolCallName: "read",
      },
      { type: "TOOL_CALL_CHUNK", delta: '{"b":2}' },
      { type: "REASONING_MESSAGE_CHUNK", messageId: "r1", delta: "first" },
      { type: "REASONING_MESSAGE_CHUNK", messageId: "r2", delta: "second" },
      { type: "REASONING_MESSAGE_CHUNK", messageId: "r1", delta: " again" },
      { type: "REASONING_MESSAGE_END", messageId: "r1" },
      { type: "RUN_ERROR", message: "Failed" },
    ])
    expect(messages).toHaveLength(2)
    expect(messages[0]).toMatchObject({
      id: "one",
      content: "ACD",
      tools: [{ args: '{"a":1}', status: "error" }],
    })
    expect(messages[1]?.tools?.[0]?.args).toBe('{"b":2}')
    expect(
      messages[1]?.parts?.filter((part) => part.type === "reasoning")
    ).toMatchObject([
      { messageId: "r1", text: "first again", timing: { completedAt: 1000 } },
      { messageId: "r2", text: "second", timing: { completedAt: 1000 } },
    ])
    expect(
      messages.every(
        (message) =>
          !message.agUiActiveTextId &&
          !message.agUiActiveToolId &&
          !message.agUiActiveReasoningId
      )
    ).toBe(true)
  })

  it("keeps tool chunks, steps, subagents, state, activity and raw events", () => {
    const messages = replay([
      { type: "RUN_STARTED", threadId: "thread", runId: "run" },
      {
        type: "TEXT_MESSAGE_START",
        messageId: "assistant",
        role: "assistant",
      },
      {
        type: "TOOL_CALL_CHUNK",
        toolCallId: "call",
        toolCallName: "write",
        delta: '{"path":"a.ts"}',
      },
      { type: "TOOL_CALL_END", toolCallId: "call" },
      { type: "STEP_STARTED", stepName: "inspect" },
      { type: "STEP_FINISHED", stepName: "inspect" },
      {
        type: "SUBAGENT_STARTED",
        subagentRunId: "subagent",
        name: "reviewer",
        parentToolCallId: "call",
      },
      {
        type: "SUBAGENT_FINISHED",
        subagentRunId: "subagent",
        result: "done",
      },
      { type: "STATE_SNAPSHOT", snapshot: { plan: ["inspect"] } },
      {
        type: "STATE_DELTA",
        delta: [{ op: "replace", path: "/plan/0", value: "review" }],
      },
      {
        type: "ACTIVITY_SNAPSHOT",
        messageId: "activity",
        activityType: "review",
        content: { title: "Review", status: "queued" },
      },
      {
        type: "ACTIVITY_DELTA",
        messageId: "activity",
        activityType: "review",
        patch: [{ op: "add", path: "/status", value: "running" }],
      },
      { type: "RAW", event: { provider: "test", payload: 1 } },
      {
        type: "RUN_FINISHED",
        threadId: "thread",
        runId: "run",
        outcome: { type: "success" },
      },
    ])

    const assistant = messages.find((message) => message.id === "assistant")
    expect(assistant?.tools?.[0]).toMatchObject({
      id: "call",
      name: "write",
      args: '{"path":"a.ts"}',
      argsComplete: true,
    })
    expect(assistant?.turnContext?.agent_state).toEqual({ plan: ["review"] })
    expect(assistant?.turnContext?.agent_state_delta).toEqual([
      [{ op: "replace", path: "/plan/0", value: "review" }],
    ])
    expect(assistant?.turnContext?.raw_events).toEqual([
      { provider: "test", payload: 1 },
    ])

    const lifecycle = assistant?.turnContext?.lifecycle_events ?? []
    expect(lifecycle).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "buddy.activity",
          value: expect.objectContaining({
            id: "inspect",
            status: "completed",
          }),
        }),
        expect.objectContaining({
          name: "buddy.subagent",
          value: expect.objectContaining({
            task_id: "subagent",
            status: "completed",
          }),
        }),
        expect.objectContaining({
          name: "buddy.activity",
          value: expect.objectContaining({
            id: "activity",
            activityType: "review",
          }),
        }),
      ])
    )
  })

  it("applies activity patches atomically, respects replace=false and removes deleted fields", () => {
    const start = [
      { type: "RUN_STARTED", threadId: "thread", runId: "run" },
      {
        type: "ACTIVITY_SNAPSHOT",
        messageId: "activity",
        activityType: "review",
        content: { title: "Review", obsolete: true, items: ["a"] },
      },
    ]
    const initial = replay(start)
    const ignored = applyAgUiEvent(
      initial,
      parseAgUiEvent({
        type: "ACTIVITY_SNAPSHOT",
        messageId: "activity",
        activityType: "review",
        replace: false,
        content: { title: "Ignore" },
      })
    )
    expect(ignored).toBe(initial)
    const patched = applyAgUiEvent(
      initial,
      parseAgUiEvent({
        type: "ACTIVITY_DELTA",
        messageId: "activity",
        activityType: "review",
        patch: [
          { op: "remove", path: "/obsolete" },
          { op: "add", path: "/items/-", value: "b" },
          { op: "replace", path: "/title", value: "Done" },
        ],
      })
    )
    expect(patched[0]?.agUiActivities?.[0]?.content).toEqual({
      title: "Done",
      items: ["a", "b"],
    })
    expect(initial[0]?.agUiActivities?.[0]?.content).toHaveProperty(
      "obsolete",
      true
    )
    expect(
      patched[0]?.turnContext?.lifecycle_events?.[0]?.value
    ).not.toHaveProperty("obsolete")
    expect(() =>
      applyAgUiEvent(patched, {
        type: "STATE_DELTA",
        delta: [{ op: "remove", path: "/missing" }],
      })
    ).toThrow()
  })

  it("isolates interleaved subagent output and tools from the main answer", () => {
    const messages = replay([
      { type: "RUN_STARTED", threadId: "thread", runId: "run" },
      { type: "TEXT_MESSAGE_START", messageId: "main", role: "assistant" },
      {
        type: "SUBAGENT_STARTED",
        subagentRunId: "child",
        name: "reviewer",
        parentMessageId: "main",
      },
      {
        type: "TEXT_MESSAGE_CHUNK",
        subagentRunId: "child",
        messageId: "child-text",
        delta: "private report",
      },
      {
        type: "TOOL_CALL_CHUNK",
        subagentRunId: "child",
        toolCallId: "child-tool",
        toolCallName: "read",
        delta: "{}",
      },
      {
        type: "TOOL_CALL_END",
        subagentRunId: "child",
        toolCallId: "child-tool",
      },
      {
        type: "TOOL_CALL_RESULT",
        subagentRunId: "child",
        toolCallId: "child-tool",
        messageId: "child-result",
        content: "file",
        role: "tool",
      },
      {
        type: "TEXT_MESSAGE_CONTENT",
        messageId: "main",
        delta: "public answer",
      },
      {
        type: "SUBAGENT_FINISHED",
        subagentRunId: "child",
        result: "review done",
      },
    ])
    expect(messages).toHaveLength(1)
    expect(messages[0]?.content).toBe("public answer")
    expect(messages[0]?.tools).toBeUndefined()
    expect(messages[0]?.agUiSubagents?.child?.[0]?.content).toBe(
      "private report"
    )
    expect(messages[0]?.turnContext?.lifecycle_events).toContainEqual(
      expect.objectContaining({
        name: "buddy.subagent",
        value: expect.objectContaining({
          task_id: "child",
          output: "review done",
          tool_calls: [
            expect.objectContaining({ id: "child-tool", output: "file" }),
          ],
        }),
      })
    )
  })

  it("updates Artifact cards from partial arguments", () => {
    const messages = replay([
      { type: "RUN_STARTED", threadId: "thread", runId: "run" },
      {
        type: "TOOL_CALL_CHUNK",
        toolCallId: "artifact",
        toolCallName: "write_artifact",
        delta: '{"title":"Report","content":"Hello',
      },
    ])
    const project = (message: ChatMessage) => {
      const converted = toThreadMessage(message)
      return {
        role: converted.role,
        content: typeof converted.content === "string" ? [] : converted.content,
      }
    }
    const projected = messages.map(project)
    expect(artifactCardsFromMessages(projected)).toMatchObject([
      { title: "Report", generating: true, words: 1 },
    ])
  })
})
