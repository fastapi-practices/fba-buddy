import { describe, expect, it } from "vitest"

import {
  DEFAULT_WINDOW_TRANSLUCENCY,
  desktopWindowMaterialFor,
  normalizeDesktopWindowMaterial,
  normalizeWindowTranslucency,
} from "./window-material"

describe("window translucency preferences", () => {
  it("uses defaults for missing or invalid values and preserves automatic blur", () => {
    expect(normalizeWindowTranslucency(undefined)).toEqual(
      DEFAULT_WINDOW_TRANSLUCENCY
    )
    expect(
      normalizeWindowTranslucency({
        opacity: null,
        blur: "",
        sidebarOnly: "yes",
      })
    ).toEqual(DEFAULT_WINDOW_TRANSLUCENCY)
    expect(
      normalizeWindowTranslucency({
        opacity: 60,
        blur: null,
        sidebarOnly: true,
      })
    ).toEqual({ opacity: 60, blur: null, sidebarOnly: true })
    expect(
      normalizeWindowTranslucency({
        opacity: 70,
        blur: 24,
        sidebarOnly: false,
      })
    ).toEqual({ opacity: 70, blur: 24, sidebarOnly: false })
  })

  it("clamps persisted numbers to the same bounds as the controls", () => {
    expect(normalizeWindowTranslucency({ opacity: -1, blur: 0 })).toEqual({
      opacity: 15,
      blur: 1,
      sidebarOnly: true,
    })
    expect(normalizeWindowTranslucency({ opacity: 101, blur: 999 })).toEqual({
      opacity: 100,
      blur: 64,
      sidebarOnly: true,
    })
  })

  it("keeps the native material contract numeric and uses vibrancy in Auto or solid mode", () => {
    expect(
      normalizeDesktopWindowMaterial({
        material: "translucent",
        blurRadius: "24",
      })
    ).toBeNull()
    expect(
      normalizeDesktopWindowMaterial({
        material: "translucent",
        blurRadius: NaN,
      })
    ).toBeNull()
    expect(
      normalizeDesktopWindowMaterial({
        material: "translucent",
        blurRadius: -1,
      })
    ).toEqual({ material: "translucent", blurRadius: 1 })
    expect(desktopWindowMaterialFor("translucent", 24)).toEqual({
      material: "translucent",
      blurRadius: 24,
    })
    expect(desktopWindowMaterialFor("translucent", null)).toEqual({
      material: "opaque",
      blurRadius: 0,
    })
    expect(desktopWindowMaterialFor("solid", 24)).toEqual({
      material: "opaque",
      blurRadius: 0,
    })
  })
})
