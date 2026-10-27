import { useCallback } from "react"

import { usePrefsStore } from "@/features/shell/prefs-store"
import {
  translate,
  type TranslationKey,
  type TranslationVars,
} from "@/lib/i18n"

export function useT() {
  const locale = usePrefsStore((state) => state.locale)
  return useCallback(
    (key: TranslationKey, vars?: TranslationVars) =>
      translate(locale, key, vars),
    [locale]
  )
}
