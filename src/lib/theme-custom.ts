/** 主题自定义：主题预设、字体样式选项与把偏好写进 CSS 变量的运行时逻辑 */

import { SYNARA_THEME_PRESETS } from "./theme-presets"
import {
  desktopWindowMaterialFor,
  normalizeWindowTranslucency,
  type WindowTranslucency,
} from "@/shared/window-material"

export type ThemePresetColors = {
  accent: string | null
  background: string | null
  foreground: string | null
  sidebar?: string
  shell?: string
  diffAdded: string | null
  diffRemoved: string | null
  directive: string | null
}

export type ThemePresetDef = {
  id: string
  name: string
  /** null = 跟随默认样式表配色 */
  light: ThemePresetColors | null
  dark: ThemePresetColors | null
}

const PRESET_COLORS_EMPTY: ThemePresetColors = {
  accent: null,
  background: null,
  foreground: null,
  diffAdded: null,
  diffRemoved: null,
  directive: null,
}

export const THEME_PRESETS: readonly ThemePresetDef[] = [
  {
    id: "chatgpt",
    name: "ChatGPT",
    light: {
      ...PRESET_COLORS_EMPTY,
      accent: "#0169cc",
      background: "#ffffff",
      foreground: "#1a1c1f",
      sidebar: "#ffffff",
      shell: "#f7f7f7",
      directive: "#0169cc",
    },
    dark: {
      ...PRESET_COLORS_EMPTY,
      accent: "#0169cc",
      background: "#111111",
      foreground: "#fcfcfc",
      sidebar: "#151515",
      shell: "#1d1d1d",
      directive: "#0169cc",
    },
  },
  {
    id: "claude",
    name: "Claude",
    light: {
      ...PRESET_COLORS_EMPTY,
      accent: "#cc7d5e",
      background: "#f9f9f7",
      foreground: "#2d2d2b",
      sidebar: "#f9f9f7",
      shell: "#f2f2f0",
      diffAdded: "#00c853",
      diffRemoved: "#ff5f38",
      directive: "#cc7d5e",
    },
    dark: {
      ...PRESET_COLORS_EMPTY,
      accent: "#cc7d5e",
      background: "#2d2d2b",
      foreground: "#f9f9f7",
      sidebar: "#31312f",
      shell: "#383836",
      diffAdded: "#00c853",
      diffRemoved: "#ff5f38",
      directive: "#cc7d5e",
    },
  },
  {
    id: "workbuddy",
    name: "WorkBuddy",
    light: {
      ...PRESET_COLORS_EMPTY,
      accent: "#0169cc",
      background: "#ffffff",
      foreground: "#0d0d0d",
      sidebar: "#ffffff",
      shell: "#f7f7f7",
      diffAdded: "#00a240",
      diffRemoved: "#e02e2a",
      directive: "#751ed9",
    },
    dark: {
      ...PRESET_COLORS_EMPTY,
      accent: "#0169cc",
      background: "#111111",
      foreground: "#fcfcfc",
      sidebar: "#151515",
      shell: "#1d1d1d",
      diffAdded: "#00a240",
      diffRemoved: "#e02e2a",
      directive: "#b06dff",
    },
  },
  {
    id: "nord",
    name: "Nord",
    light: {
      ...PRESET_COLORS_EMPTY,
      accent: "#5e81ac",
      background: "#eceff4",
      foreground: "#2e3440",
      sidebar: "#eceff4",
      shell: "#e5e8ed",
      diffAdded: "#a3be8c",
      diffRemoved: "#bf616a",
      directive: "#8c6384",
    },
    dark: {
      ...PRESET_COLORS_EMPTY,
      accent: "#88c0d0",
      background: "#2e3440",
      foreground: "#d8dee9",
      sidebar: "#323743",
      shell: "#383e4a",
      diffAdded: "#a3be8c",
      diffRemoved: "#bf616a",
      directive: "#b48ead",
    },
  },
  {
    id: "solarized",
    name: "Solarized",
    light: {
      ...PRESET_COLORS_EMPTY,
      accent: "#b58900",
      background: "#fdf6e3",
      foreground: "#657b83",
      sidebar: "#fdf6e3",
      shell: "#f5efdc",
      diffAdded: "#859900",
      diffRemoved: "#dc322f",
      directive: "#d33682",
    },
    dark: {
      ...PRESET_COLORS_EMPTY,
      accent: "#d30102",
      background: "#002b36",
      foreground: "#839496",
      sidebar: "#042f39",
      shell: "#0d3640",
      diffAdded: "#859900",
      diffRemoved: "#dc322f",
      directive: "#d33682",
    },
  },
  ...SYNARA_THEME_PRESETS,
]

