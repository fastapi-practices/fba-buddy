import { beforeEach, expect, it } from "vitest"
import { useLiveConversationSearch } from "./live-conversation-search"

beforeEach(() => useLiveConversationSearch.setState({ entries: new Map() }))

it("keeps two panes of the same conversation independent during cleanup", () => {
  const left = Symbol("left"),
    right = Symbol("right")
  const entry = {
    source: "local:device:0",
    conversationId: "chat",
    messages: [],
  }
  const store = useLiveConversationSearch.getState()
  store.update(left, entry)
  store.update(right, entry)
  store.remove(left)
  expect([...useLiveConversationSearch.getState().entries.keys()]).toEqual([
    right,
  ])
  store.remove(left)
  expect(useLiveConversationSearch.getState().entries.get(right)).toBe(entry)
})

it("replaces a pane snapshot and source without retaining the previous contents", () => {
  const owner = Symbol("pane")
  const store = useLiveConversationSearch.getState()
  store.update(owner, {
    source: "cloud:old:0",
    conversationId: "old",
    messages: [],
  })
  const entry = { source: "cloud:new:1", conversationId: "new", messages: [] }
  store.update(owner, entry)
  expect([...useLiveConversationSearch.getState().entries.values()]).toEqual([
    entry,
  ])
  const unchanged = useLiveConversationSearch.getState().entries
  store.update(owner, entry)
  expect(useLiveConversationSearch.getState().entries).toBe(unchanged)
})
