import type { AppLocale } from "@/lib/general-settings"
import { getLocale } from "@/lib/runtime"
import { EN } from "@/lib/i18n/en"
import { ZH, type TranslationKey } from "@/lib/i18n/zh"

export { EN, ZH }
export type { TranslationKey }
export type TranslationVars = Record<string, string | number>
export type Translator = (key: TranslationKey, vars?: TranslationVars) => string

export function isTranslationKey(value: unknown): value is TranslationKey {
  return typeof value === "string" && Object.hasOwn(ZH, value)
}

export function translate(
  locale: AppLocale,
  key: TranslationKey,
  vars?: TranslationVars
): string {
  const message = locale === "en-US" ? EN[key] : ZH[key]
  return message.replace(/\{([^{}]+)\}/g, (token, name: string) =>
    vars && Object.hasOwn(vars, name) ? String(vars[name]) : token
  )
}

export function translateCurrent(
  key: TranslationKey,
  vars?: TranslationVars
): string {
  return translate(getLocale(), key, vars)
}

export function i18nSearchBlob(
  ...keys: Array<TranslationKey | undefined>
): string {
  return keys
    .flatMap((key) => (key === undefined ? [] : [ZH[key], EN[key]]))
    .join(" ")
    .toLowerCase()
}
