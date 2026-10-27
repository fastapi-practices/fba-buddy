import { describe, expect, it } from "vitest"

import { parsePhraseEditorInput } from "@/features/workspace/phrase"

describe("parsePhraseEditorInput", () => {
  it("requires a trimmed title and content", () => {
    const result = parsePhraseEditorInput({ title: "  ", content: "" })
    expect(result.ok).toBe(false)
    if (result.ok) {
      return
    }
    expect(result.errors).toEqual({
      title: "common.titleIsRequired",
      content: "common.contentIsRequired",
    })
  })

  it("builds the write body", () => {
    expect(
      parsePhraseEditorInput({
        title: " 周报 ",
        content: " 帮我写周报 ",
      })
    ).toEqual({
      ok: true,
      body: {
        title: "周报",
        content: "帮我写周报",
      },
    })
  })
})
