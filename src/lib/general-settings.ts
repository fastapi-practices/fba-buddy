export type AppLocale = "zh-CN" | "en-US"

export type ProxyMode = "system" | "direct" | "custom"

export type FollowUpMode = "queue" | "steer"

export const FOLLOW_UP_MODE_DEFAULT: FollowUpMode = "queue"

// 文字大小共 6 档，默认第二档，界面文字最多放大到 16px，对话正文继续随档位放大
export const UI_FONT_SIZE_STEPS = [13, 14, 15, 16, 17, 18] as const
export const UI_FONT_SIZE_DEFAULT = UI_FONT_SIZE_STEPS[1]
const UI_FONT_SIZE_RENDER_MAX = 16
export const CHAT_FONT_SIZE_STEPS = [14, 15, 16, 18, 20, 23] as const

export const CODE_FONT_SIZE_MIN = 10
export const CODE_FONT_SIZE_MAX = 24
export const CODE_FONT_SIZE_DEFAULT = 12

export function normalizeLocale(value: unknown): AppLocale {
  if (value === "en-US") {
    return "en-US"
  }
  return "zh-CN"
}

export function normalizeUiFontSize(value: unknown): number {
  const size =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : NaN
  if (!Number.isFinite(size)) {
    return UI_FONT_SIZE_DEFAULT
  }
  /* 吸附到最近档位，等距时取小档 */
  return UI_FONT_SIZE_STEPS.reduce((best, step) =>
    Math.abs(step - size) < Math.abs(best - size) ? step : best
  )
}

/** 当前值落在第几档，滑轨按档位序号定位 */
export function uiFontSizeStepIndex(value: unknown): number {
  const size = normalizeUiFontSize(value)
  return UI_FONT_SIZE_STEPS.findIndex((step) => step === size)
}

export function normalizeCodeFontSize(value: unknown): number {
  const size = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(size)) {
    return CODE_FONT_SIZE_DEFAULT
  }
  return Math.min(
    CODE_FONT_SIZE_MAX,
    Math.max(CODE_FONT_SIZE_MIN, Math.round(size))
  )
}

export function normalizeProxyMode(value: unknown): ProxyMode {
  if (value === "direct" || value === "custom") {
    return value
  }
  return "system"
}

export function normalizeFollowUpMode(value: unknown): FollowUpMode {
  if (value === "steer") {
    return "steer"
  }
  return FOLLOW_UP_MODE_DEFAULT
}

export function isValidProxyUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (
      url.protocol === "http:" ||
      url.protocol === "https:" ||
      url.protocol === "socks5:"
    )
  } catch {
    return false
  }
}

export function applyLocale(locale: AppLocale) {
  document.documentElement.lang = locale
}

export function applyUiFontSize(size: number) {
  const normalized = normalizeUiFontSize(size)
  document.documentElement.style.setProperty(
    "--app-font-size-ui",
    `${Math.min(normalized, UI_FONT_SIZE_RENDER_MAX)}px`
  )
  document.documentElement.style.setProperty(
    "--app-font-size-chat",
    `${CHAT_FONT_SIZE_STEPS[uiFontSizeStepIndex(normalized)]}px`
  )
}

export function applyCodeFontSize(size: number) {
  document.documentElement.style.setProperty(
    "--app-font-size-code",
    `${normalizeCodeFontSize(size)}px`
  )
}
