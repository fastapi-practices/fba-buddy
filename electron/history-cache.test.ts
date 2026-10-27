import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, expect, it } from "vitest"
import type { AccountSource } from "../src/shared/account-source"
import { HistoryCache } from "./history-cache"

const source: AccountSource = {
  backendUrl: "https://one.test/api/v1",
  accountId: "1",
}
const roots: string[] = []
const caches: HistoryCache[] = []
const conversationId = "conversation-1"
const detailPath = `/conversations/${conversationId}`
function root() {
  const value = mkdtempSync(path.join(os.tmpdir(), "buddy-history-cache-"))
  roots.push(value)
  return value
}
function cache(directory = root()) {
  const value = new HistoryCache(directory)
  caches.push(value)
  return value
}
afterEach(() => {
  for (const value of caches.splice(0)) value.close()
  for (const directory of roots.splice(0))
    rmSync(directory, { recursive: true, force: true })
})

it("persists server snapshots and isolates both backend and account", () => {
  const directory = root()
  const first = cache(directory)
  first.request({
    action: "put",
    source,
    path: "/conversations?surface=chat&archived=false",
    value: { items: [{ conversation_id: conversationId }] },
  })
  first.close()
  const reopened = cache(directory)
  const found = reopened.request({
    action: "get",
    source: { ...source, backendUrl: source.backendUrl + "/" },
    path: "/conversations?archived=false&surface=chat",
  })
  expect(found?.value).toEqual({ items: [{ conversation_id: conversationId }] })
  expect(found?.cachedAt).toMatch(/^\d{4}-/)
  for (const other of [
    { ...source, accountId: "2" },
    { ...source, backendUrl: "https://two.test/api/v1" },
    { ...source, backendUrl: "https://one.test/other-api" },
  ])
    expect(
      reopened.request({
        action: "get",
        source: other,
        path: "/conversations?surface=chat&archived=false",
      })
    ).toBeNull()
})

it("invalidates mutations without preventing a fresh server read", () => {
  const storage = cache()
  for (const snapshotPath of [
    detailPath,
    detailPath + "/messages",
    detailPath + "/messages/search?q=needle",
    detailPath + "/plan",
    detailPath + "/messages/2/versions",
    "/conversations",
    "/conversations/search?q=text",
  ])
    storage.request({
      action: "put",
      source,
      path: snapshotPath,
      value: { conversation_id: conversationId },
    })
  storage.request({
    action: "put",
    source,
    path: "/conversations/other",
    value: { title: "other" },
  })
  storage.request({ action: "invalidate-conversation", source, conversationId })
  expect(
    storage.request({ action: "get", source, path: detailPath })
  ).toBeNull()
  expect(
    storage.request({ action: "get", source, path: "/conversations" })
  ).toBeNull()
  expect(
    storage.request({ action: "get", source, path: "/conversations/other" })
      ?.value
  ).toEqual({ title: "other" })
  storage.request({
    action: "put",
    source,
    path: detailPath,
    value: { title: "fresh" },
  })
  expect(
    storage.request({ action: "get", source, path: detailPath })?.value
  ).toEqual({ title: "fresh" })
})

it("caches server message-search snapshots and clears them when the conversation changes", () => {
  const storage = cache()
  const snapshotPath = detailPath + "/messages/search?q=needle&limit=20"
  const value = {
    items: [
      { conversation_id: conversationId, message_id: 3, excerpt: "needle" },
    ],
  }
  storage.request({ action: "put", source, path: snapshotPath, value })
  expect(
    storage.request({
      action: "get",
      source,
      path: detailPath + "/messages/search?limit=20&q=needle",
    })?.value
  ).toEqual(value)
  storage.request({ action: "invalidate-conversation", source, conversationId })
  expect(
    storage.request({ action: "get", source, path: snapshotPath })
  ).toBeNull()
})

