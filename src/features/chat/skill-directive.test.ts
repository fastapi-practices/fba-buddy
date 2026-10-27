import { describe, expect, it } from "vitest"
import { parseDirectiveText } from "@/features/chat/directive-formatter"

describe("skill Directive text in user messages", () => {
  it("parses composer Directive text into a skill chip plus remaining text", () => {
    const segments = parseDirectiveText(
      ":skill[摘要]{name=17} 帮我写"
    )
    expect(segments).toEqual(
      expect.arrayContaining([
        {
          kind: "mention",
          type: "skill",
          id: "17",
          label: "摘要",
        },
      ])
    )
    expect(
      segments.some(
        (segment) => segment.kind === "text" && segment.text.includes("帮我写")
      )
    ).toBe(true)
  })
})
