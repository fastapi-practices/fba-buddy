import { describe, expect, it } from "vitest"

import { planBranch } from "@/features/chat/branch-plan"
import type { ChatMessage } from "@/lib/types"

const conversation: ChatMessage[] = [
  { id: "u1", pk: 1, role: "user", content: "第一问", status: "complete" },
  {
    id: "a1",
    pk: 2,
    role: "assistant",
    content: "第一答",
    status: "complete",
  },
  { id: "u2", pk: 3, role: "user", content: "第二问", status: "complete" },
  {
    id: "a2",
    pk: 4,
    role: "assistant",
    content: "第二答",
    status: "complete",
  },
  { id: "u3", pk: 5, role: "user", content: "第三问", status: "complete" },
  {
    id: "a3",
    pk: 6,
    role: "assistant",
    content: "第三答",
    status: "complete",
  },
]

describe("planBranch", () => {
  it("branches a historical reply from the question right before it", () => {
    const plan = planBranch(conversation, 4, { regenerate: true })
    expect(plan?.boundaryPk).toBe(3)
    expect(plan?.user?.id).toBe("u2")
  })

  it("makes the branched question the last user message of the new branch", () => {
    // 后端重生成只接受最后一条用户消息
    const plan = planBranch(conversation, 4, { regenerate: true })
    const forked = conversation.filter(
      (message) => message.pk !== undefined && message.pk <= plan!.boundaryPk
    )
    const lastUser = forked.filter((message) => message.role === "user").at(-1)
    expect(lastUser?.pk).toBe(plan?.boundaryPk)
  })

  it("branches the current reply from the current question", () => {
    const plan = planBranch(conversation, 6, { regenerate: true })
    expect(plan?.boundaryPk).toBe(5)
  })

  it("forks from the clicked message when it only creates a branch", () => {
    const plan = planBranch(conversation, 4)
    expect(plan?.boundaryPk).toBe(4)
    expect(plan?.user).toBeNull()
  })

  it("forks from the question itself when it edits it", () => {
    const plan = planBranch(conversation, 3, { regenerate: true })
    expect(plan?.boundaryPk).toBe(3)
  })

  it("drops messages that were never persisted", () => {
    expect(planBranch(conversation, 0)).toBeNull()
    expect(
      planBranch([{ id: "draft", role: "user", content: "草稿" }], 1)
    ).toBeNull()
  })

  it("drops a reply without any question before it", () => {
    expect(
      planBranch(
        [{ id: "a1", pk: 2, role: "assistant", content: "答" }],
        2,
        { regenerate: true }
      )
    ).toBeNull()
  })
})
