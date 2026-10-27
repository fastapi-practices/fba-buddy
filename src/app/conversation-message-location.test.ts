import { describe, expect, it } from "vitest"
import {
  conversationMessageSearch,
  parseConversationMessageTarget,
} from "./conversation-message-location"

describe("conversation message search navigation", () => {
  it("round trips a message target without changing Unicode or URL punctuation", () => {
    const target = {
      messageId: 42,
      snapshotId: "snapshot/#?中文",
      query: "状态 + 文件 & 进度",
      occurrence: 2,
    }
    expect(
      parseConversationMessageTarget(conversationMessageSearch(target))
    ).toEqual(target)
    expect(conversationMessageSearch()).toBe("")
  })

  it("requires a valid message location rather than treating any query as a jump", () => {
    for (const query of [
      "",
      "?source=local",
      "?searchQuery=hello",
      "?searchMessage=-2",
      "?searchMessage=1.5",
      "?searchMessage=9007199254740992",
    ])
      expect(parseConversationMessageTarget(query)).toBeNull()
  })

  it("supports snapshot-only results and ignores invalid occurrence indexes", () => {
    expect(
      parseConversationMessageTarget(
        "?source=cloud&searchSnapshot=old-message&searchQuery=test&searchOccurrence=-1"
      )
    ).toEqual({
      messageId: undefined,
      snapshotId: "old-message",
      query: "test",
      occurrence: 0,
    })
  })
})
