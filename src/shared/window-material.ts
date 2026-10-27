export const WINDOW_TRANSLUCENCY_OPACITY_MIN = 15
export const WINDOW_TRANSLUCENCY_OPACITY_MAX = 100
export const WINDOW_TRANSLUCENCY_BLUR_MIN = 1
export const WINDOW_TRANSLUCENCY_BLUR_MAX = 64
export const VIBRANCY_EQUIVALENT_BLUR_RADIUS = 30

export type WindowTranslucency = {
  sidebarOnly: boolean
  opacity: number
  blur: number | null
}

export type DesktopWindowMaterial = {
  material: "opaque" | "translucent"
  blurRadius: number
}

export const DEFAULT_WINDOW_TRANSLUCENCY: WindowTranslucency = {
  sidebarOnly: true,
  opacity: 90,
  blur: 64,
}

export function normalizeWindowTranslucency(
  value: unknown
): WindowTranslucency {
  const source =
    typeof value === "object" && value !== null
      ? (value as Partial<Record<keyof WindowTranslucency, unknown>>)
      : {}
  return {
    sidebarOnly:
      typeof source.sidebarOnly === "boolean"
        ? source.sidebarOnly
        : DEFAULT_WINDOW_TRANSLUCENCY.sidebarOnly,
    opacity: normalizeWindowOpacity(source.opacity),
    blur: normalizeWindowBlur(source.blur),
  }
}

function normalizeWindowOpacity(value: unknown): number {
  const opacity = typeof value === "number" ? value : NaN
  if (!Number.isFinite(opacity)) {
    return DEFAULT_WINDOW_TRANSLUCENCY.opacity
  }
  return Math.min(
    WINDOW_TRANSLUCENCY_OPACITY_MAX,
    Math.max(WINDOW_TRANSLUCENCY_OPACITY_MIN, Math.round(opacity))
  )
}

function normalizeWindowBlur(value: unknown): number | null {
  if (value === null) return null
  const blur = typeof value === "number" ? value : NaN
  if (!Number.isFinite(blur)) {
    return DEFAULT_WINDOW_TRANSLUCENCY.blur
  }
  return Math.min(
    WINDOW_TRANSLUCENCY_BLUR_MAX,
    Math.max(WINDOW_TRANSLUCENCY_BLUR_MIN, Math.round(blur))
  )
}

export function normalizeDesktopWindowMaterial(
  value: unknown
): DesktopWindowMaterial | null {
  if (typeof value !== "object" || value === null) return null
  const source = value as Partial<DesktopWindowMaterial>
  if (source.material !== "opaque" && source.material !== "translucent") {
    return null
  }
  const blurRadius = source.blurRadius
  if (typeof blurRadius !== "number" || !Number.isFinite(blurRadius))
    return null
  const min =
    source.material === "translucent" ? WINDOW_TRANSLUCENCY_BLUR_MIN : 0
  return {
    material: source.material,
    blurRadius:
      source.material === "opaque"
        ? 0
        : Math.min(
            WINDOW_TRANSLUCENCY_BLUR_MAX,
            Math.max(min, Math.round(blurRadius))
          ),
  }
}

export function desktopWindowMaterialFor(
  material: "solid" | "translucent",
  blur: number | null
): DesktopWindowMaterial {
  return material === "translucent" && blur !== null
    ? { material: "translucent", blurRadius: normalizeWindowBlur(blur) ?? 0 }
    : { material: "opaque", blurRadius: 0 }
}
