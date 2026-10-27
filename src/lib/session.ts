import { create } from "zustand"
import {
  createJSONStorage,
  persist,
  type StateStorage,
} from "zustand/middleware"

import type { DesktopSessionPayload } from "@/shared/desktop"
import type { AuthUser } from "@/lib/types"

type SessionState = {
  accessToken: string | null
  accessTokenExpireTime: string | null
  sessionUuid: string | null
  user: AuthUser | null
  setSession: (payload: {
    accessToken: string
    accessTokenExpireTime: string
    sessionUuid: string
    user?: AuthUser | null
  }) => void
  clearSession: () => void
}

const SESSION_KEY = "fba-buddy.session"

function desktopApi() {
  return typeof window === "undefined" ? undefined : window.buddyDesktop
}

function webStorage() {
  return typeof localStorage === "undefined" ? null : localStorage
}

const sessionStorageAdapter: StateStorage = {
  getItem: async (name) => {
    const desktop = desktopApi()
    if (desktop) {
      const stored = await desktop.loadSession()
      return stored ? JSON.stringify({ state: stored, version: 0 }) : null
    }
    return webStorage()?.getItem(name) ?? null
  },
  setItem: async (name, value) => {
    const desktop = desktopApi()
    if (desktop) {
      const parsed = JSON.parse(value) as { state: DesktopSessionPayload }
      await desktop.saveSession(parsed.state)
      return
    }
    webStorage()?.setItem(name, value)
  },
  removeItem: async (name) => {
    const desktop = desktopApi()
    if (desktop) {
      await desktop.clearSession()
      return
    }
    webStorage()?.removeItem(name)
  },
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      accessTokenExpireTime: null,
      sessionUuid: null,
      user: null,
      setSession: (payload) =>
        set({
          accessToken: payload.accessToken,
          accessTokenExpireTime: payload.accessTokenExpireTime,
          sessionUuid: payload.sessionUuid,
          user: payload.user ?? get().user,
        }),
      clearSession: () =>
        set({
          accessToken: null,
          accessTokenExpireTime: null,
          sessionUuid: null,
          user: null,
        }),
    }),
    {
      name: SESSION_KEY,
      storage: createJSONStorage(() => sessionStorageAdapter),
      partialize: (state) => ({
        accessToken: state.accessToken,
        accessTokenExpireTime: state.accessTokenExpireTime,
        sessionUuid: state.sessionUuid,
        user: state.user,
      }),
    }
  )
)

export function getAccessToken() {
  return useSessionStore.getState().accessToken
}
