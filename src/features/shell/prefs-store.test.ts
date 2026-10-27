import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

const saved = vi.hoisted(() => {
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  }
  vi.stubGlobal("localStorage", storage)
  vi.stubGlobal("window", { localStorage: storage })
  return values
})

import {
  codexFieldsFromTheme,
  codexThemeFromFields,
  parseCodexThemeV1,
  serializeCodexThemeV1,
} from "@/lib/codex-theme"
import { usePrefsStore } from "./prefs-store"

beforeEach(() => {
  usePrefsStore.setState(usePrefsStore.getInitialState(), true)
  saved.clear()
})

afterAll(() => vi.unstubAllGlobals())

describe("directive color preferences", () => {
  it("restores the saved directive color and other preferences", async () => {
    const state = usePrefsStore.getState()
    state.setThemeId("nord")
    state.setThemeDirectiveColor("#ABCDEF")
    state.setUiFontSize(15)
    const persisted = saved.get("fba-buddy.ui")!
    usePrefsStore.setState(usePrefsStore.getInitialState(), true)
    saved.set("fba-buddy.ui", persisted)

    await usePrefsStore.persist.rehydrate()

    expect(usePrefsStore.getState()).toMatchObject({
      themeDirectiveColor: "#abcdef",
      themeId: "nord",
      uiFontSize: 15,
    })
    expect(JSON.parse(persisted).state.themeDirectiveColor).toBe("#abcdef")
  })

  it.each([null, "#0169cc"])(
    "preserves the selected directive color %s across reloads",
    async (themeDirectiveColor) => {
      saved.set(
        "fba-buddy.ui",
        JSON.stringify({
          state: { themeDirectiveColor },
        })
      )

      await usePrefsStore.persist.rehydrate()

      expect(usePrefsStore.getState().themeDirectiveColor).toBe(
        themeDirectiveColor
      )
    }
  )

  it("keeps the Codex semantic skill field compatible during import and export", () => {
    const imported = parseCodexThemeV1(
      JSON.stringify({
        variant: "dark",
        theme: { semanticColors: { skill: "#ABCDEF" } },
      })
    )!
    const fields = codexFieldsFromTheme(imported)

    usePrefsStore.getState().setThemeFromCodex(fields)

    expect(usePrefsStore.getState().themeDirectiveColor).toBe("#abcdef")
    const exported = parseCodexThemeV1(
      serializeCodexThemeV1(codexThemeFromFields(fields, "dark"))
    )!
    expect(exported.theme.semanticColors.skill).toBe("#abcdef")
    expect(exported).toEqual(imported)
  })
})

describe("text size preferences", () => {
  it("starts at the second text size", () => {
    expect(usePrefsStore.getState().uiFontSize).toBe(14)
  })

  it.each([
    [9, 13],
    [11, 13],
    [15, 15],
    [17, 17],
    [20, 18],
  ])("normalizes the selected size %s to %s", async (size, expected) => {
    usePrefsStore.getState().setUiFontSize(size)

    await usePrefsStore.persist.rehydrate()

    expect(usePrefsStore.getState().uiFontSize).toBe(expected)
  })

  it.each([undefined, null, "", " ", "invalid", true])(
    "restores the default for invalid saved size %s",
    async (size) => {
      usePrefsStore.getState().setUiFontSize(18)
      saved.set(
        "fba-buddy.ui",
        JSON.stringify({
          state: { uiFontSize: size, themeId: "nord" },
        })
      )

      await usePrefsStore.persist.rehydrate()

      expect(usePrefsStore.getState()).toMatchObject({
        uiFontSize: 14,
        themeId: "nord",
      })
    }
  )

  it("keeps the selected first size across a reload", async () => {
    usePrefsStore.getState().setUiFontSize(13)
    const persisted = saved.get("fba-buddy.ui")!
    usePrefsStore.setState(usePrefsStore.getInitialState(), true)
    saved.set("fba-buddy.ui", persisted)

    await usePrefsStore.persist.rehydrate()

    expect(usePrefsStore.getState().uiFontSize).toBe(13)
    expect(JSON.parse(persisted).state.uiFontSize).toBe(13)
  })

  it("keeps the nominal large size when the UI rendering size is capped", async () => {
    usePrefsStore.getState().setUiFontSize(18)

    await usePrefsStore.persist.rehydrate()

    expect(usePrefsStore.getState().uiFontSize).toBe(18)
    expect(JSON.parse(saved.get("fba-buddy.ui")!).state.uiFontSize).toBe(18)
  })
})
