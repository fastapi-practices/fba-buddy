import { expect, it } from "vitest"
import {
  accountSourceHash,
  executionProfileKey,
  normalizeAccountSource,
} from "./account-source"

it("isolates execution profiles and checkpoint buckets by backend and account", () => {
  const source = { backendUrl: "https://ONE.test/api/v1/", accountId: "1" }
  expect(normalizeAccountSource(source).backendUrl).toBe(
    "https://one.test/api/v1"
  )
  expect(accountSourceHash(source)).toBe(
    accountSourceHash({ ...source, backendUrl: "https://one.test/api/v1" })
  )
  const key = executionProfileKey(source, "conversation")
  expect(key).not.toBe(
    executionProfileKey({ ...source, accountId: "2" }, "conversation")
  )
  expect(key).not.toBe(
    executionProfileKey(
      { ...source, backendUrl: "https://two.test/api/v1" },
      "conversation"
    )
  )
  expect(() => executionProfileKey(source, "../private")).toThrow()
  for (const backendUrl of [
    "file:///private",
    "https://user:secret@one.test",
    "https://one.test?token=secret",
    "https://one.test#other",
  ])
    expect(() => accountSourceHash({ ...source, backendUrl })).toThrow()
})
