import { describe, expect, it } from "vitest"

import { skillsToSkillMentions } from "@/features/chat/skill-slash-commands"

describe("skillsToSkillMentions", () => {
  it("maps skills to skill directive mentions", () => {
    expect(
      skillsToSkillMentions([
        { id: 17, name: "摘要", description: "压缩长文", version: "0.1.0" },
        { id: 8, name: "翻译", description: null, version: "0.1.0" },
      ])
    ).toEqual([
      {
        id: "17",
        type: "skill",
        label: "摘要",
        description: "压缩长文",
        icon: "skill",
      },
      {
        id: "8",
        type: "skill",
        label: "翻译",
        description: undefined,
        icon: "skill",
      },
    ])
  })
})