export type ThemePresetId = string

export const THEME_PRESET_DEFAULT: ThemePresetId = "chatgpt"

export function isThemePresetId(value: unknown): value is ThemePresetId {
  return THEME_PRESETS.some((preset) => preset.id === value)
}

/** 取预设在指定深浅下的色组，未知预设回落默认样式表 */
export function presetColorsFor(
  themeId: ThemePresetId | null | undefined,
  variant: "light" | "dark"
): ThemePresetColors {
  const preset = THEME_PRESETS.find((candidate) => candidate.id === themeId)
  return preset?.[variant] ?? PRESET_COLORS_EMPTY
}

/** 模式解析成实际深浅，跟随系统时问系统 */
export function resolveThemeVariant(
  theme: "light" | "dark" | "system"
): "light" | "dark" {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light"
  }
  return theme
}

export const UI_FONT_STYLE_OPTIONS = [
  { id: "regular", label: "common.regular", weight: 400 },
  { id: "medium", label: "common.medium", weight: 500 },
  { id: "bold", label: "common.bold", weight: 600 },
] as const

export type UiFontStyleId = (typeof UI_FONT_STYLE_OPTIONS)[number]["id"]

export const THEME_CONTRAST_MIN = 0
export const THEME_CONTRAST_MAX = 100
const THEME_CONTRAST_DEFAULT = 60

const MONO_FALLBACK_STACK =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'

export type ThemeCustomization = {
  themeAccent: string | null
  themeBackground: string | null
  themeForeground: string | null
  /** 界面字体族名，null = 系统默认 */
  themeFont: string | null
  themeUiFontStyle: UiFontStyleId | null
  /** 内容字体族名，null = 与界面字体相同 */
  themeContentFont: string | null
  /** 代码字体族名，null = 等宽默认 */
  themeCodeFont: string | null
  themeContrast: number
  themeDiffAdded: string | null
  themeDiffRemoved: string | null
  themeDirectiveColor: string | null
}

/** 全部跟默认走 = 当前配色的 ChatGPT 主题 */
export const THEME_CUSTOM_DEFAULTS: ThemeCustomization = {
  themeAccent: null,
  themeBackground: null,
  themeForeground: null,
  themeFont: null,
  themeUiFontStyle: null,
  themeContentFont: null,
  themeCodeFont: null,
  themeContrast: THEME_CONTRAST_DEFAULT,
  themeDiffAdded: null,
  themeDiffRemoved: null,
  themeDirectiveColor: null,
}

export function normalizeThemeColor(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }
  const hex = value.trim().toLowerCase()
  return /^#[0-9a-f]{6}$/.test(hex) ? hex : null
}

/** 字体族名走系统字体，任意非空文本都接受，导入配置不设白名单 */
export function normalizeThemeFontFamily(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }
  const family = value.trim().slice(0, 120)
  return family ? family : null
}

export function normalizeUiFontStyleId(value: unknown): UiFontStyleId | null {
  return UI_FONT_STYLE_OPTIONS.some((option) => option.id === value)
    ? (value as UiFontStyleId)
    : null
}

export function normalizeThemeContrast(value: unknown): number {
  const contrast = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(contrast)) {
    return THEME_CONTRAST_DEFAULT
  }
  return Math.min(
    THEME_CONTRAST_MAX,
    Math.max(THEME_CONTRAST_MIN, Math.round(contrast))
  )
}

