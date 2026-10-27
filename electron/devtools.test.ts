import { describe, expect, it } from "vitest"

import { shouldToggleDevTools } from "./devtools-keys"

const keyDown = {
  type: "keyDown" as const,
  control: false,
  alt: false,
  meta: false,
  shift: false,
}

describe("shouldToggleDevTools", () => {
  it("toggles on F12 on every platform", () => {
    expect(
      shouldToggleDevTools({ ...keyDown, key: "F12" }, "darwin")
    ).toBe(true)
    expect(shouldToggleDevTools({ ...keyDown, key: "F12" }, "win32")).toBe(
      true
    )
  })

  it("toggles on Cmd+Option+I on macOS", () => {
    expect(
      shouldToggleDevTools(
        { ...keyDown, key: "i", meta: true, alt: true },
        "darwin"
      )
    ).toBe(true)
    expect(
      shouldToggleDevTools(
        { ...keyDown, key: "i", meta: true, alt: true },
        "win32"
      )
    ).toBe(false)
  })

  it("toggles on Ctrl+Shift+I on Windows and Linux", () => {
    expect(
      shouldToggleDevTools(
        { ...keyDown, key: "I", control: true, shift: true },
        "win32"
      )
    ).toBe(true)
    expect(
      shouldToggleDevTools(
        { ...keyDown, key: "I", control: true, shift: true },
        "linux"
      )
    ).toBe(true)
    expect(
      shouldToggleDevTools(
        { ...keyDown, key: "I", control: true, shift: true },
        "darwin"
      )
    ).toBe(false)
  })

  it("ignores key up and unrelated combos", () => {
    expect(
      shouldToggleDevTools({ ...keyDown, type: "keyUp", key: "F12" }, "darwin")
    ).toBe(false)
    expect(
      shouldToggleDevTools({ ...keyDown, key: "i", meta: true }, "darwin")
    ).toBe(false)
    expect(
      shouldToggleDevTools({ ...keyDown, key: "k", control: true }, "win32")
    ).toBe(false)
  })
})
