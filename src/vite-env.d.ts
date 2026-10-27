/// <reference types="vite/client" />

import type { BuddyDesktopApi } from "./shared/desktop"

export {}

declare global {
  interface ImportMetaEnv {
    readonly VITE_GLOB_API_URL: string
  }

  interface Window {
    buddyDesktop?: BuddyDesktopApi
  }
}
