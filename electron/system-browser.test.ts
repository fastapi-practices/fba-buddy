import { describe, expect, it, vi } from "vitest"

import { openSystemBrowser } from "./system-browser"

describe("openSystemBrowser", () => {
  it("passes the complete authorization URL to the system browser unchanged", async () => {
    const launch = vi.fn().mockResolvedValue(undefined)
    const url =
      "https://OAuth.Example.com:443/authorize?state=a%2fb&code_challenge=x%2By&scope=one+two"

    await openSystemBrowser(url, launch)

    expect(launch).toHaveBeenCalledExactlyOnceWith(url)
  })

  it.each([
    undefined,
    42,
    "",
    "/authorize",
    "file:///tmp/authorize",
    "javascript:alert(1)",
    "https://user:secret@oauth.example.com/authorize",
    "https://oauth.example.com/authorize\n?state=one",
  ])("rejects unsafe browser input %s before launching", async (url) => {
    const launch = vi.fn().mockResolvedValue(undefined)

    await expect(openSystemBrowser(url, launch)).rejects.toThrow()

    expect(launch).not.toHaveBeenCalled()
  })

  it("reports system browser failures to the caller", async () => {
    const failure = new Error("No default browser")
    const launch = vi.fn().mockRejectedValue(failure)

    await expect(
      openSystemBrowser("https://oauth.example.com/authorize", launch)
    ).rejects.toBe(failure)
  })
})
