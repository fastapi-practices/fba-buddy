import { describe, expect, it, vi } from "vitest"

import {
  createWindowMaterialApplier,
  MAC_WINDOW_VIBRANCY,
} from "./window-material"

describe("window material applier", () => {
  it("uses vibrancy for automatic blur and the addon for custom blur", () => {
    const setBackgroundBlurRadius = vi.fn(() => true)
    const apply = createWindowMaterialApplier(() => ({
      setBackgroundBlurRadius,
    }))
    const window = {
      getNativeWindowHandle: vi.fn(() => Buffer.alloc(8)),
      setVibrancy: vi.fn(),
    }

    expect(apply(window, { material: "opaque", blurRadius: 0 })).toBe(true)
    expect(window.setVibrancy).toHaveBeenLastCalledWith(MAC_WINDOW_VIBRANCY)

    expect(apply(window, { material: "translucent", blurRadius: 24 })).toBe(
      true
    )
    expect(window.setVibrancy).toHaveBeenLastCalledWith(null)
    expect(setBackgroundBlurRadius).toHaveBeenLastCalledWith(
      window.getNativeWindowHandle(),
      24
    )

    expect(apply(window, { material: "opaque", blurRadius: 0 })).toBe(true)
    expect(setBackgroundBlurRadius).toHaveBeenLastCalledWith(
      window.getNativeWindowHandle(),
      0
    )
    expect(window.setVibrancy).toHaveBeenLastCalledWith(MAC_WINDOW_VIBRANCY)
  })

  it("falls back to vibrancy when the native addon is unavailable", () => {
    const loadAddon = vi.fn(() => null)
    const apply = createWindowMaterialApplier(loadAddon)
    const window = {
      getNativeWindowHandle: vi.fn(() => Buffer.alloc(8)),
      setVibrancy: vi.fn(),
    }

    expect(apply(window, { material: "translucent", blurRadius: 24 })).toBe(
      false
    )
    expect(window.setVibrancy).toHaveBeenLastCalledWith(MAC_WINDOW_VIBRANCY)
    expect(apply(window, { material: "translucent", blurRadius: 32 })).toBe(
      false
    )
    expect(loadAddon).toHaveBeenCalledTimes(1)
  })

  it("restores vibrancy if macOS refuses a custom blur radius", () => {
    const apply = createWindowMaterialApplier(() => ({
      setBackgroundBlurRadius: () => false,
    }))
    const window = {
      getNativeWindowHandle: () => Buffer.alloc(8),
      setVibrancy: vi.fn(),
    }
    expect(apply(window, { material: "translucent", blurRadius: 20 })).toBe(
      false
    )
    expect(window.setVibrancy.mock.calls).toEqual([
      [null],
      [MAC_WINDOW_VIBRANCY],
    ])
  })
})
