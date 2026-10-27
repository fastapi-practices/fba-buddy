import { describe, expect, it } from "vitest"

import {
  applyApprovalChoice,
  autoApprovalsFromAllowlist,
  markToolsResolved,
  pendingApprovalTools,
} from "@/features/chat/tool-approvals"
import type { ChatMessage } from "@/lib/types"

describe("applyApprovalChoice", () => {
  const pending = [
    { id: "call-1", name: "bash" },
    { id: "call-2", name: "bash" },
    { id: "call-3", name: "write" },
  ]

  it("approves only this call when allowing once", () => {
    expect(
      applyApprovalChoice({
        draft: {},
        pending,
        toolCallId: "call-1",
        approved: true,
        always: false,
        allowedTools: [],
      })
    ).toEqual({
      draft: { "call-1": true },
      allowedTools: [],
    })
  })

  it("remembers the tool and approves other pending calls with the same name", () => {
    expect(
      applyApprovalChoice({
        draft: {},
        pending,
        toolCallId: "call-1",
        approved: true,
        always: true,
        allowedTools: [],
      })
    ).toEqual({
      draft: { "call-1": true, "call-2": true },
      allowedTools: ["bash"],
    })
  })

  it("does not remember a denied tool", () => {
    expect(
      applyApprovalChoice({
        draft: {},
        pending,
        toolCallId: "call-1",
        approved: false,
        always: true,
        allowedTools: [],
      }).allowedTools
    ).toEqual([])
  })
})

describe("autoApprovalsFromAllowlist", () => {
  it("approves remembered tools and leaves the rest pending", () => {
    expect(
      autoApprovalsFromAllowlist(
        [
          { id: "call-1", name: "bash" },
          { id: "call-2", name: "write" },
        ],
        ["bash"]
      )
    ).toEqual({ "call-1": true })
  })
})

describe("derived approval state", () => {
  const messages: ChatMessage[] = [
    {
      id: "a1",
      role: "assistant",
      content: "",
      status: "awaiting-approval",
      tools: [
        { id: "t1", name: "read", args: "{}", pendingApproval: true },
        { id: "t2", name: "write", args: "{}", pendingApproval: true },
      ],
    },
  ]

  it("hides only remembered approvals without changing source messages", () => {
    const auto = autoApprovalsFromAllowlist(pendingApprovalTools(messages), [
      "read",
    ])
    const visible = markToolsResolved(messages, auto)
    expect(pendingApprovalTools(visible).map((tool) => tool.id)).toEqual(["t2"])
    expect(pendingApprovalTools(messages).map((tool) => tool.id)).toEqual([
      "t1",
      "t2",
    ])
    expect(visible[0].status).toBe("awaiting-approval")
  })

  it("keeps automatic approvals when the remaining tool is rejected", () => {
    const pending = pendingApprovalTools(messages)
    const auto = autoApprovalsFromAllowlist(pending, ["read"])
    const { draft } = applyApprovalChoice({
      draft: auto,
      pending,
      toolCallId: "t2",
      approved: false,
      always: false,
      allowedTools: ["read"],
    })
    expect(draft).toEqual({ t1: true, t2: false })
    expect(pendingApprovalTools(markToolsResolved(messages, draft))).toEqual([])
  })

  it("uses real tool state after approval and clears the request marker", () => {
    const next = markToolsResolved(
      [
        {
          id: "a1",
          role: "assistant",
          content: "",
          status: "awaiting-approval",
          tools: [
            {
              id: "running",
              name: "read",
              args: "{}",
              pendingApproval: true,
              approvalRequestId: "approval-1",
            },
            {
              id: "complete",
              name: "write",
              args: "{}",
              result: "ok",
              pendingApproval: true,
              approvalRequestId: "approval-2",
            },
          ],
        },
      ],
      { running: true, complete: true }
    )

    expect(next[0].status).toBe("streaming")
    expect(next[0].tools).toEqual([
      expect.objectContaining({
        id: "running",
        pendingApproval: false,
        approvalRequestId: undefined,
        status: "running",
      }),
      expect.objectContaining({
        id: "complete",
        pendingApproval: false,
        approvalRequestId: undefined,
        status: "complete",
      }),
    ])
  })
})

describe("pendingApprovalTools", () => {
  it("collects tools waiting on HITL", () => {
    const messages: ChatMessage[] = [
      {
        id: "a1",
        role: "assistant",
        content: "",
        status: "awaiting-approval",
        tools: [
          { id: "t1", name: "bash", args: "{}", pendingApproval: true },
          { id: "t2", name: "read", args: "{}" },
        ],
      },
    ]
    expect(pendingApprovalTools(messages).map((tool) => tool.id)).toEqual([
      "t1",
    ])
  })
})

it("does not auto approve live coding requests from the deferred allowlist", () => {
  const pending = [{ id: "live", name: "bash", approvalRequestId: "req" }]
  expect(autoApprovalsFromAllowlist(pending, ["bash"])).toEqual({})
  const choice = applyApprovalChoice({
    pending: [{ id: "work", name: "bash" }, ...pending],
    draft: {},
    toolCallId: "work",
    approved: true,
    always: true,
    allowedTools: [],
  })
  expect(choice.draft).toEqual({ work: true })
})
