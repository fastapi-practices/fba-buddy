import { describe, expect, it } from "vitest"

import { parseAgUiEvent, parseRunAgentInput } from "./ag-ui"

describe("AG-UI protocol contracts", () => {
  it("parses native events and rejects malformed frames", () => {
    expect(
      parseAgUiEvent({
        type: "RUN_STARTED",
        threadId: "thread",
        runId: "run",
      })
    ).toEqual({
      type: "RUN_STARTED",
      threadId: "thread",
      runId: "run",
    })
    expect(() =>
      parseAgUiEvent({
        type: "TOOL_CALL_RESULT",
        toolCallId: "call",
        content: "missing messageId",
      })
    ).toThrow()
  })

  it("requires a complete RunAgentInput identity and container fields", () => {
    expect(() =>
      parseRunAgentInput({
        runId: "run",
        messages: [],
        tools: [],
        context: [],
        state: {},
        forwardedProps: {},
      })
    ).toThrow()
    expect(
      parseRunAgentInput({
        threadId: "thread",
        runId: "run",
        messages: [],
        tools: [],
        context: [],
        state: {},
        forwardedProps: {},
      })
    ).toMatchObject({ threadId: "thread", runId: "run" })
  })
})
