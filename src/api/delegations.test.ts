import { describe, expect, it } from "vitest"

import { normalizeDelegationTaskId } from "@/api/delegations"

describe("delegations", () => {
  it("normalizes a compact task id to the route UUID", () => {
    expect(
      normalizeDelegationTaskId("0123456789abcdef0123456789abcdef")
    ).toBe("01234567-89ab-cdef-0123-456789abcdef")
  })
})
