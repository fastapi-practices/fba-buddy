import { describe, expect, it } from "vitest"

import { insertQuickPhrase } from "@/features/chat/quick-phrase"
import { useComposerStore } from "@/features/chat/composer-store"

describe("insertQuickPhrase", () => {
  it("writes phrase text into an empty draft", () => {
    expect(insertQuickPhrase("", "帮我总结这段")).toBe("帮我总结这段")
  })

  it("appends phrase text onto an existing draft", () => {
    expect(insertQuickPhrase("已有内容  ", "再补充一点")).toBe(
      "已有内容\n再补充一点"
    )
  })

  it("is the helper used by the composer store insert path", () => {
    useComposerStore.setState({ draft: "开头" })
    useComposerStore.getState().insertPhrase("快捷句")
    expect(useComposerStore.getState().draft).toBe(
      insertQuickPhrase("开头", "快捷句")
    )
    expect(useComposerStore.getState().draft).toContain("快捷句")
  })
})
