import { translate } from "@/lib/i18n"
import { getDesktopNotifications, getLocale } from "@/lib/runtime"

export function shouldSendDesktopNotification(input: {
  enabled: boolean
  windowFocused: boolean
}): boolean {
  return input.enabled && !input.windowFocused
}

export function notificationPreview(
  content: string,
  fallback?: string
): string {
  const resolvedFallback =
    fallback ?? translate(getLocale(), "common.replyComplete")
  const text = content.replace(/\s+/g, " ").trim()
  if (!text) {
    return resolvedFallback
  }
  if (text.length <= 120) {
    return text
  }
  return `${text.slice(0, 117)}...`
}

export async function notifyDesktop(input: {
  title: string
  body: string
}): Promise<void> {
  const enabled = getDesktopNotifications()
  const desktop = window.buddyDesktop
  const windowFocused = desktop?.isWindowFocused
    ? await desktop.isWindowFocused()
    : document.hasFocus()

  if (!shouldSendDesktopNotification({ enabled, windowFocused })) {
    return
  }

  const title = input.title.trim() || "FbaBuddy"
  const body = notificationPreview(input.body)

  if (desktop?.notify) {
    /* 主进程通道失败（系统不支持或未授权）时继续走 Web Notification 兜底 */
    const delivered = await desktop.notify({ title, body })
    if (delivered) {
      return
    }
  }

  if (!("Notification" in window) || Notification.permission === "denied") {
    return
  }
  if (Notification.permission === "default") {
    const permission = await Notification.requestPermission()
    if (permission !== "granted") {
      return
    }
  }
  new Notification(title, { body })
}
