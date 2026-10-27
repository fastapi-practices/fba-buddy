import { app } from "electron"

import { showSystemNotification } from "./system-notify"
import { readFileSync } from "node:fs"
import path from "node:path"

import { readDesktopSettings } from "./settings"
import { resolveUpdateFeed, type UpdateFeed } from "./update-feed"

function packageRepositoryUrl() {
  try {
    const pkgPath = path.join(app.getAppPath(), "package.json")
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      repository?: { url?: string } | string
    }
    if (typeof pkg.repository === "string") {
      return pkg.repository
    }
    return pkg.repository?.url
  } catch {
    return undefined
  }
}

function currentUpdateFeed(): UpdateFeed | null {
  return resolveUpdateFeed({
    settingsUrl: readDesktopSettings().updateUrl,
    envUrl: process.env.FBA_BUDDY_UPDATE_URL,
    repositoryUrl: packageRepositoryUrl(),
  })
}

export async function setupAutoUpdate() {
  const feed = currentUpdateFeed()
  if (!app.isPackaged && !process.env.FBA_BUDDY_UPDATE_URL) {
    return
  }
  if (!feed) {
    return
  }

  try {
    const { default: updater } = await import("electron-updater")
    const { autoUpdater } = updater
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.autoRunAppAfterInstall = true
    autoUpdater.disableDifferentialDownload = true
    autoUpdater.setFeedURL(feed)
    autoUpdater.on("error", (error) => {
      console.error("auto-update", error)
    })
    autoUpdater.on("update-downloaded", (info) => {
      showSystemNotification({
        title: "FbaBuddy",
        body: `新版本 ${info.version} 已下载，退出后会自动安装`,
      })
    })
    await autoUpdater.checkForUpdatesAndNotify({
      title: "FbaBuddy",
      body: "发现新版本，正在后台下载",
    })
  } catch (error) {
    console.error("auto-update skipped", error)
  }
}
