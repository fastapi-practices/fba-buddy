import { normalizeLocale, type AppLocale } from "@/lib/general-settings"

type AppRuntime = {
  locale: AppLocale
  desktopNotifications: boolean
}

let runtime: AppRuntime = {
  locale: "zh-CN",
  desktopNotifications: true,
}

export function getLocale() {
  return runtime.locale
}

export function getDesktopNotifications() {
  return runtime.desktopNotifications
}

export function setRuntime(next: Partial<AppRuntime>) {
  runtime = {
    locale:
      next.locale === undefined ? runtime.locale : normalizeLocale(next.locale),
    desktopNotifications:
      next.desktopNotifications === undefined
        ? runtime.desktopNotifications
        : next.desktopNotifications,
  }
}
