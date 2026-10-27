import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/config", () => ({
  API_ORIGIN: "http://127.0.0.1:8000",
}))

import { resolveMediaUrl } from "@/lib/media-url"

describe("resolveMediaUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("keeps absolute and data urls", () => {
    expect(resolveMediaUrl("https://cdn.example/a.png")).toBe(
      "https://cdn.example/a.png"
    )
    expect(resolveMediaUrl("data:image/png;base64,abc")).toBe(
      "data:image/png;base64,abc"
    )
  })

  it("prefixes relative paths with the API origin", () => {
    expect(resolveMediaUrl("/static/avatar.png")).toBe(
      "http://127.0.0.1:8000/static/avatar.png"
    )
  })

  it("returns undefined for empty values", () => {
    expect(resolveMediaUrl(null)).toBeUndefined()
    expect(resolveMediaUrl("  ")).toBeUndefined()
  })
})
