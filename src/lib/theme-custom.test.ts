import { afterEach, describe, expect, it, vi } from "vitest"

import { resolveWindowMaterial } from "./theme-custom"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

async function windowAppearanceFixture(
  setWindowMaterial: (input: unknown) => Promise<boolean>
) {
  const root = {
    dataset: {} as Record<string, string>,
    style: { setProperty: vi.fn(), removeProperty: vi.fn() },
  }
  vi.stubGlobal("document", { documentElement: root })
  vi.stubGlobal("window", {
    buddyDesktop: { platform: "darwin", setWindowMaterial },
  })
  const theme = await import("./theme-custom")
  return {
    ...theme,
    root,
    apply: (blur: number | null) =>
      theme.applyThemeCustomization(
        theme.THEME_CUSTOM_DEFAULTS,
        theme.presetColorsFor("chatgpt", "light"),
        {
          opaqueWindows: false,
          translucency: { sidebarOnly: false, opacity: 60, blur },
        }
      ),
  }
}

describe("resolveWindowMaterial", () => {
  it("uses macOS vibrancy-backed translucency only when the theme allows it", () => {
    expect(resolveWindowMaterial(false, "darwin")).toBe("translucent")
    expect(resolveWindowMaterial(true, "darwin")).toBe("solid")
    expect(resolveWindowMaterial(false, "win32")).toBe("solid")
    expect(resolveWindowMaterial(false, undefined)).toBe("solid")
  })
})

describe("native window blur feedback", () => {
  it("reports unavailable custom blur and clears the status when switching to Auto", async () => {
    const setWindowMaterial = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
    const fixture = await windowAppearanceFixture(setWindowMaterial)
    const listener = vi.fn()
    const unsubscribe = fixture.subscribeWindowBlurStatus(listener)
    fixture.apply(24)
    await Promise.resolve()
    expect(fixture.isWindowBlurUnavailable()).toBe(true)
    fixture.apply(null)
    await Promise.resolve()
    expect(fixture.isWindowBlurUnavailable()).toBe(false)
    expect(listener).toHaveBeenCalledTimes(2)
    expect(setWindowMaterial).toHaveBeenLastCalledWith({
      material: "opaque",
      blurRadius: 0,
    })
    unsubscribe()
  })

  it("ignores an old refusal after the slider moves away and returns to the same radius", async () => {
    let refuse: (applied: boolean) => void = () => {}
    const oldResult = new Promise<boolean>((resolve) => {
      refuse = resolve
    })
    const setWindowMaterial = vi
      .fn()
      .mockReturnValueOnce(oldResult)
      .mockResolvedValue(true)
    const fixture = await windowAppearanceFixture(setWindowMaterial)
    fixture.apply(24)
    fixture.apply(32)
    fixture.apply(24)
    await Promise.resolve()
    refuse(false)
    await Promise.resolve()
    expect(fixture.isWindowBlurUnavailable()).toBe(false)
  })
})
