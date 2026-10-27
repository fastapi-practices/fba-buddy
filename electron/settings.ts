import { app, session } from "electron"
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

import type { DesktopProxyMode, DesktopSettings } from "../src/shared/desktop"

const PROXY_MODES = new Set<DesktopProxyMode>(["system", "direct", "custom"])

function desktopSettingsPath() {
  return path.join(app.getPath("userData"), "desktop-settings.json")
}

export function readDesktopSettings(): DesktopSettings {
  try {
    const raw = JSON.parse(readFileSync(desktopSettingsPath(), "utf8")) as {
      openAtLogin?: unknown
      proxyMode?: unknown
      proxyUrl?: unknown
      updateUrl?: unknown
    }
    return {
      openAtLogin: raw.openAtLogin === true,
      proxyMode: PROXY_MODES.has(raw.proxyMode as DesktopProxyMode)
        ? (raw.proxyMode as DesktopProxyMode)
        : "system",
      proxyUrl: typeof raw.proxyUrl === "string" ? raw.proxyUrl : "",
      updateUrl: typeof raw.updateUrl === "string" ? raw.updateUrl : "",
    }
  } catch {
    return {
      openAtLogin: false,
      proxyMode: "system",
      proxyUrl: "",
      updateUrl: "",
    }
  }
}

export function writeDesktopSettings(next: DesktopSettings) {
  writeFileSync(desktopSettingsPath(), JSON.stringify(next, null, 2))
}

export async function applyProxy(settings: DesktopSettings) {
  if (settings.proxyMode === "direct") {
    await session.defaultSession.setProxy({ mode: "direct" })
    return
  }
  if (settings.proxyMode === "custom" && settings.proxyUrl.trim()) {
    await session.defaultSession.setProxy({
      proxyRules: settings.proxyUrl.trim(),
      proxyBypassRules: "localhost,127.0.0.1,<local>",
    })
    return
  }
  await session.defaultSession.setProxy({ mode: "system" })
}

export function normalizeProxyPayload(payload: {
  mode?: unknown
  url?: unknown
}): Pick<DesktopSettings, "proxyMode" | "proxyUrl"> {
  return {
    proxyMode: PROXY_MODES.has(payload.mode as DesktopProxyMode)
      ? (payload.mode as DesktopProxyMode)
      : "system",
    proxyUrl: typeof payload.url === "string" ? payload.url : "",
  }
}
