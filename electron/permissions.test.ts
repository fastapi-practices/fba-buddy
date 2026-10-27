import { describe, expect, it } from "vitest"

import { desktopPermissionAllowed } from "./permissions"

describe("desktop session permissions", () => {
  it("allows system fonts and clipboard writes", () => {
    expect(desktopPermissionAllowed("local-fonts")).toBe(true)
    expect(desktopPermissionAllowed("clipboard-sanitized-write")).toBe(true)
  })

  it("rejects every other capability the settings page does not need", () => {
    for (const permission of [
      "clipboard-read",
      "media",
      "geolocation",
      "notifications",
      "openExternal",
      "display-capture",
      "unknown",
    ]) {
      expect(desktopPermissionAllowed(permission)).toBe(false)
    }
  })
})
