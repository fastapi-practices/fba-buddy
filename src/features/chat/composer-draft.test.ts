import { describe, expect, it } from "vitest"

import {
  nextComposerDraftEvent,
  stepComposerDraft,
} from "@/features/chat/composer-draft"
import { insertQuickPhrase } from "@/features/chat/quick-phrase"
import { useComposerStore } from "@/features/chat/composer-store"

describe("stepComposerDraft", () => {
  it("insert then stale input pushes the phrase and does not write the old input back", () => {
    useComposerStore.setState({ draft: "已有内容" })
    useComposerStore.getState().insertPhrase("快捷句")
    const storeDraft = useComposerStore.getState().draft
    expect(storeDraft).toBe(insertQuickPhrase("已有内容", "快捷句"))

    const afterStore = stepComposerDraft(
      {
        storeDraft,
        inputValue: "已有内容",
        lastPushed: "已有内容",
        staleInput: null,
      },
      "store"
    )
    expect(afterStore.writeInput).toBe(storeDraft)
    expect(afterStore.lastPushed).toBe(storeDraft)
    expect(afterStore.staleInput).toBe("已有内容")
    expect(afterStore.writeStore).toBeUndefined()

    const afterStaleInput = stepComposerDraft(
      {
        storeDraft: afterStore.storeDraft,
        inputValue: "已有内容",
        lastPushed: afterStore.lastPushed,
        staleInput: afterStore.staleInput,
      },
      "input"
    )
    expect(afterStaleInput.writeStore).toBeUndefined()
    expect(afterStaleInput.storeDraft).toBe(storeDraft)
    expect(afterStaleInput.storeDraft).toContain("快捷句")
  })

  it("type then stale store keeps typed text and does not push the old draft", () => {
    const afterType = stepComposerDraft(
      {
        storeDraft: "旧草稿",
        inputValue: "用户正在输入",
        lastPushed: "旧草稿",
        staleInput: null,
      },
      "input"
    )
    expect(afterType.writeStore).toBe("用户正在输入")
    expect(afterType.storeDraft).toBe("用户正在输入")

    const afterStaleStore = stepComposerDraft(
      {
        storeDraft: "旧草稿",
        inputValue: "用户正在输入",
        lastPushed: "旧草稿",
        staleInput: null,
      },
      "store"
    )
    expect(afterStaleStore.writeInput).toBeUndefined()
    expect(afterStaleStore.inputValue).toBe("用户正在输入")
  })
})

describe("nextComposerDraftEvent", () => {
  it("pushes a store draft into an empty editor on first tick", () => {
    expect(
      nextComposerDraftEvent({
        prevStoreDraft: null,
        prevInputValue: null,
        storeDraft: ":skill[摘要]{name=17}",
        inputValue: "",
      })
    ).toBe("store")
    expect(
      nextComposerDraftEvent({
        prevStoreDraft: null,
        prevInputValue: null,
        storeDraft: "",
        inputValue: "",
      })
    ).toBeNull()
  })

  it("keeps later ticks as store or input changes", () => {
    expect(
      nextComposerDraftEvent({
        prevStoreDraft: "旧",
        prevInputValue: "旧",
        storeDraft: "新草稿",
        inputValue: "旧",
      })
    ).toBe("store")
    expect(
      nextComposerDraftEvent({
        prevStoreDraft: "旧",
        prevInputValue: "旧",
        storeDraft: "旧",
        inputValue: "正在输入",
      })
    ).toBe("input")
  })
})
