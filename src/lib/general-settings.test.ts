import { afterEach, describe, expect, it, vi } from "vitest"

import {
  applyUiFontSize,
  CHAT_FONT_SIZE_STEPS,
  isValidProxyUrl,
  normalizeCodeFontSize,
  normalizeFollowUpMode,
  normalizeLocale,
  normalizeProxyMode,
  normalizeUiFontSize,
  UI_FONT_SIZE_DEFAULT,
  UI_FONT_SIZE_STEPS,
  uiFontSizeStepIndex,
} from "@/lib/general-settings"

afterEach(() => vi.unstubAllGlobals())

describe("general-settings", () => {
  it("normalizes locale to zh-CN or en-US", () => {
    expect(normalizeLocale("en-US")).toBe("en-US")
    expect(normalizeLocale("zh-CN")).toBe("zh-CN")
    expect(normalizeLocale("fr")).toBe("zh-CN")
  })

  it("offers six text sizes with the second size as default", () => {
    expect(UI_FONT_SIZE_STEPS).toEqual([13, 14, 15, 16, 17, 18])
    expect(CHAT_FONT_SIZE_STEPS).toEqual([14, 15, 16, 18, 20, 23])
    expect(UI_FONT_SIZE_DEFAULT).toBe(14)
    expect(uiFontSizeStepIndex(UI_FONT_SIZE_DEFAULT)).toBe(1)
  })

  it("snaps text size to the nearest step and keeps ties at the smaller size", () => {
    expect(normalizeUiFontSize(5)).toBe(13)
    expect(normalizeUiFontSize(30)).toBe(18)
    expect(normalizeUiFontSize("14")).toBe(14)
    expect(normalizeUiFontSize(14.5)).toBe(14)
    expect(normalizeUiFontSize(14.6)).toBe(15)
    expect(uiFontSizeStepIndex(5)).toBe(0)
    expect(uiFontSizeStepIndex(14.5)).toBe(1)
    expect(uiFontSizeStepIndex(30)).toBe(5)
  })

  it.each([
    undefined,
    null,
    "",
    " ",
    "invalid",
    {},
    [],
    true,
    NaN,
    Infinity,
    Symbol("size"),
  ])("uses the default for an invalid text size %s", (size) => {
    expect(normalizeUiFontSize(size)).toBe(14)
  })

  it.each([
    [13, 13, 14],
    [14, 14, 15],
    [15, 15, 16],
    [16, 16, 18],
    [17, 16, 20],
    [18, 16, 23],
  ])("applies size %s with UI %spx and chat %spx", (size, ui, chat) => {
    const setProperty = vi.fn()
    vi.stubGlobal("document", { documentElement: { style: { setProperty } } })

    applyUiFontSize(size)

    expect(setProperty).toHaveBeenCalledWith("--app-font-size-ui", `${ui}px`)
    expect(setProperty).toHaveBeenCalledWith(
      "--app-font-size-chat",
      `${chat}px`
    )
  })

  it("applies the default when an invalid size reaches the document", () => {
    const setProperty = vi.fn()
    vi.stubGlobal("document", { documentElement: { style: { setProperty } } })

    applyUiFontSize(NaN)

    expect(setProperty).toHaveBeenCalledWith("--app-font-size-ui", "14px")
    expect(setProperty).toHaveBeenCalledWith("--app-font-size-chat", "15px")
  })

  it("clamps code font size", () => {
    expect(normalizeCodeFontSize(15)).toBe(15)
    expect(normalizeCodeFontSize(5)).toBe(10)
    expect(normalizeCodeFontSize(40)).toBe(24)
    expect(normalizeCodeFontSize("12")).toBe(12)
  })

  it("normalizes proxy mode", () => {
    expect(normalizeProxyMode("custom")).toBe("custom")
    expect(normalizeProxyMode("direct")).toBe("direct")
    expect(normalizeProxyMode("nope")).toBe("system")
  })

  it("normalizes follow-up mode to queue or steer", () => {
    expect(normalizeFollowUpMode("queue")).toBe("queue")
    expect(normalizeFollowUpMode("steer")).toBe("steer")
    expect(normalizeFollowUpMode("nope")).toBe("queue")
  })

  it("accepts http and socks5 proxy urls", () => {
    expect(isValidProxyUrl("http://127.0.0.1:7890")).toBe(true)
    expect(isValidProxyUrl("socks5://127.0.0.1:1080")).toBe(true)
    expect(isValidProxyUrl("not-a-url")).toBe(false)
  })
})
