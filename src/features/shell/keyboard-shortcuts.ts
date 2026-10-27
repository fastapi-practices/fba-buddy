import type { TranslationKey } from "@/lib/i18n"
export type ShortcutGroupId = "global" | "chat" | "appearance"

type ShortcutModifier = "mod" | "shift" | "alt"

export type ShortcutCombo = {
  modifiers: ShortcutModifier[]
  key: string
}

export const SHORTCUT_IDS = [
  "command-palette",
  "toggle-sidebar",
  "send-message",
  "newline",
  "toggle-theme",
] as const

export type ShortcutId = (typeof SHORTCUT_IDS)[number]

export type ShortcutDefinition = {
  id: ShortcutId
  group: ShortcutGroupId
  label: TranslationKey
  combo: ShortcutCombo
}

export type ShortcutOverrides = Partial<
  Record<ShortcutId, ShortcutCombo | null>
>

export const SHORTCUT_GROUPS: ReadonlyArray<{
  id: ShortcutGroupId
  label: TranslationKey
}> = [
  { id: "global", label: "common.global" },
  { id: "chat", label: "common.chat" },
  { id: "appearance", label: "common.appearance" },
]

export const SHORTCUTS: readonly ShortcutDefinition[] = [
  {
    id: "command-palette",
    group: "global",
    label: "common.openCommandPalette",
    combo: { modifiers: ["mod"], key: "K" },
  },
  {
    id: "toggle-sidebar",
    group: "global",
    label: "common.showOrHideTheSidebar",
    combo: { modifiers: ["mod"], key: "B" },
  },
  {
    id: "send-message",
    group: "chat",
    label: "common.sendMessage",
    combo: { modifiers: [], key: "Enter" },
  },
  {
    id: "newline",
    group: "chat",
    label: "common.newLine",
    combo: { modifiers: ["shift"], key: "Enter" },
  },
  {
    id: "toggle-theme",
    group: "appearance",
    label: "common.toggleLightAndDark",
    combo: { modifiers: [], key: "D" },
  },
]

export function isMacShortcutPlatform(platform: string | undefined): boolean {
  if (!platform) {
    return false
  }
  return platform.toLowerCase().includes("mac") || platform === "darwin"
}

export function shortcutTokens(combo: ShortcutCombo, isMac: boolean): string[] {
  const labels: Record<ShortcutModifier, string> = {
    mod: isMac ? "⌘" : "Ctrl",
    shift: isMac ? "⇧" : "Shift",
    alt: isMac ? "⌥" : "Alt",
  }
  return [...combo.modifiers.map((modifier) => labels[modifier]), combo.key]
}

const MODIFIER_KEYS = new Set(["Meta", "Control", "Shift", "Alt", "OS"])

function defaultShortcutCombo(id: ShortcutId): ShortcutCombo {
  const item = SHORTCUTS.find((candidate) => candidate.id === id)
  return item?.combo ?? SHORTCUTS[0].combo
}

export function resolveShortcut(
  id: ShortcutId,
  overrides: ShortcutOverrides
): ShortcutCombo | null {
  if (Object.prototype.hasOwnProperty.call(overrides, id)) {
    return overrides[id] ?? null
  }
  return defaultShortcutCombo(id)
}

export function isShortcutOverridden(
  id: ShortcutId,
  overrides: ShortcutOverrides
): boolean {
  return Object.prototype.hasOwnProperty.call(overrides, id)
}

export function hasShortcutOverrides(overrides: ShortcutOverrides): boolean {
  return Object.keys(overrides).length > 0
}

function comboEquals(
  left: ShortcutCombo,
  right: ShortcutCombo
): boolean {
  return shortcutComboKey(left) === shortcutComboKey(right)
}

function shortcutComboKey(combo: ShortcutCombo): string {
  const modifiers = [...combo.modifiers].sort().join("+")
  return `${modifiers}:${combo.key.toLowerCase()}`
}

export function findShortcutConflict(
  id: ShortcutId,
  combo: ShortcutCombo,
  overrides: ShortcutOverrides
): ShortcutId | null {
  for (const item of SHORTCUTS) {
    if (item.id === id) {
      continue
    }
    const bound = resolveShortcut(item.id, overrides)
    if (bound && comboEquals(bound, combo)) {
      return item.id
    }
  }
  return null
}

function normalizeShortcutKey(key: string): string | null {
  if (
    !key ||
    MODIFIER_KEYS.has(key) ||
    key === "Unidentified" ||
    key === "Dead"
  ) {
    return null
  }
  if (key === "Escape") {
    return null
  }
  if (key === " ") {
    return "Space"
  }
  if (key.length === 1) {
    return key.toUpperCase()
  }
  return key
}

type ShortcutKeyEvent = Pick<
  KeyboardEvent,
  "key" | "code" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey"
>

export function comboFromKeyboardEvent(
  event: ShortcutKeyEvent
): ShortcutCombo | null {
  const key = normalizeShortcutKey(event.key)
  if (!key) {
    return null
  }
  const modifiers: ShortcutModifier[] = []
  if (event.metaKey || event.ctrlKey) {
    modifiers.push("mod")
  }
  if (event.shiftKey) {
    modifiers.push("shift")
  }
  if (event.altKey) {
    modifiers.push("alt")
  }
  return { modifiers, key }
}

export function eventMatchesCombo(
  event: ShortcutKeyEvent,
  combo: ShortcutCombo
): boolean {
  const next = comboFromKeyboardEvent(event)
  return next != null && comboEquals(next, combo)
}

export function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  if (target.isContentEditable) {
    return true
  }
  return Boolean(
    target.closest("input, textarea, select, [contenteditable='true']")
  )
}

export function normalizeShortcutOverrides(value: unknown): ShortcutOverrides {
  if (!value || typeof value !== "object") {
    return {}
  }
  const ids = new Set<string>(SHORTCUT_IDS)
  const next: ShortcutOverrides = {}
  for (const [id, combo] of Object.entries(value as Record<string, unknown>)) {
    if (!ids.has(id as ShortcutId)) {
      continue
    }
    if (combo === null) {
      next[id as ShortcutId] = null
      continue
    }
    const parsed = parseShortcutCombo(combo)
    if (parsed) {
      next[id as ShortcutId] = parsed
    }
  }
  return next
}

function parseShortcutCombo(value: unknown): ShortcutCombo | null {
  if (!value || typeof value !== "object") {
    return null
  }
  const combo = value as { modifiers?: unknown; key?: unknown }
  if (typeof combo.key !== "string" || !combo.key) {
    return null
  }
  if (!Array.isArray(combo.modifiers)) {
    return null
  }
  const modifiers = combo.modifiers.filter(
    (item): item is ShortcutModifier =>
      item === "mod" || item === "shift" || item === "alt"
  )
  if (modifiers.length !== combo.modifiers.length) {
    return null
  }
  return { modifiers, key: combo.key }
}
