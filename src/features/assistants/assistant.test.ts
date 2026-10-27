import { describe, expect, it } from "vitest"

import {
  ALL_ASSISTANT_CATEGORY,
  assistantCategoryLabel,
  assistantOpening,
  assistantOpenings,
  completionAssistantId,
  composerTextFromAssistantOpening,
  filterAssistants,
  formatUsageCount,
  groupAssistantsByCategory,
  NONE_ASSISTANT_CATEGORY,
  NONE_ASSISTANT_OPTION_ID,
  parseAssistantEditorInput,
  parseAssistantOptionId,
  pickAssistantOpening,
  sortAssistants,
} from "@/features/assistants/assistant"
import type { AssistantItem } from "@/lib/types"

function assistant(
  patch: Partial<AssistantItem> & { id: number }
): AssistantItem {
  return {
    name: `助手 ${patch.id}`,
    description: null,
    category: null,
    sort: 0,
    usage_count: 0,
    ...patch,
  }
}

describe("formatUsageCount", () => {
  it("keeps counts under a thousand as 次使用", () => {
    expect(formatUsageCount(0)).toBe("0 次使用")
    expect(formatUsageCount(128)).toBe("128 次使用")
    expect(formatUsageCount(999)).toBe("999 次使用")
  })

  it("compacts thousands, tens of thousands, and hundreds of millions", () => {
    expect(formatUsageCount(1000)).toBe("1 千次使用")
    expect(formatUsageCount(1300)).toBe("1.3 千次使用")
    expect(formatUsageCount(13_000)).toBe("1.3 万次使用")
    expect(formatUsageCount(130_000_000)).toBe("1.3 亿次使用")
  })

  it("uses K/M/B in English", () => {
    expect(formatUsageCount(128, "en-US")).toBe("128 uses")
    expect(formatUsageCount(1300, "en-US")).toBe("1.3K uses")
    expect(formatUsageCount(1_300_000, "en-US")).toBe("1.3M uses")
  })
})

describe("sortAssistants", () => {
  it("orders by sort then id", () => {
    const items = [
      assistant({ id: 3, sort: 2, name: "c" }),
      assistant({ id: 1, sort: 1, name: "a" }),
      assistant({ id: 2, sort: 1, name: "b" }),
    ]
    expect(sortAssistants(items).map((item) => item.id)).toEqual([1, 2, 3])
  })
})

describe("assistantOpening", () => {
  it("fills the composer from starters and never from prompt", () => {
    const withStarters = assistant({
      id: 1,
      prompt: "系统提示，不要贴进输入框",
      starters: ["你好，我是写作助手"],
    })
    expect(composerTextFromAssistantOpening(withStarters)).toBe(
      "你好，我是写作助手"
    )
    expect(composerTextFromAssistantOpening(withStarters)).not.toContain(
      "系统提示"
    )

    const promptOnly = assistant({
      id: 2,
      prompt: "系统提示，不要贴进输入框",
    })
    expect(assistantOpening(promptOnly)).toBe("")
    expect(composerTextFromAssistantOpening(promptOnly)).toBe("")
  })

  it("picks one starter at random and never uses the system prompt", () => {
    const item = assistant({
      id: 5,
      prompt: "系统提示，不要贴进输入框",
      starters: ["早上好", "开始写吧", "先列提纲"],
    })
    expect(assistantOpenings(item)).toEqual(["早上好", "开始写吧", "先列提纲"])
    expect(pickAssistantOpening(item, () => 0)).toBe("早上好")
    expect(pickAssistantOpening(item, () => 0.99)).toBe("先列提纲")
    expect(composerTextFromAssistantOpening(item, () => 0.5)).toBe("开始写吧")
    expect(composerTextFromAssistantOpening(item, () => 0)).not.toContain(
      "系统提示"
    )
  })
})

