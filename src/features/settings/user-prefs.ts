import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

import { useSessionStore } from "@/lib/session"
import { API_V1 } from "@/lib/config"

export type UserChatPrefs = {
  advisor_model: string | null
  mcp_approve_writes: boolean
  memory_enabled: boolean
}

const EMPTY_PREFS: UserChatPrefs = {
  advisor_model: null,
  mcp_approve_writes: false,
  memory_enabled: true,
}

type UserChatPrefsState = {
  byUser: Record<string, Partial<UserChatPrefs>>
  setPrefs: (patch: Partial<UserChatPrefs>) => void
}

export function currentUserPrefsKey(
  userId: number | null | undefined = useSessionStore.getState().user?.id
): string {
  return `${encodeURIComponent(API_V1)}:${userId ?? "anonymous"}`
}

function prefsFrom(stored: Partial<UserChatPrefs> | undefined): UserChatPrefs {
  return {
    advisor_model: stored?.advisor_model ?? EMPTY_PREFS.advisor_model,
    mcp_approve_writes:
      stored?.mcp_approve_writes ?? EMPTY_PREFS.mcp_approve_writes,
    memory_enabled: stored?.memory_enabled ?? EMPTY_PREFS.memory_enabled,
  }
}

function prefsFor(
  byUser: Record<string, Partial<UserChatPrefs>>,
  key: string
): UserChatPrefs {
  return prefsFrom(byUser[key])
}

export const useUserChatPrefsStore = create<UserChatPrefsState>()(
  persist(
    (set) => ({
      byUser: {},
      setPrefs: (patch) =>
        set((state) => {
          const key = currentUserPrefsKey()
          return {
            byUser: {
              ...state.byUser,
              [key]: prefsFrom({
                ...prefsFor(state.byUser, key),
                ...patch,
              }),
            },
          }
        }),
    }),
    {
      name: "fba-buddy.user-chat-prefs",
      storage: createJSONStorage(() =>
        typeof localStorage === "undefined"
          ? {
              getItem: () => null,
              setItem: () => undefined,
              removeItem: () => undefined,
            }
          : localStorage
      ),
    }
  )
)

export function getUserChatPrefs(): UserChatPrefs {
  const key = currentUserPrefsKey()
  return prefsFor(useUserChatPrefsStore.getState().byUser, key)
}

export function useCurrentUserChatPrefs(): UserChatPrefs {
  const byUser = useUserChatPrefsStore((state) => state.byUser)
  const userId = useSessionStore((state) => state.user?.id)
  return prefsFor(byUser, currentUserPrefsKey(userId))
}
