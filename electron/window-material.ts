import type { BrowserWindow } from "electron"

import type { DesktopWindowMaterial } from "../src/shared/window-material"

export const MAC_WINDOW_VIBRANCY = "under-window"

export type WindowMaterialAddon = {
  setBackgroundBlurRadius: (
    nativeWindowHandle: Buffer,
    radius: number
  ) => boolean
}

type MaterialWindow = Pick<
  BrowserWindow,
  "getNativeWindowHandle" | "setVibrancy"
>

export function createWindowMaterialApplier(
  loadAddon: () => WindowMaterialAddon | null
) {
  let addon: WindowMaterialAddon | null | undefined
  return (window: MaterialWindow, input: DesktopWindowMaterial): boolean => {
    if (input.material === "opaque") {
      window.setVibrancy(MAC_WINDOW_VIBRANCY)
      addon?.setBackgroundBlurRadius(window.getNativeWindowHandle(), 0)
      return true
    }
    if (addon === undefined) addon = loadAddon()
    if (addon) {
      window.setVibrancy(null)
      if (
        addon.setBackgroundBlurRadius(
          window.getNativeWindowHandle(),
          input.blurRadius
        )
      ) {
        return true
      }
    }
    window.setVibrancy(MAC_WINDOW_VIBRANCY)
    return false
  }
}
