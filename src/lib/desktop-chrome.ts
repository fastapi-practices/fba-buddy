export const MAC_TRAFFIC_LIGHT_GUTTER_CLASS = "pl-[88px]"

export function isBuddyDesktopMac(): boolean {
  if (typeof window === "undefined") {
    return false
  }
  if (window.buddyDesktop?.platform === "darwin") {
    return true
  }
  const ua = navigator.userAgent
  const isElectron = Boolean(window.buddyDesktop) || ua.includes("Electron")
  const isMac = /Mac|Macintosh|Darwin/i.test(
    `${window.buddyDesktop?.platform ?? ""} ${navigator.platform} ${ua}`
  )
  return isElectron && isMac
}

export function shouldReserveTrafficLightGutter(input: {
  isMacDesktop: boolean
  sidebarOpen: boolean
  isMobile: boolean
}): boolean {
  if (!input.isMacDesktop) {
    return false
  }
  if (input.isMobile) {
    return true
  }
  return !input.sidebarOpen
}
