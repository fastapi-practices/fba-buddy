import { BrowserWindow, Menu, clipboard, session, shell } from "electron"
import { randomUUID } from "node:crypto"
import { backgroundDesktopSmoke } from "./background-smoke"

const windows = new Map<number, Set<BrowserWindow>>()

export function webPreviewUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 8192)
    throw new Error("无效的网页地址")
  const url = new URL(value)
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("仅支持 HTTP 和 HTTPS 网页预览")
  return url.href
}

export async function openWebPreview(owner: BrowserWindow, input: unknown) {
  const url = webPreviewUrl(input)
  const owned = windows.get(owner.id) ?? new Set<BrowserWindow>()
  if (owned.size >= 4) throw new Error("请先关闭一个网页预览窗口")
  windows.set(owner.id, owned)
  const isolatedSession = session.fromPartition(`preview-${randomUUID()}`)
  isolatedSession.setPermissionCheckHandler(() => false)
  isolatedSession.setPermissionRequestHandler((_contents, _permission, reply) =>
    reply(false)
  )
  isolatedSession.on("will-download", (event) => event.preventDefault())
  const preview = new BrowserWindow({
    parent: owner,
    width: 1100,
    height: 800,
    minWidth: 480,
    minHeight: 320,
    title: url,
    autoHideMenuBar: true,
    show: !backgroundDesktopSmoke,
    focusable: !backgroundDesktopSmoke,
    skipTaskbar: backgroundDesktopSmoke,
    webPreferences: {
      session: isolatedSession,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      navigateOnDragDrop: false,
      safeDialogs: true,
      backgroundThrottling: !backgroundDesktopSmoke,
      disableDialogs: backgroundDesktopSmoke,
    },
  })
  owned.add(preview)
  const contents = preview.webContents
  const allowed = (candidate: string) => {
    try {
      webPreviewUrl(candidate)
      return true
    } catch {
      return false
    }
  }
  contents.setWindowOpenHandler(() => ({ action: "deny" }))
  const guard = (event: Electron.Event, target: string) => {
    if (!allowed(target)) event.preventDefault()
  }
  contents.on("will-navigate", guard)
  contents.on("will-redirect", guard)
  contents.on("will-frame-navigate", (event) => guard(event, event.url))
  preview.on("page-title-updated", (event) => {
    event.preventDefault()
    preview.setTitle(contents.getURL())
  })
  contents.on("did-navigate", (_event, target) => preview.setTitle(target))
  contents.on("did-navigate-in-page", (_event, target, main) => {
    if (main) preview.setTitle(target)
  })
  contents.on("enter-html-full-screen", () => preview.setFullScreen(false))
  contents.on("context-menu", () => {
    if (backgroundDesktopSmoke) return
    const address = contents.getURL()
    Menu.buildFromTemplate([
      { label: address, enabled: false },
      {
        label: "复制网页地址 / Copy URL",
        click: () => clipboard.writeText(address),
      },
      {
        label: "在浏览器中打开 / Open in browser",
        click: () => {
          if (allowed(address)) void shell.openExternal(address)
        },
      },
      { type: "separator" },
      { role: "copy" },
      { label: "刷新 / Reload", click: () => contents.reload() },
      { role: "close" },
    ]).popup({ window: preview })
  })
  const close = () => {
    if (!preview.isDestroyed()) preview.destroy()
  }
  owner.once("closed", close)
  preview.once("closed", () => {
    owner.removeListener("closed", close)
    owned.delete(preview)
    if (!owned.size) windows.delete(owner.id)
    void isolatedSession.clearStorageData().catch(() => {})
  })
  try {
    await preview.loadURL(url)
  } catch (error) {
    close()
    throw error
  }
}