it("removes deleted history and blocks late detail, list and search responses in that source", () => {
  const storage = cache()
  const other = { ...source, accountId: "2" }
  storage.request({
    action: "put",
    source: other,
    path: detailPath,
    value: { title: "other account" },
  })
  for (const snapshotPath of [
    detailPath,
    detailPath + "/messages",
    detailPath + "/messages/search?q=needle",
    detailPath + "/plan",
    detailPath + "/messages/2/versions",
    "/conversations",
    "/conversations/search?q=text",
  ])
    storage.request({
      action: "put",
      source,
      path: snapshotPath,
      value: { items: [{ conversation_id: conversationId }] },
    })
  storage.request({ action: "delete-conversation", source, conversationId })
  storage.request({ action: "clear", source })
  for (const snapshotPath of [
    detailPath,
    detailPath + "/messages",
    detailPath + "/messages/search?q=needle",
    "/conversations",
    "/conversations/search?q=text",
  ]) {
    storage.request({
      action: "put",
      source,
      path: snapshotPath,
      value: { items: [{ conversation_id: conversationId }] },
    })
    expect(
      storage.request({ action: "get", source, path: snapshotPath })
    ).toBeNull()
  }
  expect(
    storage.request({ action: "get", source: other, path: detailPath })?.value
  ).toEqual({ title: "other account" })
  storage.request({ action: "clear", source: other })
  expect(
    storage.request({ action: "get", source: other, path: detailPath })
  ).toBeNull()
})

it("returns inactive offline snapshots without modifying the supplied server value", () => {
  const storage = cache()
  const value = {
    is_generating: true,
    current_run_id: "run",
    current_run_start: 2,
    messages_snapshot: {
      messages: [
        {
          role: "assistant",
          message_type: "suspended",
          pending: true,
          metadata: {
            pendingApproval: { id: "approval" },
            interruptId: "interrupt",
            status: "awaiting-approval",
          },
          inputRequests: ["input"],
        },
      ],
    },
  }
  storage.request({ action: "put", source, path: detailPath, value })
  expect(
    storage.request({ action: "get", source, path: detailPath })?.value
  ).toEqual({
    is_generating: false,
    messages_snapshot: {
      messages: [
        {
          role: "assistant",
          message_type: "interrupted",
          pending: false,
          metadata: { status: "interrupted" },
        },
      ],
    },
  })
  expect(value.is_generating).toBe(true)
  expect(value.messages_snapshot.messages[0].metadata.pendingApproval).toEqual({
    id: "approval",
  })
})

it("removes native approval controls while preserving tool result business fields", () => {
  const storage = cache()
  storage.request({
    action: "put",
    source,
    path: detailPath,
    value: {
      messages_snapshot: {
        messages: [
          {
            role: "assistant",
            messageType: "suspended",
            turnContext: {
              lifecycle_events: [
                {
                  type: "CUSTOM",
                  name: "buddy.coding.approval",
                  value: { call_id: "tool", request_id: "request" },
                },
                {
                  type: "CUSTOM",
                  name: "buddy.coding.approval_resolved",
                  value: { call_id: "other", request_id: "resolved" },
                },
              ],
            },
            result: { pending: true, status: "running", data: "tool output" },
          },
        ],
      },
    },
  })
  expect(
    storage.request({ action: "get", source, path: detailPath })?.value
  ).toEqual({
    messages_snapshot: {
      messages: [
        {
          role: "assistant",
          messageType: "interrupted",
          turnContext: {
            lifecycle_events: [
              {
                type: "CUSTOM",
                name: "buddy.coding.approval_resolved",
                value: { call_id: "other", request_id: "resolved" },
              },
            ],
          },
          result: { pending: true, status: "running", data: "tool output" },
        },
      ],
    },
  })
})

it("accepts only history read interfaces", () => {
  const storage = cache()
  for (const invalid of [
    "/chat/completions",
    "/settings",
    detailPath + "/prepare",
    detailPath + "/events",
    detailPath + "/input-requests",
    detailPath + "/follow-ups",
    "/../private",
    "/%2e%2e/private",
    "//host/conversations",
    "https://server/conversations",
  ])
    expect(() =>
      storage.request({ action: "put", source, path: invalid, value: {} })
    ).toThrow()
})

it("creates private cache files and rejects linked databases", () => {
  const directory = root()
  chmodSync(directory, 0o755)
  cache(directory)
  if (process.platform !== "win32") {
    expect(lstatSync(directory).mode & 0o777).toBe(0o700)
    expect(lstatSync(path.join(directory, "history.sqlite")).mode & 0o777).toBe(
      0o600
    )
  }
  const other = root()
  const target = path.join(other, "untouched")
  writeFileSync(target, "private")
  symlinkSync(target, path.join(other, "history.sqlite"))
  expect(() => cache(other)).toThrow()
  expect(readFileSync(target, "utf8")).toBe("private")
})
