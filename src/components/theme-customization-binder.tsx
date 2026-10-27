import { useLayoutEffect } from "react"
import { useTheme } from "@/components/theme-provider"
import { usePrefsStore } from "@/features/shell/prefs-store"
import { applyThemeCustomization, presetColorsFor } from "@/lib/theme-custom"

/** 主题自定义注入挂在 ThemeProvider 内部，模式一变就按新深浅重算预设色 */
export function ThemeCustomizationBinder() {
  const { resolvedTheme } = useTheme()
  const themeId = usePrefsStore((state) => state.themeId)
  const themeAccent = usePrefsStore((state) => state.themeAccent)
  const themeBackground = usePrefsStore((state) => state.themeBackground)
  const themeForeground = usePrefsStore((state) => state.themeForeground)
  const themeFont = usePrefsStore((state) => state.themeFont)
  const themeUiFontStyle = usePrefsStore((state) => state.themeUiFontStyle)
  const themeContentFont = usePrefsStore((state) => state.themeContentFont)
  const themeCodeFont = usePrefsStore((state) => state.themeCodeFont)
  const themeContrast = usePrefsStore((state) => state.themeContrast)
  const themeDiffAdded = usePrefsStore((state) => state.themeDiffAdded)
  const themeDiffRemoved = usePrefsStore((state) => state.themeDiffRemoved)
  const themeDirectiveColor = usePrefsStore(
    (state) => state.themeDirectiveColor
  )
  const themeOpaqueWindows = usePrefsStore((state) => state.themeOpaqueWindows)
  const windowTranslucency = usePrefsStore((state) => state.windowTranslucency)

  useLayoutEffect(() => {
    applyThemeCustomization(
      {
        themeAccent,
        themeBackground,
        themeForeground,
        themeFont,
        themeUiFontStyle,
        themeContentFont,
        themeCodeFont,
        themeContrast,
        themeDiffAdded,
        themeDiffRemoved,
        themeDirectiveColor,
      },
      presetColorsFor(themeId, resolvedTheme),
      {
        opaqueWindows: themeOpaqueWindows,
        translucency: windowTranslucency,
      }
    )
  }, [
    resolvedTheme,
    themeId,
    themeAccent,
    themeBackground,
    themeForeground,
    themeFont,
    themeUiFontStyle,
    themeContentFont,
    themeCodeFont,
    themeContrast,
    themeDiffAdded,
    themeDiffRemoved,
    themeDirectiveColor,
    themeOpaqueWindows,
    windowTranslucency,
  ])

  return null
}
