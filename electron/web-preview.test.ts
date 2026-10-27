import { describe, expect, it, vi } from "vitest"

vi.mock("electron", () => ({
  BrowserWindow: {},
  Menu: {},
  clipboard: {},
  session: {},
  shell: {},
}))
import { webPreviewUrl } from "./web-preview"

describe("web preview navigation", () => {
  it("normalizes HTTP pages including international domains", () => {
    expect(webPreviewUrl("https://example.com/a b?q=1#part")).toBe(
      "https://example.com/a%20b?q=1#part"
    )
    expect(webPreviewUrl("http://localhost:3000/")).toBe(
      "http://localhost:3000/"
    )
  })
  it.each([
    "javascript:alert(1)",
    "file:///etc/passwd",
    "data:text/html,<script>alert(1)</script>",
    "https://user:password@example.com",
    "https://example.com/" + "a".repeat(8192),
    null,
  ])("rejects non-web or credential-bearing navigation %s", (value) => {
    expect(() => webPreviewUrl(value)).toThrow()
  })
})