describe("groupAssistantsByCategory", () => {
  it("keeps sort order and groups by category", () => {
    const groups = groupAssistantsByCategory([
      assistant({ id: 2, sort: 2, category: "写作", name: "改写" }),
      assistant({ id: 1, sort: 1, category: "写作", name: "起草" }),
      assistant({ id: 3, sort: 3, category: "编程", name: "审查" }),
    ])
    expect(groups.map((group) => group.category)).toEqual(["写作", "编程"])
    expect(groups[0]?.items.map((item) => item.id)).toEqual([1, 2])
  })

  it("orders groups by category metadata and puts uncategorized last", () => {
    const groups = groupAssistantsByCategory(
      [
        assistant({ id: 1, category: "writing", name: "起草" }),
        assistant({ id: 2, category: null, name: "通用" }),
        assistant({ id: 3, category: "efficiency", name: "总结" }),
      ],
      [
        { code: "efficiency", name: "效率办公", sort: 1 },
        { code: "writing", name: "写作创作", sort: 2 },
      ]
    )
    expect(groups.map((group) => group.category)).toEqual([
      "efficiency",
      "writing",
      "",
    ])
  })
})

describe("filterAssistants", () => {
  it("filters by query and category including uncategorized", () => {
    const items = [
      assistant({
        id: 1,
        name: "写作助手",
        category: "writing",
        description: "改写",
      }),
      assistant({ id: 2, name: "翻译助手", category: "translation" }),
      assistant({ id: 3, name: "通用助手", category: null }),
    ]
    expect(
      filterAssistants(items, "写作", ALL_ASSISTANT_CATEGORY).map(
        (item) => item.id
      )
    ).toEqual([1])
    expect(
      filterAssistants(items, "", "writing").map((item) => item.id)
    ).toEqual([1])
    expect(filterAssistants(items, "", "").map((item) => item.id)).toEqual([3])
  })
})

describe("assistantCategoryLabel", () => {
  it("uses catalog names and falls back to uncategorized", () => {
    expect(
      assistantCategoryLabel(
        "writing",
        [{ code: "writing", name: "写作创作", sort: 2 }],
        "未分类"
      )
    ).toBe("写作创作")
    expect(assistantCategoryLabel("", [], "未分类")).toBe("未分类")
  })
})

describe("parseAssistantEditorInput", () => {
  it("requires a trimmed name and prompt", () => {
    const result = parseAssistantEditorInput({
      name: "  ",
      prompt: "",
      description: "简介",
      category: NONE_ASSISTANT_CATEGORY,
      starters: ["你好"],
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
      parseAssistantEditorInput({
        name: " 写作 ",
        prompt: " 帮我写 ",
        description: " 描述 ",
        category: "writing",
        starters: ["你好", "", "请开始"],
        sort: 3,
      })
    ).toEqual({
      ok: true,
      body: {
        name: "写作",
        prompt: "帮我写",
        description: "描述",
        category: "writing",
        starters: ["你好", "请开始"],
        sort: 3,
      },
    })
    expect(
      parseAssistantEditorInput({
        name: "通用",
        prompt: "你好",
        description: "  ",
        category: NONE_ASSISTANT_CATEGORY,
        starters: [],
      })
    ).toEqual({
      ok: true,
      body: {
        name: "通用",
        prompt: "你好",
        description: null,
        category: null,
        starters: [],
        sort: 0,
      },
    })
  })
})

describe("parseAssistantOptionId", () => {
  it("maps the none option and numeric ids", () => {
    expect(parseAssistantOptionId(NONE_ASSISTANT_OPTION_ID)).toBeNull()
    expect(parseAssistantOptionId("12")).toBe(12)
    expect(parseAssistantOptionId("abc")).toBeUndefined()
  })
})

describe("completionAssistantId", () => {
  it("only returns an id for the first request of a new conversation", () => {
    expect(
      completionAssistantId({ isNewConversation: true, assistantId: 12 })
    ).toBe(12)
    expect(
      completionAssistantId({ isNewConversation: false, assistantId: 12 })
    ).toBeUndefined()
    expect(
      completionAssistantId({ isNewConversation: true, assistantId: null })
    ).toBeUndefined()
  })
})
