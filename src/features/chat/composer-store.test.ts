import { beforeEach, describe, expect, it, vi } from "vitest"

const saved = vi.hoisted(() => new Map<string, string>())

vi.mock("@/lib/account-source", () => ({
  sourceStorage: {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => saved.set(key, value),
    removeItem: (key: string) => saved.delete(key),
  },
}))

import { useComposerStore } from "@/features/chat/composer-store"

beforeEach(() => {
  useComposerStore.setState(useComposerStore.getInitialState(), true)
  saved.clear()
})

describe("composer preferences", () => {
  it("persists the selected draft mode and keeps the draft across all three modes", async () => {
    const state = useComposerStore.getState()
    state.setDraft("Keep this draft")
    state.setAgentMode("chat")
    state.setAgentMode("coding")
    expect(useComposerStore.getState()).toMatchObject({
      agent_mode: "coding",
      draft: "Keep this draft",
    })
    const persisted = saved.get("fba-buddy.composer")!
    useComposerStore.setState(useComposerStore.getInitialState(), true)
    saved.set("fba-buddy.composer", persisted)
    await useComposerStore.persist.rehydrate()
    expect(useComposerStore.getState().agent_mode).toBe("coding")
    useComposerStore.getState().setAgentMode("work")
    useComposerStore.getState().setAgentMode("chat")
    expect(useComposerStore.getState().agent_mode).toBe("chat")
    expect(useComposerStore.getState().draft).toBe("")
  })
  it("starts with the built-in agent and no enabled external runners", () => {
    expect(useComposerStore.getState()).toMatchObject({
      agent_mode: "work",
      permission_mode: "ask",
      acp_runner: false,
      acp_runner_name: null,
      enabledAcpRunners: [],
      alwaysAllowedTools: [],
    })
  })

  it("restores the selected runner, available agents and model settings", async () => {
    const state = useComposerStore.getState()
    state.setModel(3, "chat-model")
    state.setThinkingMode("high")
    state.setPermissionMode("auto")
    state.setAcpRunnerEnabled("pi", true)
    state.setAcpRunnerEnabled("codex", true)
    state.setAcpRunnerName("pi")
    state.grantAlwaysAllowedTool("read_file")
    const persisted = saved.get("fba-buddy.composer")!
    useComposerStore.setState(useComposerStore.getInitialState(), true)
    saved.set("fba-buddy.composer", persisted)

    await useComposerStore.persist.rehydrate()

    expect(useComposerStore.getState()).toMatchObject({
      provider_id: 3,
      model_id: "chat-model",
      thinking: "high",
      permission_mode: "auto",
      acp_runner: true,
      acp_runner_name: "pi",
      enabledAcpRunners: ["pi", "codex"],
      alwaysAllowedTools: ["read_file"],
    })
  })

  it("returns to the built-in agent when the selected runner is disabled", () => {
    const state = useComposerStore.getState()
    state.setAcpRunnerEnabled("pi", true)
    state.setAcpRunnerName("pi")
    state.setAcpRunnerEnabled("pi", false)

    expect(useComposerStore.getState()).toMatchObject({
      acp_runner: false,
      acp_runner_name: null,
      enabledAcpRunners: [],
    })
  })

  it("keeps an unsent draft out of persisted preferences", async () => {
    useComposerStore.getState().setDraft("Unsent message")
    const persisted = saved.get("fba-buddy.composer")!
    useComposerStore.setState(useComposerStore.getInitialState(), true)
    saved.set("fba-buddy.composer", persisted)

    await useComposerStore.persist.rehydrate()

    expect(useComposerStore.getState().draft).toBe("")
    expect(JSON.parse(persisted).state).not.toHaveProperty("draft")
  })
})
