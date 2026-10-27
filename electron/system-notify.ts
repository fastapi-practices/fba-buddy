import { app, BrowserWindow, Notification } from "electron"

/** 通知失败时的可见兜底：Windows/Linux 任务栏闪烁，macOS 弹跳 Dock 图标 */
function alertFallback() {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.flashFrame(true)
    }
  }
  if (process.platform === "darwin" && app.dock) {
    app.dock.bounce("informational")
  }
}

/**
 * 跨端系统通知：不依赖签名与开发者账号。
 * 系统不支持或拒绝展示（macOS 未授权等）时退回窗口闪烁，保证有反馈
 */
export function showSystemNotification(input: {
  title: string
  body: string
  onClick?: () => void
}): boolean {
  if (!Notification.isSupported()) {
    alertFallback()
    return false
  }
  try {
    const notification = new Notification({
      title: input.title.trim() || "FbaBuddy",
      body: input.body.slice(0, 200),
    })
    notification.on("click", () => input.onClick?.())
    notification.on("failed", alertFallback)
    notification.show()
    return true
  } catch {
    alertFallback()
    return false
  }
}
