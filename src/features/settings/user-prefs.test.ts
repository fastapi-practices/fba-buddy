import { beforeEach, describe, expect, it, vi } from "vitest"
import { createJSONStorage } from "zustand/middleware"

import { useSessionStore } from "@/lib/session"
import {
  currentUserPrefsKey,
  getUserChatPrefs,
  useUserChatPrefsStore,
} from "@/features/settings/user-prefs"

const config = vi.hoisted(() => ({ api: "https://first.example/api/v1" }))
vi.mock("@/lib/config", () => ({
  get API_V1() {
    return config.api
  },
}))

describe("user chat prefs", () => {
  beforeEach(() => {
    config.api = "https://first.example/api/v1"
    useUserChatPrefsStore.setState({ byUser: {} })
    useSessionStore.setState({
      accessToken: "t",
      accessTokenExpireTime: null,
      sessionUuid: "s",
      user: {
        id: 11,
        uuid: "u",
        username: "ada",
        nickname: "Ada",
        avatar: null,
        email: null,
        is_superuser: false,
        is_staff: false,
        is_multi_login: false,
      },
    })
  })

  it("stores advisor and write approval per signed-in user", () => {
    useUserChatPrefsStore.getState().setPrefs({
      advisor_model: "openai/gpt-5",
      mcp_approve_writes: true,
    })
    expect(getUserChatPrefs()).toEqual({
      advisor_model: "openai/gpt-5",
      mcp_approve_writes: true,
      memory_enabled: true,
    })

    useSessionStore.setState({
      user: {
        id: 22,
        uuid: "v",
        username: "bob",
        nickname: "Bob",
        avatar: null,
        email: null,
        is_superuser: false,
        is_staff: false,
        is_multi_login: false,
      },
    })
    expect(getUserChatPrefs()).toEqual({
      advisor_model: null,
      mcp_approve_writes: false,
      memory_enabled: true,
    })
  })

  it("keeps memory preferences separate for each signed-in account", () => {
    useUserChatPrefsStore.getState().setPrefs({ memory_enabled: false })
    expect(getUserChatPrefs().memory_enabled).toBe(false)

    const user = useSessionStore.getState().user!
    useSessionStore.setState({ user: { ...user, id: 22 } })
    expect(getUserChatPrefs().memory_enabled).toBe(true)

    useUserChatPrefsStore.getState().setPrefs({ memory_enabled: false })
    expect(
      useUserChatPrefsStore.getState().byUser[currentUserPrefsKey(22)]
        ?.memory_enabled
    ).toBe(false)
    useSessionStore.setState({ user })
    expect(getUserChatPrefs().memory_enabled).toBe(false)
  })

  it("isolates the same account ID across backends without adopting unscoped preferences", () => {
    const unscoped = { memory_enabled: false, advisor_model: "unscoped/model" }
    useUserChatPrefsStore.setState({
      byUser: { "11": unscoped, local: unscoped },
    })
    expect(getUserChatPrefs()).toEqual({
      advisor_model: null,
      mcp_approve_writes: false,
      memory_enabled: true,
    })

    useUserChatPrefsStore.getState().setPrefs({ advisor_model: "openai/gpt-5" })
    const firstKey = currentUserPrefsKey()
    config.api = "https://second.example/api/v1"
    expect(currentUserPrefsKey()).not.toBe(firstKey)
    expect(getUserChatPrefs().advisor_model).toBeNull()
    useUserChatPrefsStore
      .getState()
      .setPrefs({ advisor_model: "anthropic/claude-sonnet-4.6" })

    config.api = "https://first.example/api/v1"
    expect(getUserChatPrefs().advisor_model).toBe("openai/gpt-5")
    expect(useUserChatPrefsStore.getState().byUser["11"]).toEqual(unscoped)
    expect(useUserChatPrefsStore.getState().byUser.local).toEqual(unscoped)
  })

  it.each([
    { storedMemory: undefined, expected: true },
    { storedMemory: false, expected: false },
  ])(
    "hydrates memory preference $storedMemory from persisted settings",
    async ({ storedMemory, expected }) => {
      const originalStorage = useUserChatPrefsStore.persist.getOptions().storage
      let stored = JSON.stringify({
        state: {
          byUser: {
            [currentUserPrefsKey(11)]: {
              advisor_model: "openai/gpt-5",
              mcp_approve_writes: true,
              memory_enabled: storedMemory,
            },
          },
        },
        version: 0,
      })
      useUserChatPrefsStore.persist.setOptions({
        storage: createJSONStorage(() => ({
          getItem: () => stored,
          setItem: (_name, value) => {
            stored = value
          },
          removeItem: () => undefined,
        })),
      })
      try {
        await useUserChatPrefsStore.persist.rehydrate()
        expect(getUserChatPrefs()).toEqual({
          advisor_model: "openai/gpt-5",
          mcp_approve_writes: true,
          memory_enabled: expected,
        })
        useUserChatPrefsStore.getState().setPrefs({ memory_enabled: false })
        expect(
          JSON.parse(stored).state.byUser[currentUserPrefsKey(11)]
            .memory_enabled
        ).toBe(false)
      } finally {
        useUserChatPrefsStore.persist.setOptions({ storage: originalStorage })
      }
    }
  )
})
