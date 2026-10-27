import { create } from "zustand"
import { persist } from "zustand/middleware"

import {
  CODE_FONT_SIZE_DEFAULT,
  FOLLOW_UP_MODE_DEFAULT,
  normalizeCodeFontSize,
  normalizeFollowUpMode,
  normalizeLocale,
  normalizeUiFontSize,
  UI_FONT_SIZE_DEFAULT,
  type AppLocale,
  type FollowUpMode,
} from "@/lib/general-settings"
import { CODE_THEME_ID_DEFAULT, type CodexThemeFields } from "@/lib/codex-theme"
import { setRuntime } from "@/lib/runtime"
import {
  isThemePresetId,
  normalizeThemeColor,
  normalizeThemeContrast,
  normalizeThemeFontFamily,
  normalizeUiFontStyleId,
  THEME_CUSTOM_DEFAULTS,
  THEME_PRESET_DEFAULT,
  type ThemeCustomization,
  type UiFontStyleId,
} from "@/lib/theme-custom"
import {
  DEFAULT_WINDOW_TRANSLUCENCY,
  normalizeWindowTranslucency,
  type WindowTranslucency,
} from "@/shared/window-material"

type Density = "default" | "compact"
export type RailPinnedItem = "knowledge" | "artifact" | "acp" | "channels"

/** codex-theme-v1 里的透传元数据：随导入导出保留，界面不直接编辑 */
type ThemeCodexMeta = {
  themeCodeThemeId: string
}

const THEME_CODEX_META_DEFAULTS: ThemeCodexMeta = {
  themeCodeThemeId: CODE_THEME_ID_DEFAULT,
}

type PrefsState = {
  sidebarOpen: boolean
  pinnedRailItems: RailPinnedItem[]
  density: Density
  locale: AppLocale
  uiFontSize: number
  codeFontSize: number
  desktopNotifications: boolean
  showContextUsage: boolean
  followUpMode: FollowUpMode
  themeId: string
  themeAccent: ThemeCustomization["themeAccent"]
  themeBackground: ThemeCustomization["themeBackground"]
  themeForeground: ThemeCustomization["themeForeground"]
  themeFont: string | null
  themeUiFontStyle: UiFontStyleId | null
  themeContentFont: string | null
  themeCodeFont: string | null
  themeContrast: number
  themeDiffAdded: string | null
  themeDiffRemoved: string | null
  themeDirectiveColor: string | null
  themeOpaqueWindows: boolean
  themeCodeThemeId: string
  windowTranslucency: WindowTranslucency
  setSidebarOpen: (open: boolean) => void
  toggleRailItem: (item: RailPinnedItem) => void
  setDensity: (density: Density) => void
  setLocale: (locale: AppLocale) => void
  setUiFontSize: (size: number) => void
  setCodeFontSize: (size: number) => void
  setDesktopNotifications: (enabled: boolean) => void
  setShowContextUsage: (enabled: boolean) => void
  setFollowUpMode: (mode: FollowUpMode) => void
  setThemeId: (themeId: string) => void
  setThemeAccent: (value: string | null) => void
  setThemeBackground: (value: string | null) => void
  setThemeForeground: (value: string | null) => void
  setThemeFont: (value: string | null) => void
  setThemeUiFontStyle: (value: string | null) => void
  setThemeContentFont: (value: string | null) => void
  setThemeCodeFont: (value: string | null) => void
  setThemeContrast: (value: number) => void
  setThemeDiffAdded: (value: string | null) => void
  setThemeDiffRemoved: (value: string | null) => void
  setThemeDirectiveColor: (value: string | null) => void
  setThemeOpaqueWindows: (opaque: boolean) => void
  setWindowTranslucency: (patch: Partial<WindowTranslucency>) => void
  /** 主题导入一次性落整套 codex 字段 */
  setThemeFromCodex: (fields: CodexThemeFields) => void
}

function applyRuntime(state: {
  locale: AppLocale
  desktopNotifications: boolean
}) {
  setRuntime({
    locale: state.locale,
    desktopNotifications: state.desktopNotifications,
  })
}

