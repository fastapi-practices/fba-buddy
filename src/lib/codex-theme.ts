/** codex-theme-v1 主题配置编解码：与 codex 桌面端外观配置完全兼容，双向解析与序列化 */

export type CodexThemeV1 = {
  codeThemeId: string
  theme: {
    accent: string | null
    accentSource: string
    contrast: number
    fonts: { code: string | null; ui: string | null }
    ink: string | null
    opaqueWindows: boolean
    semanticColors: {
      diffAdded: string
      diffRemoved: string
      skill: string
    }
    surface: string | null
  }
  variant: "dark" | "light"
}

const CODEX_THEME_PREFIX = "codex-theme-v1:"

export const CODE_THEME_ID_DEFAULT = "codex"

const SEMANTIC_COLOR_DEFAULTS = {
  light: { diffAdded: "#059669", diffRemoved: "#dc2626", skill: "#2563eb" },
  dark: { diffAdded: "#34d399", diffRemoved: "#f87171", skill: "#60a5fa" },
} as const

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/

function readHex(value: unknown): string | null {
  return typeof value === "string" && HEX_COLOR_PATTERN.test(value.trim())
    ? value.trim().toLowerCase()
    : null
}

function readText(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback
}

function readFontFamily(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

/** 解析导入文本：接受 codex-theme-v1: 前缀写法与裸 JSON 两种形态 */
export function parseCodexThemeV1(text: string): CodexThemeV1 | null {
  const trimmed = text.trim()
  const jsonText = trimmed.startsWith(CODEX_THEME_PREFIX)
    ? trimmed.slice(CODEX_THEME_PREFIX.length)
    : trimmed
  let raw: unknown
  try {
    raw = JSON.parse(jsonText)
  } catch {
    return null
  }
  if (typeof raw !== "object" || raw === null) {
    return null
  }
  const root = raw as Record<string, unknown>
  const theme = root.theme
  if (typeof theme !== "object" || theme === null) {
    return null
  }
  const t = theme as Record<string, unknown>
  const fonts = typeof t.fonts === "object" && t.fonts !== null ? (t.fonts as Record<string, unknown>) : {}
  const semantic =
    typeof t.semanticColors === "object" && t.semanticColors !== null
      ? (t.semanticColors as Record<string, unknown>)
      : {}
  const variant = root.variant
  if (variant !== "dark" && variant !== "light") {
    return null
  }
  const contrast =
    typeof t.contrast === "number" && Number.isFinite(t.contrast)
      ? Math.min(100, Math.max(0, Math.round(t.contrast)))
      : 60
  return {
    codeThemeId: readText(root.codeThemeId, CODE_THEME_ID_DEFAULT),
    theme: {
      accent: readHex(t.accent),
      accentSource: readText(t.accentSource, "custom"),
      contrast,
      fonts: {
        code: readFontFamily(fonts.code),
        ui: readFontFamily(fonts.ui),
      },
      ink: readHex(t.ink),
      opaqueWindows: t.opaqueWindows === true,
      semanticColors: {
        diffAdded: readHex(semantic.diffAdded) ?? SEMANTIC_COLOR_DEFAULTS[variant].diffAdded,
        diffRemoved:
          readHex(semantic.diffRemoved) ?? SEMANTIC_COLOR_DEFAULTS[variant].diffRemoved,
        skill: readHex(semantic.skill) ?? SEMANTIC_COLOR_DEFAULTS[variant].skill,
      },
      surface: readHex(t.surface),
    },
    variant,
  }
}

/** 序列化成 codex 桌面端同款的 codex-theme-v1:{json} 文本 */
export function serializeCodexThemeV1(theme: CodexThemeV1): string {
  return (
    CODEX_THEME_PREFIX +
    JSON.stringify({
      codeThemeId: theme.codeThemeId,
      theme: {
        accent: theme.theme.accent,
        accentSource: theme.theme.accentSource,
        contrast: theme.theme.contrast,
        fonts: { code: theme.theme.fonts.code, ui: theme.theme.fonts.ui },
        ink: theme.theme.ink,
        opaqueWindows: theme.theme.opaqueWindows,
        semanticColors: {
          diffAdded: theme.theme.semanticColors.diffAdded,
          diffRemoved: theme.theme.semanticColors.diffRemoved,
          skill: theme.theme.semanticColors.skill,
        },
        surface: theme.theme.surface,
      },
      variant: theme.variant,
    })
  )
}

/** 我方主题存储字段与 codex 结构之间的映射载体 */
export type CodexThemeFields = {
  themeAccent: string | null
  themeAccentSource: string
  themeBackground: string | null
  themeForeground: string | null
  themeContrast: number
  themeFont: string | null
  themeCodeFont: string | null
  themeDiffAdded: string | null
  themeDiffRemoved: string | null
  themeDirectiveColor: string | null
  themeOpaqueWindows: boolean
  themeCodeThemeId: string
}

export function codexFieldsFromTheme(theme: CodexThemeV1): CodexThemeFields {
  return {
    themeAccent: theme.theme.accent,
    themeAccentSource: theme.theme.accentSource,
    themeBackground: theme.theme.surface,
    themeForeground: theme.theme.ink,
    themeContrast: theme.theme.contrast,
    themeFont: theme.theme.fonts.ui,
    themeCodeFont: theme.theme.fonts.code,
    themeDiffAdded: theme.theme.semanticColors.diffAdded,
    themeDiffRemoved: theme.theme.semanticColors.diffRemoved,
    themeDirectiveColor: theme.theme.semanticColors.skill,
    themeOpaqueWindows: theme.theme.opaqueWindows,
    themeCodeThemeId: theme.codeThemeId,
  }
}

export function codexThemeFromFields(
  fields: CodexThemeFields,
  variant: "dark" | "light"
): CodexThemeV1 {
  const defaults = SEMANTIC_COLOR_DEFAULTS[variant]
  return {
    codeThemeId: fields.themeCodeThemeId || CODE_THEME_ID_DEFAULT,
    theme: {
      accent: fields.themeAccent,
      accentSource: fields.themeAccentSource || (fields.themeAccent ? "custom" : "preset"),
      contrast: fields.themeContrast,
      fonts: { code: fields.themeCodeFont, ui: fields.themeFont },
      ink: fields.themeForeground,
      opaqueWindows: fields.themeOpaqueWindows,
      semanticColors: {
        diffAdded: fields.themeDiffAdded ?? defaults.diffAdded,
        diffRemoved: fields.themeDiffRemoved ?? defaults.diffRemoved,
        skill: fields.themeDirectiveColor ?? defaults.skill,
      },
      surface: fields.themeBackground,
    },
    variant,
  }
}
