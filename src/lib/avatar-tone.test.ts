import { describe, expect, it } from "vitest"

import { avatarFallbackTone } from "@/lib/avatar-tone"

describe("avatarFallbackTone", () => {
  it("returns a stable class for the same seed", () => {
    expect(avatarFallbackTone("写作助手")).toBe(avatarFallbackTone("写作助手"))
    expect(avatarFallbackTone(12)).toBe(avatarFallbackTone(12))
  })

  it("varies by seed", () => {
    expect(avatarFallbackTone("摘要")).not.toBe(avatarFallbackTone("规范"))
  })
})
