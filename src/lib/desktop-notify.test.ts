import { describe, expect, it } from "vitest"

import { notificationPreview, shouldSendDesktopNotification } from "@/lib/desktop-notify"

describe("desktop-notify", () => {
  it("only sends when enabled and the window is in the background", () => {
    expect(shouldSendDesktopNotification({ enabled: true, windowFocused: false })).toBe(true)
    expect(shouldSendDesktopNotification({ enabled: true, windowFocused: true })).toBe(false)
    expect(shouldSendDesktopNotification({ enabled: false, windowFocused: false })).toBe(false)
  })

  it("collapses whitespace and truncates long replies", () => {
    expect(notificationPreview("  你好\n世界  ")).toBe("你好 世界")
    expect(notificationPreview("")).toBe("回复已完成")
    expect(notificationPreview("a".repeat(121)).length).toBe(120)
  })
})
