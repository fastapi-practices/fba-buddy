import { afterEach, describe, expect, it } from "vitest"

import { getDesktopNotifications, getLocale, setRuntime } from "@/lib/runtime"

describe("runtime", () => {
  afterEach(() => {
    setRuntime({ locale: "zh-CN", desktopNotifications: true })
  })

  it("stores locale and desktop notification preference", () => {
    setRuntime({ locale: "en-US", desktopNotifications: false })
    expect(getLocale()).toBe("en-US")
    expect(getDesktopNotifications()).toBe(false)

    setRuntime({ locale: "zh-CN", desktopNotifications: true })
    expect(getLocale()).toBe("zh-CN")
    expect(getDesktopNotifications()).toBe(true)
  })

  it("normalizes unknown locales", () => {
    setRuntime({ locale: "fr-FR" as "zh-CN" })
    expect(getLocale()).toBe("zh-CN")
  })
})
