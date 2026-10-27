import { afterEach, beforeEach, expect, it, vi } from "vitest"

import type { DesktopSessionPayload } from "@/shared/desktop"
import type { AuthUser } from "@/lib/types"

const user: AuthUser = {
  id: 1,
  uuid: "user-1",
  username: "demo",
  nickname: "Demo",
  avatar: null,
  email: null,
  is_superuser: false,
  is_staff: false,
  is_multi_login: false,
}
const session = {
  accessToken: "token",
  accessTokenExpireTime: "2026-10-14T00:00:00Z",
  sessionUuid: "session",
  user,
}
const sessionKey = "fba-buddy.session"

function storage(value: string | null = null) {
  return {
    getItem: vi.fn(() => value),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  }
}

function desktop(stored: DesktopSessionPayload | null = null) {
  return {
    loadSession: vi.fn(async () => stored),
    saveSession: vi.fn(async () => true),
    clearSession: vi.fn(async () => true),
  }
}

beforeEach(() => vi.resetModules())
afterEach(() => vi.unstubAllGlobals())

it("loads the desktop session directly from secure storage", async () => {
  const secure = desktop(session)
  const web = storage()
  vi.stubGlobal("window", { buddyDesktop: secure })
  vi.stubGlobal("localStorage", web)
  const { useSessionStore, getAccessToken } = await import("./session")
  await vi.waitFor(() =>
    expect(useSessionStore.persist.hasHydrated()).toBe(true)
  )
  expect(useSessionStore.getState()).toMatchObject(session)
  expect(getAccessToken()).toBe(session.accessToken)
  expect(secure.loadSession).toHaveBeenCalledOnce()
  expect(secure.saveSession).not.toHaveBeenCalled()
  expect(web.getItem).not.toHaveBeenCalled()
})

it("keeps an empty desktop session empty even when the web session exists", async () => {
  const secure = desktop()
  const web = storage(JSON.stringify({ state: session, version: 0 }))
  vi.stubGlobal("window", { buddyDesktop: secure })
  vi.stubGlobal("localStorage", web)
  const { useSessionStore, getAccessToken } = await import("./session")
  await vi.waitFor(() =>
    expect(useSessionStore.persist.hasHydrated()).toBe(true)
  )
  expect(getAccessToken()).toBeNull()
  expect(useSessionStore.getState().user).toBeNull()
  expect(secure.saveSession).not.toHaveBeenCalled()
  expect(web.getItem).not.toHaveBeenCalled()
  expect(web.removeItem).not.toHaveBeenCalled()
})

it("saves, refreshes and clears desktop sessions through secure storage", async () => {
  const secure = desktop()
  const web = storage()
  vi.stubGlobal("window", { buddyDesktop: secure })
  vi.stubGlobal("localStorage", web)
  const { useSessionStore } = await import("./session")
  await vi.waitFor(() =>
    expect(useSessionStore.persist.hasHydrated()).toBe(true)
  )
  useSessionStore.getState().setSession(session)
  expect(secure.saveSession).toHaveBeenLastCalledWith(session)
  const replacement = {
    accessToken: "replacement-token",
    accessTokenExpireTime: "2026-10-15T00:00:00Z",
    sessionUuid: "replacement-session",
  }
  useSessionStore.getState().setSession(replacement)
  expect(secure.saveSession).toHaveBeenLastCalledWith({ ...replacement, user })
  useSessionStore.getState().clearSession()
  expect(useSessionStore.getState()).toMatchObject({
    accessToken: null,
    accessTokenExpireTime: null,
    sessionUuid: null,
    user: null,
  })
  expect(secure.saveSession).toHaveBeenLastCalledWith({
    accessToken: null,
    accessTokenExpireTime: null,
    sessionUuid: null,
    user: null,
  })
  await useSessionStore.persist.clearStorage()
  expect(secure.clearSession).toHaveBeenCalledOnce()
  expect(web.setItem).not.toHaveBeenCalled()
  expect(web.removeItem).not.toHaveBeenCalled()
})

it("keeps secure storage read failures from loading the web session", async () => {
  const secure = desktop()
  secure.loadSession.mockRejectedValue(new Error("secure storage unavailable"))
  const web = storage(JSON.stringify({ state: session, version: 0 }))
  vi.stubGlobal("window", { buddyDesktop: secure })
  vi.stubGlobal("localStorage", web)
  const { useSessionStore, getAccessToken } = await import("./session")
  await useSessionStore.persist.rehydrate()
  expect(getAccessToken()).toBeNull()
  expect(web.getItem).not.toHaveBeenCalled()
  expect(secure.saveSession).not.toHaveBeenCalled()
})

it("loads, saves and clears the web session in local storage", async () => {
  const web = storage(JSON.stringify({ state: session, version: 0 }))
  vi.stubGlobal("window", {})
  vi.stubGlobal("localStorage", web)
  const { useSessionStore, getAccessToken } = await import("./session")
  await vi.waitFor(() =>
    expect(useSessionStore.persist.hasHydrated()).toBe(true)
  )
  expect(getAccessToken()).toBe(session.accessToken)
  expect(web.getItem).toHaveBeenCalledWith(sessionKey)
  useSessionStore.getState().setSession({
    ...session,
    accessToken: "replacement-token",
  })
  expect(web.setItem).toHaveBeenLastCalledWith(
    sessionKey,
    JSON.stringify({
      state: { ...session, accessToken: "replacement-token" },
      version: 0,
    })
  )
  await useSessionStore.persist.clearStorage()
  expect(web.removeItem).toHaveBeenCalledWith(sessionKey)
})
