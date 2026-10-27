import { describe, expect, it } from "vitest"
import type { ThreadMessage, ToolCallMessagePart } from "@/features/chat/thread-types"
import { collectPendingToolApprovals } from "./pending-tool-approvals"

const tool = (id: string, extra: Partial<ToolCallMessagePart> = {}) =>
  ({
    type: "tool-call" as const,
    toolCallId: id,
    toolName: "write_file",
    args: {},
    argsText: "{}",
    interrupt: {
      type: "human",
      payload: { approvalRequestId: `request-${id}` },
    },
    ...extra,
  }) as ToolCallMessagePart

const message = (id: string, content: ToolCallMessagePart[]) =>
  ({
    id,
    role: "assistant",
    content,
    metadata: { custom: {} },
  }) as unknown as ThreadMessage

describe("composer pending tool approvals", () => {
  it("keeps pending approvals in document order and advances after resolution", () => {
    const first = message("a1", [tool("t1")])
    const second = message("a2", [tool("t2")])
    expect(
      collectPendingToolApprovals([first, second]).map(
        (item) => item.part.toolCallId
      )
    ).toEqual(["t1", "t2"])
    expect(
      collectPendingToolApprovals([
        message("a1", [tool("t1", { interrupt: undefined })]),
        second,
      ])[0].part.toolCallId
    ).toBe("t2")
  })

  it("ignores ordinary tools, resolved approvals, terminal calls and superseded attempts", () => {
    const superseded = message("old", [tool("old")])
    superseded.metadata!.custom!.attempt = { status: "superseded" }
    const resolved = tool("resolved", {
      approval: { id: "a", approved: false },
    })
    const terminal = (
      ["complete", "error", "stopped", "declined"] as const
    ).map((status) =>
      tool(status, { providerMetadata: { buddy: { status } } })
    )
    expect(
      collectPendingToolApprovals([
        superseded,
        message("a", [
          tool("ordinary", { interrupt: undefined }),
          resolved,
          ...terminal,
        ]),
      ])
    ).toEqual([])
  })

  it("remounts the response state when the same call receives a new request", () => {
    const first = collectPendingToolApprovals([message("a", [tool("t")])])[0]
    const next = collectPendingToolApprovals([
      message("a", [
        tool("t", {
          interrupt: {
            type: "human",
            payload: { approvalRequestId: "new-request" },
          },
        }),
      ]),
    ])[0]
    expect(next.key).not.toBe(first.key)
  })
})
