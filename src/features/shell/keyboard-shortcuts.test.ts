import { describe, expect, it } from "vitest"

import {
  comboFromKeyboardEvent,
  eventMatchesCombo,
  findShortcutConflict,
  hasShortcutOverrides,
  isShortcutOverridden,
  normalizeShortcutOverrides,
  resolveShortcut,
  shortcutTokens,
  isMacShortcutPlatform,
} from "@/features/shell/keyboard-shortcuts"

describe("keyboard-shortcuts", () => {
  it("detects mac platforms", () => {
    expect(isMacShortcutPlatform("darwin")).toBe(true)
    expect(isMacShortcutPlatform("MacIntel")).toBe(true)
    expect(isMacShortcutPlatform("Win32")).toBe(false)
  })

  it("formats modifier keys for mac and windows", () => {
    expect(shortcutTokens({ modifiers: ["mod"], key: "K" }, true)).toEqual([
      "⌘",
      "K",
    ])
    expect(
      shortcutTokens({ modifiers: ["mod", "shift"], key: "K" }, false)
    ).toEqual(["Ctrl", "Shift", "K"])
    expect(shortcutTokens({ modifiers: [], key: "Enter" }, true)).toEqual([
      "Enter",
    ])
  })

  it("resolves defaults, cleared bindings, and custom overrides", () => {
    expect(resolveShortcut("command-palette", {})).toEqual({
      modifiers: ["mod"],
      key: "K",
    })
    expect(
      resolveShortcut("command-palette", { "command-palette": null })
    ).toBeNull()
    expect(
      resolveShortcut("command-palette", {
        "command-palette": { modifiers: ["mod"], key: "P" },
      })
    ).toEqual({
      modifiers: ["mod"],
      key: "P",
    })
    expect(
      isShortcutOverridden("command-palette", { "command-palette": null })
    ).toBe(true)
    expect(
      hasShortcutOverrides({ "toggle-theme": { modifiers: ["mod"], key: "D" } })
    ).toBe(true)
  })

  it("matches keyboard events to combos and finds conflicts", () => {
    const event = {
      key: "k",
      metaKey: true,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
    } as KeyboardEvent
    expect(comboFromKeyboardEvent(event)).toEqual({
      modifiers: ["mod"],
      key: "K",
    })
    expect(eventMatchesCombo(event, { modifiers: ["mod"], key: "K" })).toBe(
      true
    )
    expect(
      findShortcutConflict(
        "toggle-sidebar",
        { modifiers: ["mod"], key: "K" },
        {}
      )
    ).toBe("command-palette")
    expect(
      findShortcutConflict(
        "command-palette",
        { modifiers: ["mod"], key: "K" },
        {}
      )
    ).toBeNull()
  })

  it("drops unknown persisted shortcut ids", () => {
    expect(
      normalizeShortcutOverrides({
        nope: { modifiers: ["mod"], key: "X" },
        "toggle-theme": { modifiers: ["shift"], key: "L" },
        "send-message": null,
      })
    ).toEqual({
      "toggle-theme": { modifiers: ["shift"], key: "L" },
      "send-message": null,
    })
  })
})
