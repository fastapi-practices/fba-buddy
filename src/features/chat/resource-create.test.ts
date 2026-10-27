import { describe, expect, it } from "vitest"

import {
  findBuiltinResourceSkill,
  resourceCreateDraft,
} from "@/features/chat/resource-create"
import type { WorkspaceSkillItem } from "@/lib/types"

const skill: WorkspaceSkillItem = {
  id: 42,
  name: "create-assistant",
  description: null,
  version: "1.2.0",
  user_id: 0,
}

describe("resource create", () => {
  it("matches only the corresponding system skill", () => {
    expect(
      findBuiltinResourceSkill(
        [
          skill,
          { ...skill, id: 43, name: "create-expert" },
          { ...skill, id: 44, user_id: 7 },
        ],
        "assistant"
      )
    ).toBe(skill)
  })

  it("renders the skill through the shared directive format in the draft", () => {
    expect(resourceCreateDraft(skill, " 创建周报助手 ")).toBe(
      ":skill[create-assistant]{name=42} 创建周报助手"
    )
  })
})
