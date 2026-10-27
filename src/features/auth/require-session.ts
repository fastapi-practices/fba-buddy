import { appNavigate } from "@/app/navigation"
import { useSessionStore } from "@/lib/session"

export function loginReturnPath(search: string) {
  const path = new URLSearchParams(search).get("returnTo")
  return path &&
    /^\/(?:chat|settings|workspace|image|assistants)(?:\/|\?|$)/.test(path)
    ? path
    : "/chat"
}

export function requestSignIn() {
  const path = window.location.hash.replace(/^#/, "") || "/chat"
  appNavigate(`/auth/login?returnTo=${encodeURIComponent(path)}`)
}

export function ensureAuthenticatedSession() {
  if (useSessionStore.getState().accessToken) return true
  requestSignIn()
  return false
}
