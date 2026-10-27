import { describe, expect, it } from "vitest"
import { quotaReset } from "./quota-recovery"
describe("quota recovery", () => {
  it("reads explicit reset times and retry-after without inventing deadlines", () => {
    expect(quotaReset({ status: 429, retry_after: 30 }, 1000)).toEqual({
      resetAt: 31000,
    })
    expect(
      quotaReset({ code: "rate_limit", reset_at: 2000000000 }, 1000)
    ).toEqual({ resetAt: 2000000000000 })
    expect(quotaReset({ code: "quota_exceeded" }, 1000)).toEqual({
      resetAt: null,
    })
    expect(quotaReset({ status: 429, reset_at: "bad" }, 1000)).toEqual({
      resetAt: null,
    })
    expect(quotaReset({ message: "network disconnected" }, 1000)).toBeNull()
  })
})
