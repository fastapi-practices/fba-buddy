import { describe, expect, it } from "vitest"

import {
  MAC_TRAFFIC_LIGHT_GUTTER_CLASS,
  shouldReserveTrafficLightGutter,
} from "@/lib/desktop-chrome"

describe("shouldReserveTrafficLightGutter", () => {
  it("keeps the chat header clear of mac traffic lights once the sidebar is gone", () => {
    expect(
      shouldReserveTrafficLightGutter({
        isMacDesktop: true,
        sidebarOpen: false,
        isMobile: false,
      })
    ).toBe(true)
  })

  it("leaves the gutter on the sidebar while it is open", () => {
    expect(
      shouldReserveTrafficLightGutter({
        isMacDesktop: true,
        sidebarOpen: true,
        isMobile: false,
      })
    ).toBe(false)
  })

  it("does not inset the header on non-mac desktops", () => {
    expect(
      shouldReserveTrafficLightGutter({
        isMacDesktop: false,
        sidebarOpen: false,
        isMobile: false,
      })
    ).toBe(false)
  })

  it("uses a tailwind pixel padding class for the mac titlebar inset", () => {
    expect(MAC_TRAFFIC_LIGHT_GUTTER_CLASS).toBe("pl-[88px]")
  })
})