/** 把字体族名拼成带回退的 CSS 字体栈 */
function fontStackFor(family: string, fallback: string): string {
  const safe = family.replace(/["\\]/g, "").trim() || fallback
  return `"${safe}", ${fallback}`
}

function uiFontWeightOf(id: UiFontStyleId): number {
  return UI_FONT_STYLE_OPTIONS.find((option) => option.id === id)?.weight ?? 400
}

/** 探针解析任意 CSS 颜色为十六进制，给颜色输入框展示当前生效色用 */
export function resolveCssHex(cssColor: string): string | null {
  if (typeof document === "undefined") {
    return null
  }
  /* 先用探针把 var() 解析成具体色值 */
  const probe = document.createElement("div")
  probe.style.color = cssColor
  probe.style.position = "absolute"
  probe.style.visibility = "hidden"
  document.body.append(probe)
  const computed = getComputedStyle(probe).color
  probe.remove()
  /* 像素采样归一化 oklch 等现代色彩，canvas 序列化会保留原格式不可靠 */
  const canvas = document.createElement("canvas")
  canvas.width = 1
  canvas.height = 1
  const context = canvas.getContext("2d", { willReadFrequently: true })
  if (!context) {
    return null
  }
  context.fillStyle = "#000000"
  context.fillStyle = computed
  context.fillRect(0, 0, 1, 1)
  const [red, green, blue] = context.getImageData(0, 0, 1, 1).data
  const toHex = (channel: number) =>
    Math.min(255, Math.max(0, channel)).toString(16).padStart(2, "0")
  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`
}

/** 自定义优先、预设色组兜底、再没有才回落样式表的生效色集合 */
export type EffectiveThemeColors = {
  accent: string | null
  background: string | null
  foreground: string | null
  diffAdded: string | null
  diffRemoved: string | null
  directive: string | null
}

export type WindowMaterial = "solid" | "translucent"

/** 半透明依赖 macOS 窗口材质，其他平台回落实心以免出现无法合成的透明层 */
export function resolveWindowMaterial(
  opaqueWindows: boolean,
  platform: string | undefined
): WindowMaterial {
  return !opaqueWindows && platform === "darwin" ? "translucent" : "solid"
}

let lastDesktopWindowMaterial: string | null = null
let desktopMaterialRevision = 0
let windowBlurUnavailable = false
const windowBlurListeners = new Set<() => void>()

export function subscribeWindowBlurStatus(listener: () => void) {
  windowBlurListeners.add(listener)
  return () => {
    windowBlurListeners.delete(listener)
  }
}

export function isWindowBlurUnavailable() {
  return windowBlurUnavailable
}

function updateWindowBlurStatus(unavailable: boolean) {
  if (windowBlurUnavailable === unavailable) return
  windowBlurUnavailable = unavailable
  windowBlurListeners.forEach((listener) => listener())
}

function syncDesktopWindowMaterial(
  material: WindowMaterial,
  blur: number | null
) {
  const desktopMaterial = desktopWindowMaterialFor(material, blur)
  const key = `${desktopMaterial.material}:${desktopMaterial.blurRadius}`
  const setWindowMaterial = window.buddyDesktop?.setWindowMaterial
  if (!setWindowMaterial || lastDesktopWindowMaterial === key) return
  lastDesktopWindowMaterial = key
  const revision = ++desktopMaterialRevision
  void setWindowMaterial(desktopMaterial).then(
    (applied) => {
      if (desktopMaterialRevision !== revision) return
      updateWindowBlurStatus(
        desktopMaterial.material === "translucent" && !applied
      )
    },
    () => {
      if (desktopMaterialRevision !== revision) return
      lastDesktopWindowMaterial = null
      updateWindowBlurStatus(desktopMaterial.material === "translucent")
    }
  )
}

export function effectiveThemeColors(
  custom: ThemeCustomization,
  preset: ThemePresetColors
): EffectiveThemeColors {
  return {
    accent:
      normalizeThemeColor(custom.themeAccent) ??
      normalizeThemeColor(preset.accent),
    background:
      normalizeThemeColor(custom.themeBackground) ??
      normalizeThemeColor(preset.background),
    foreground:
      normalizeThemeColor(custom.themeForeground) ??
      normalizeThemeColor(preset.foreground),
    diffAdded:
      normalizeThemeColor(custom.themeDiffAdded) ??
      normalizeThemeColor(preset.diffAdded),
    diffRemoved:
      normalizeThemeColor(custom.themeDiffRemoved) ??
      normalizeThemeColor(preset.diffRemoved),
    directive:
      normalizeThemeColor(custom.themeDirectiveColor) ??
      normalizeThemeColor(preset.directive),
  }
}

/**
 * 把主题自定义写进文档根：
 * 颜色与对比度只在自定义时注入，未自定义一律还原样式表，保证默认就是现配色
 */
export function applyThemeCustomization(
  custom: ThemeCustomization,
  preset: ThemePresetColors,
  windowAppearance: {
    opaqueWindows: boolean
    translucency: WindowTranslucency
  }
) {
  const root = document.documentElement
  const style = root.style
  const windowMaterial = resolveWindowMaterial(
    windowAppearance.opaqueWindows,
    window.buddyDesktop?.platform
  )
  const translucency = normalizeWindowTranslucency(
    windowAppearance.translucency
  )
  root.dataset.windowMaterial = windowMaterial
  root.dataset.windowTranslucency =
    windowMaterial === "solid"
      ? "none"
      : translucency.sidebarOnly
        ? "sidebar"
        : "window"
  style.setProperty("--app-window-glass-opacity", `${translucency.opacity}%`)
  syncDesktopWindowMaterial(windowMaterial, translucency.blur)
  const colors = effectiveThemeColors(custom, preset)

  const accent = colors.accent
  if (accent) {
    style.setProperty("--link", accent)
    /* 强调色只染高亮面、侧栏选中与焦点环，前景不动保证可读 */
    style.setProperty(
      "--accent",
      `color-mix(in oklch, ${accent} 14%, ${windowMaterial === "translucent" ? "transparent" : "var(--background)"})`
    )
    style.setProperty(
      "--sidebar-accent",
      `color-mix(in oklch, ${accent} 14%, ${windowMaterial === "translucent" ? "transparent" : "var(--sidebar)"})`
    )
    style.setProperty(
      "--ring",
      `color-mix(in oklch, ${accent} 55%, transparent)`
    )
  } else {
    style.removeProperty("--link")
    style.removeProperty("--accent")
    style.removeProperty("--sidebar-accent")
    style.removeProperty("--ring")
  }

  const background = colors.background
  if (background) {
    style.setProperty("--background", background)
    style.setProperty("--app-content-solid", background)
  } else {
    style.removeProperty("--background")
    style.removeProperty("--app-content-solid")
  }

  /* 预设给出外壳分层色，自定义背景时按样式表的深浅规则派生 */
  const customBackground = normalizeThemeColor(custom.themeBackground)
  const sidebar = normalizeThemeColor(preset.sidebar)
  const shell = normalizeThemeColor(preset.shell)
  if (!customBackground && sidebar) {
    style.setProperty("--sidebar", sidebar)
  } else {
    style.removeProperty("--sidebar")
  }
  if (!customBackground && shell) {
    style.setProperty("--app-shell-solid", shell)
  } else {
    style.removeProperty("--app-shell-solid")
  }

  const foreground = colors.foreground
  if (foreground) {
    style.setProperty("--foreground", foreground)
    style.setProperty("--card-foreground", foreground)
    style.setProperty("--popover-foreground", foreground)
    style.setProperty("--sidebar-foreground", foreground)
  } else {
    style.removeProperty("--foreground")
    style.removeProperty("--card-foreground")
    style.removeProperty("--popover-foreground")
    style.removeProperty("--sidebar-foreground")
  }

  /* 字体族默认不注入，未自定义还原样式表里的 Geist */
  const uiFont = normalizeThemeFontFamily(custom.themeFont)
  if (uiFont) {
    style.setProperty("--font-sans", fontStackFor(uiFont, "sans-serif"))
  } else {
    style.removeProperty("--font-sans")
  }
  style.setProperty(
    "--app-ui-font-weight",
    String(uiFontWeightOf(custom.themeUiFontStyle ?? "regular"))
  )

  const contentFont = normalizeThemeFontFamily(custom.themeContentFont)
  if (contentFont) {
    style.setProperty(
      "--app-font-chat-family",
      fontStackFor(contentFont, "sans-serif")
    )
  } else {
    style.removeProperty("--app-font-chat-family")
  }

  /* 代码字体默认系统等宽栈，自定义时挂到等宽回退前 */
  const codeFont = normalizeThemeFontFamily(custom.themeCodeFont)
  if (codeFont) {
    style.setProperty(
      "--app-font-code",
      fontStackFor(codeFont, MONO_FALLBACK_STACK)
    )
  } else {
    style.removeProperty("--app-font-code")
  }

  const contrast = normalizeThemeContrast(custom.themeContrast)
  if (contrast === THEME_CONTRAST_DEFAULT) {
    style.removeProperty("--muted-foreground")
    style.removeProperty("--border")
    style.removeProperty("--sidebar-border")
    style.removeProperty("--surface-border")
  } else {
    /* 对比度拉弱化文字与分隔线的浓度，默认 60 与现配色一致不注入 */
    style.setProperty(
      "--muted-foreground",
      `color-mix(in oklch, var(--foreground) ${25 + contrast * 0.5}%, var(--background))`
    )
    const borderMix = `color-mix(in oklch, var(--foreground) ${(
      contrast * 0.13
    ).toFixed(2)}%, transparent)`
    style.setProperty("--border", borderMix)
    style.setProperty("--sidebar-border", borderMix)
    style.setProperty("--surface-border", borderMix)
  }

  /* 语义色只在自定义或预设给值时覆盖，默认回落样式表 */
  if (colors.diffAdded) {
    style.setProperty("--diff-added", colors.diffAdded)
  } else {
    style.removeProperty("--diff-added")
  }
  if (colors.diffRemoved) {
    style.setProperty("--diff-removed", colors.diffRemoved)
  } else {
    style.removeProperty("--diff-removed")
  }
  if (colors.directive) {
    style.setProperty("--directive", colors.directive)
  } else {
    style.removeProperty("--directive")
  }
}
