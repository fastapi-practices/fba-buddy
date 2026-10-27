import { describe, expect, it } from "vitest"

import { canEditBranchMessage } from "./message-branch"

describe("canEditBranchMessage", () => {
  it("accepts plain-text user content", () => {
    expect(
      canEditBranchMessage({
        role: "user",
        content: [{ type: "text", text: "问题" }],
      })
    ).toBe(true)
  })

  it("rejects attachments, non-text parts, and blank content", () => {
    expect(
      canEditBranchMessage({
        role: "user",
        content: [{ type: "text", text: "问题" }],
        attachments: [{ id: "att-1" }],
      })
    ).toBe(false)
    expect(
      canEditBranchMessage({
        role: "user",
        content: [{ type: "image" }],
      })
    ).toBe(false)
    expect(
      canEditBranchMessage({
        role: "user",
        content: [{ type: "text", text: "   " }],
      })
    ).toBe(false)
  })

  it("rejects assistant messages", () => {
    expect(
      canEditBranchMessage({
        role: "assistant",
        content: [{ type: "text", text: "回答" }],
      })
    ).toBe(false)
  })
})
