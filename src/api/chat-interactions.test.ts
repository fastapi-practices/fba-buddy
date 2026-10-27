import { afterEach, describe, expect, it, vi } from "vitest"
import { ApiError, apiRequest } from "./http"
import { getMessageVersions } from "./chat-interactions"

vi.mock("./http", async (original) => ({
  ...(await original<typeof import("./http")>()),
  apiRequest: vi.fn(),
}))
afterEach(() => vi.clearAllMocks())

describe("related branches API", () => {
  const version = {
    conversation_id: "branch",
    message_id: null,
    title: "Branch",
    created_time: "2026-10-10",
    source_conversation_id: "source",
    source_message_id: 2,
  }
  it("preserves target message identity and propagates cancellation", async () => {
    vi.mocked(apiRequest).mockResolvedValue([version])
    const signal = new AbortController().signal
    expect(await getMessageVersions("a/b", 2, { signal })).toEqual([version])
    expect(apiRequest).toHaveBeenCalledWith(
      "/conversations/a%2Fb/messages/2/versions",
      { silent: true, signal }
    )
  })
  it("accepts an unresolved target and rejects malformed versions", async () => {
    vi.mocked(apiRequest).mockResolvedValue([])
    expect(await getMessageVersions("source", 2)).toEqual([])
    for (const invalid of [
      null,
      {},
      [{ ...version, message_id: undefined }],
      [{ ...version, message_id: 0 }],
      [{ ...version, source_conversation_id: "" }],
      [{ ...version, source_message_id: 0 }],
    ]) {
      vi.mocked(apiRequest).mockResolvedValue(invalid)
      await expect(getMessageVersions("source", 2)).rejects.toThrow()
    }
  })
  it("retains genuine network and cancellation failures", async () => {
    const failed = new ApiError(503, "temporarily offline")
    vi.mocked(apiRequest).mockRejectedValue(failed)
    await expect(getMessageVersions("source", 2)).rejects.toBe(failed)
    const cancelled = new DOMException("Cancelled", "AbortError")
    vi.mocked(apiRequest).mockRejectedValue(cancelled)
    await expect(getMessageVersions("source", 2)).rejects.toBe(cancelled)
  })
})
