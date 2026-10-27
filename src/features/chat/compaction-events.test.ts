import { describe, expect, it } from "vitest"
import { compactionSnapshot } from "./compaction-events"

describe("context compaction snapshot", () => {
  it("reads the before and after counters of a finished compaction", () => {
    const snapshot = compactionSnapshot({
      id: "compact",
      status: "completed",
      tokens_before: 82000,
      tokens_after: 12000,
      messages_before: 48,
      messages_after: 8,
    })
    expect(snapshot.running).toBe(false)
    expect(snapshot.failed).toBe(false)
    expect(snapshot.tokenDelta).toBe("82k → 12k")
    expect(snapshot.tokenRow).toBe("82,000 → 12,000")
    expect(snapshot.messageRow).toBe("48 → 8")
  })

  it("marks a running compaction as in progress", () => {
    const snapshot = compactionSnapshot({ id: "compact", status: "running" })
    expect(snapshot.running).toBe(true)
    expect(snapshot.tokenDelta).toBeUndefined()
    expect(snapshot.summary).toBeUndefined()
  })

  it("keeps the summary of provider compaction events", () => {
    const snapshot = compactionSnapshot({
      activityType: "pydantic_ai_compaction",
      content: { content: "compacted summary" },
    })
    expect(snapshot.status).toBe("unknown")
    expect(snapshot.summary).toBe("compacted summary")
    expect(snapshot.tokenRow).toBeUndefined()
  })

  it("reports a failed compaction as failed", () => {
    const snapshot = compactionSnapshot({ status: "error" })
    expect(snapshot.failed).toBe(true)
    expect(snapshot.running).toBe(false)
  })
})
