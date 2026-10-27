import { beforeEach, describe, expect, it, vi } from "vitest"
import { useAccountSourceStore } from "@/lib/account-source"
import {
  parseTranscriptView,
  quoteAnchor,
  transcriptViewKey,
} from "./transcript-state"

const config = vi.hoisted(() => ({ api: "https://first.example/api/v1" }))
vi.mock("@/lib/config", () => ({
  get API_V1() {
    return config.api
  },
}))

describe("conversation view state", () => {
  beforeEach(() => {
    config.api = "https://first.example/api/v1"
    useAccountSourceStore.setState({ account: "11", epoch: 0 })
  })
  it("separates conversation IDs without colliding escaped separators", () => {
    expect(transcriptViewKey("a/b")).not.toBe(transcriptViewKey("a%2Fb"))
  })
  it("scopes view state by backend and account, while surviving reinitialization", () => {
    const firstKey = transcriptViewKey("same-conversation")
    useAccountSourceStore.setState({ epoch: 1 })
    expect(transcriptViewKey("same-conversation")).toBe(firstKey)
    useAccountSourceStore.setState({ account: "22" })
    expect(transcriptViewKey("same-conversation")).not.toBe(firstKey)
    useAccountSourceStore.setState({ account: "11" })
    config.api = "https://second.example/api/v1"
    expect(transcriptViewKey("same-conversation")).not.toBe(firstKey)
  })
  it("restores explicit collapsed state and ignores obsolete reading positions", () => {
    expect(
      parseTranscriptView(
        '{"expanded":{"a":false,"b":true,"c":"false"},"position":{"turnId":"u7","offset":18,"atBottom":false}}'
      )
    ).toEqual({
      expanded: { a: false, b: true },
    })
    expect(parseTranscriptView('{"position":{"turnId":"a"}}')).toEqual({
      expanded: {},
    })
    expect(parseTranscriptView("invalid json")).toEqual({ expanded: {} })
  })
})

describe("quote anchors", () => {
  it("keeps cross-conversation sources while ignoring invalid selectors", () => {
    expect(
      quoteAnchor({
        messageId: "message",
        text: "excerpt",
        conversationId: "source",
        occurrence: 2,
      })
    ).toEqual({
      messageId: "message",
      text: "excerpt",
      conversationId: "source",
      occurrence: 2,
    })
    expect(
      quoteAnchor({ messageId: "message", text: "excerpt", occurrence: -1 })
    ).toEqual({ messageId: "message", text: "excerpt" })
    expect(quoteAnchor({ text: "orphan" })).toBeUndefined()
  })
})