export const usePrefsStore = create<PrefsState>()(
  persist<PrefsState, [], [], Partial<PrefsState>>(
    (set) => ({
      sidebarOpen: true,
      pinnedRailItems: ["channels"],
      density: "default",
      locale: "zh-CN",
      uiFontSize: UI_FONT_SIZE_DEFAULT,
      codeFontSize: CODE_FONT_SIZE_DEFAULT,
      desktopNotifications: true,
      showContextUsage: false,
      followUpMode: FOLLOW_UP_MODE_DEFAULT,
      themeId: THEME_PRESET_DEFAULT,
      themeOpaqueWindows: false,
      ...THEME_CUSTOM_DEFAULTS,
      ...THEME_CODEX_META_DEFAULTS,
      windowTranslucency: DEFAULT_WINDOW_TRANSLUCENCY,
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      toggleRailItem: (item) =>
        set((state) => ({
          pinnedRailItems: state.pinnedRailItems.includes(item)
            ? state.pinnedRailItems.filter((current) => current !== item)
            : [...state.pinnedRailItems, item],
        })),
      setDensity: (density) => set({ density }),
      setLocale: (locale) => {
        const next = normalizeLocale(locale)
        setRuntime({ locale: next })
        set({ locale: next })
      },
      setUiFontSize: (uiFontSize) =>
        set({ uiFontSize: normalizeUiFontSize(uiFontSize) }),
      setCodeFontSize: (codeFontSize) =>
        set({ codeFontSize: normalizeCodeFontSize(codeFontSize) }),
      setDesktopNotifications: (desktopNotifications) => {
        setRuntime({ desktopNotifications })
        set({ desktopNotifications })
      },
      setShowContextUsage: (showContextUsage) => set({ showContextUsage }),
      setFollowUpMode: (mode) =>
        set({ followUpMode: normalizeFollowUpMode(mode) }),
      /* 切主题 = 整套主题属性回到该主题的默认值，字号不属于主题不动 */
      setThemeId: (themeId) =>
        set({
          themeId: isThemePresetId(themeId) ? themeId : THEME_PRESET_DEFAULT,
          themeOpaqueWindows: false,
          ...THEME_CUSTOM_DEFAULTS,
          ...THEME_CODEX_META_DEFAULTS,
          windowTranslucency: DEFAULT_WINDOW_TRANSLUCENCY,
        }),
      setThemeAccent: (value) =>
        set({ themeAccent: normalizeThemeColor(value) }),
      setThemeBackground: (value) =>
        set({ themeBackground: normalizeThemeColor(value) }),
      setThemeForeground: (value) =>
        set({ themeForeground: normalizeThemeColor(value) }),
      setThemeFont: (value) =>
        set({ themeFont: normalizeThemeFontFamily(value) }),
      setThemeUiFontStyle: (value) =>
        set({ themeUiFontStyle: normalizeUiFontStyleId(value) }),
      setThemeContentFont: (value) =>
        set({ themeContentFont: normalizeThemeFontFamily(value) }),
      setThemeCodeFont: (value) =>
        set({ themeCodeFont: normalizeThemeFontFamily(value) }),
      setThemeContrast: (value) =>
        set({ themeContrast: normalizeThemeContrast(value) }),
      setThemeDiffAdded: (value) =>
        set({ themeDiffAdded: normalizeThemeColor(value) }),
      setThemeDiffRemoved: (value) =>
        set({ themeDiffRemoved: normalizeThemeColor(value) }),
      setThemeDirectiveColor: (value) =>
        set({ themeDirectiveColor: normalizeThemeColor(value) }),
      setThemeOpaqueWindows: (themeOpaqueWindows) =>
        set({ themeOpaqueWindows }),
      setWindowTranslucency: (patch) =>
        set((state) => ({
          windowTranslucency: normalizeWindowTranslucency({
            ...state.windowTranslucency,
            ...patch,
          }),
        })),
      setThemeFromCodex: (fields) =>
        set({
          /* 导入视为自定义色，主题退回 ChatGPT 以免预设色兜底盖住导入值 */
          themeId: THEME_PRESET_DEFAULT,
          themeAccent: normalizeThemeColor(fields.themeAccent),
          themeBackground: normalizeThemeColor(fields.themeBackground),
          themeForeground: normalizeThemeColor(fields.themeForeground),
          themeContrast: normalizeThemeContrast(fields.themeContrast),
          themeFont: normalizeThemeFontFamily(fields.themeFont),
          themeCodeFont: normalizeThemeFontFamily(fields.themeCodeFont),
          themeDiffAdded: normalizeThemeColor(fields.themeDiffAdded),
          themeDiffRemoved: normalizeThemeColor(fields.themeDiffRemoved),
          themeDirectiveColor: normalizeThemeColor(fields.themeDirectiveColor),
          themeOpaqueWindows: fields.themeOpaqueWindows === true,
          themeCodeThemeId: fields.themeCodeThemeId || CODE_THEME_ID_DEFAULT,
        }),
    }),
    {
      name: "fba-buddy.ui",
      partialize: (state) => ({
        sidebarOpen: state.sidebarOpen,
        pinnedRailItems: state.pinnedRailItems,
        density: state.density,
        locale: state.locale,
        uiFontSize: state.uiFontSize,
        codeFontSize: state.codeFontSize,
        desktopNotifications: state.desktopNotifications,
        showContextUsage: state.showContextUsage,
        followUpMode: state.followUpMode,
        themeId: state.themeId,
        themeAccent: state.themeAccent,
        themeBackground: state.themeBackground,
        themeForeground: state.themeForeground,
        themeFont: state.themeFont,
        themeUiFontStyle: state.themeUiFontStyle,
        themeContentFont: state.themeContentFont,
        themeCodeFont: state.themeCodeFont,
        themeContrast: state.themeContrast,
        themeDiffAdded: state.themeDiffAdded,
        themeDiffRemoved: state.themeDiffRemoved,
        themeDirectiveColor: state.themeDirectiveColor,
        themeOpaqueWindows: state.themeOpaqueWindows,
        themeCodeThemeId: state.themeCodeThemeId,
        windowTranslucency: state.windowTranslucency,
      }),
      merge: (persisted, current) => {
        const stored = (persisted ?? {}) as Partial<PrefsState>
        return {
          ...current,
          ...stored,
          uiFontSize: normalizeUiFontSize(stored.uiFontSize),
          windowTranslucency: normalizeWindowTranslucency(
            stored.windowTranslucency
          ),
        }
      },
      onRehydrateStorage: () => (state) => {
        if (state) {
          applyRuntime(state)
        }
      },
    }
  )
)
