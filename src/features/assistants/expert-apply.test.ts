import { describe, expect, it } from "vitest"

import {
  composerPatchFromExpert,
  expertOpening,
  expertOpenings,
  filterExperts,
  parseExpertEditorInput,
} from "@/features/assistants/expert-apply"
import type { ExpertItem } from "@/lib/types"

describe("expertOpenings", () => {
  it("keeps trimmed non-empty starters", () => {
    expect(expertOpenings({ starters: ["", " 帮我写周报 ", "开始"] })).toEqual([
      "帮我写周报",
      "开始",
    ])
    expect(expertOpenings({ starters: [] })).toEqual([])
  })
})

describe("expertOpening", () => {
  it("uses the first non-empty starter", () => {
    expect(expertOpening({ starters: ["", " 帮我写周报 "] })).toBe("帮我写周报")
    expect(expertOpening({ starters: [] })).toBe("")
  })
})

describe("filterExperts", () => {
  it("filters by name, description, prompt, or starter", () => {
    const items: ExpertItem[] = [
      {
        id: 1,
        name: "写作专家",
        prompt: "改写",
        description: "润色文案",
        starters: ["帮我写周报"],
        mcp_ids: [],
        skill_ids: [],
        knowledge_ids: [],
        sort: 1,
        usage_count: 12,
      },
      {
        id: 2,
        name: "翻译专家",
        prompt: "英译中",
        description: null,
        starters: [],
        mcp_ids: [],
        skill_ids: [],
        knowledge_ids: [],
        sort: 2,
        usage_count: 0,
      },
    ]
    expect(filterExperts(items, "周报").map((item) => item.id)).toEqual([1])
    expect(filterExperts(items, "翻译").map((item) => item.id)).toEqual([2])
    expect(filterExperts(items, "").map((item) => item.id)).toEqual([1, 2])
  })
})

describe("parseExpertEditorInput", () => {
  it("requires a trimmed name and prompt", () => {
    const result = parseExpertEditorInput({
      name: " ",
      prompt: "",
      description: "简介",
      starters: ["你好"],
      mcp_ids: [1],
      skill_ids: [],
      knowledge_ids: [],
    })
    expect(result.ok).toBe(false)
    if (result.ok) {
      return
    }
    expect(result.errors).toEqual({
      name: "common.nameIsRequired",
      prompt: "validation.promptRequired",
    })
  })

  it("builds the write body from the editor fields", () => {
    expect(
      parseExpertEditorInput({
        name: " 写作 ",
        prompt: " 帮我写 ",
        description: " 描述 ",
        starters: ["你好", "", "请开始"],
        mcp_ids: [2],
        skill_ids: [3],
        knowledge_ids: [4],
        sort: 2,
      })
    ).toEqual({
      ok: true,
      body: {
        name: "写作",
        prompt: "帮我写",
        description: "描述",
        starters: ["你好", "请开始"],
        mcp_ids: [2],
        skill_ids: [3],
        knowledge_ids: [4],
        sort: 2,
      },
    })
  })
})

describe("composerPatchFromExpert", () => {
  it("keeps MCP ids for this turn instead of locking them on the assistant", () => {
    expect(
      composerPatchFromExpert({
        assistant_id: 9,
        mcp_ids: [3, 5],
        skill_ids: [8],
        knowledge_ids: [2],
        starters: ["开始"],
      })
    ).toEqual({
      assistantId: 9,
      mcpIds: [3, 5],
      opening: "开始",
    })
  })
})
