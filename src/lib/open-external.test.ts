import { afterEach, describe, expect, it, vi } from "vitest"

import { openExternal } from "./open-external"

const authorizationUrl =
  "https://oauth.example.com/authorize?state=one%2Ftwo&code_challenge=three+four"

afterEach(() => vi.unstubAllGlobals())

describe("openExternal", () => {
  it("uses the desktop bridge and preserves the complete URL", async () => {
    const launch = vi.fn().mockResolvedValue(undefined)
    const open = vi.fn()
    vi.stubGlobal("window", { buddyDesktop: { openExternal: launch }, open })

    await openExternal(authorizationUrl)

    expect(launch).toHaveBeenCalledExactlyOnceWith(authorizationUrl)
    expect(open).not.toHaveBeenCalled()
  })

  it("reports desktop browser launch failures without opening a second window", async () => {
    const launch = vi.fn().mockRejectedValue(new Error("No default browser"))
    const open = vi.fn()
    vi.stubGlobal("window", { buddyDesktop: { openExternal: launch }, open })

    await expect(openExternal(authorizationUrl)).rejects.toThrow(
      "oauth.browserFailed"
    )

    expect(open).not.toHaveBeenCalled()
  })

  it("opens a Web window and detaches the opener", async () => {
    const opened = { opener: {} }
    const open = vi.fn().mockReturnValue(opened)
    vi.stubGlobal("window", { open })

    await openExternal(authorizationUrl)

    expect(open).toHaveBeenCalledExactlyOnceWith(authorizationUrl, "_blank")
    expect(opened.opener).toBeNull()
  })

  it("reports blocked Web windows so the caller can offer retry", async () => {
    vi.stubGlobal("window", { open: vi.fn().mockReturnValue(null) })

    await expect(openExternal(authorizationUrl)).rejects.toThrow(
      "oauth.browserFailed"
    )
  })
})
