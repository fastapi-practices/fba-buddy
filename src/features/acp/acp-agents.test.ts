import { afterEach, describe, expect, it } from "vitest"

import { toForwardedPropsApi } from "@/api/chat-body"
import { ACP_AGENTS, parseAcpLaunchConfig } from "@/features/acp/acp-agents"
import { useComposerStore } from "@/features/chat/composer-store"
import { resolveChatForwardedProps } from "@/features/chat/forwarded-props"

const initial = useComposerStore.getState()
afterEach(() => useComposerStore.setState(initial, true))

describe("ACP launch configuration", () => {
  it("uses the agent command when it speaks ACP, otherwise npx", () => {
    const defaults = Object.fromEntries(
      ACP_AGENTS.map((agent) => [agent.id, agent.defaults])
    )
    expect(defaults.opencode).toEqual({ command: "opencode", args: ["acp"] })
    expect(defaults.cursor_cli).toEqual({ command: "agent", args: ["acp"] })
    expect(defaults.kimi_code).toEqual({ command: "kimi", args: ["acp"] })
    expect(defaults.codebuddy).toEqual({
      command: "codebuddy",
      args: ["--acp"],
    })
    expect(defaults.claude_code).toEqual({
      command: "npx",
      args: ["-y", "@agentclientprotocol/claude-agent-acp"],
    })
    expect(defaults.codex).toEqual({
      command: "npx",
      args: ["-y", "@agentclientprotocol/codex-acp"],
    })
    expect(defaults.pi).toEqual({ command: "npx", args: ["-y", "pi-acp"] })
  })

  it("parses one launch argument per line and rejects malformed launch input", () => {
    expect(parseAcpLaunchConfig(" /opt/agent ", "acp\na b\n\n")).toEqual({
      command: "/opt/agent",
      args: ["acp", "a b"],
    })
    expect(parseAcpLaunchConfig("agent", "  ")).toEqual({
      command: "agent",
      args: [],
    })
    for (const [command, args] of [
      [" ", ""],
      ["agent\nsh", ""],
      ["agent", "x".repeat(4097)],
      ["agent", Array(65).fill("a").join("\n")],
    ]) {
      expect(() => parseAcpLaunchConfig(command, args)).toThrow()
    }
  })

  it("keeps launch commands local and selects only enabled agents", () => {
    const config = {
      command: "/opt/codex-acp",
      args: ["--profile", "my profile"],
    }
    useComposerStore.getState().setAcpRunnerConfig("codex", config)
    expect(useComposerStore.getState().acp_runner).toBe(false)
    useComposerStore.getState().setAcpRunnerEnabled("codex", true)
    useComposerStore.getState().setAcpRunnerEnabled("pi", true)
    expect(useComposerStore.getState().acp_runner).toBe(false)
    useComposerStore.getState().setAcpRunnerName("codex")
    useComposerStore.getState().setAgentMode("coding")
    const outgoing = () =>
      toForwardedPropsApi(
        resolveChatForwardedProps(useComposerStore.getState())
      )
    expect(outgoing()).toMatchObject({
      acpRunnerName: "codex",
    })
    expect(outgoing()).not.toHaveProperty("acpRunnerConfig")
    useComposerStore.getState().setAcpRunnerName("pi")
    expect(outgoing()).not.toHaveProperty("acpRunnerConfig")
    useComposerStore.getState().setAcpRunnerName("codex")
    useComposerStore.getState().setAgentMode("work")
    expect(outgoing()).not.toHaveProperty("acpRunnerConfig")
    useComposerStore.getState().setAgentMode("coding")
    useComposerStore.getState().setAcpRunner(false)
    expect(outgoing()).not.toHaveProperty("acpRunnerConfig")
  })

  it("falls back to the agent default launch config when none is saved", () => {
    useComposerStore.getState().setAgentMode("coding")
    useComposerStore.getState().setAcpRunnerEnabled("pi", true)
    useComposerStore.getState().setAcpRunnerName("pi")
    const props = resolveChatForwardedProps(useComposerStore.getState())
    expect(props.acp_runner).toBe(true)
    expect(props.acp_runner_name).toBe("pi")
    expect(props.acp_runner_config).toEqual({
      command: "npx",
      args: ["-y", "pi-acp"],
    })
  })

  it("prefers a saved launch config over the agent default", () => {
    useComposerStore.getState().setAcpRunnerEnabled("pi", true)
    useComposerStore
      .getState()
      .setAcpRunnerConfig("pi", { command: "/opt/pi", args: ["acp"] })
    useComposerStore.getState().setAcpRunnerName("pi")
    useComposerStore.getState().setAgentMode("coding")
    const props = resolveChatForwardedProps(useComposerStore.getState())
    expect(props.acp_runner_config).toEqual({
      command: "/opt/pi",
      args: ["acp"],
    })
  })

  it("keeps enabled agents independent from selection and excludes disabled runners", () => {
    const store = useComposerStore.getState()
    store.setAgentMode("coding")
    store.setAcpRunnerName("codex")
    expect(useComposerStore.getState().acp_runner).toBe(false)
    store.setAcpRunnerEnabled("codex", true)
    store.setAcpRunnerEnabled("pi", true)
    expect(useComposerStore.getState().enabledAcpRunners).toEqual([
      "codex",
      "pi",
    ])
    expect(useComposerStore.getState().acp_runner_name).toBeNull()
    store.setAcpRunnerName("codex")
    store.setAcpRunnerEnabled("pi", false)
    expect(useComposerStore.getState().acp_runner_name).toBe("codex")
    store.setAcpRunnerEnabled("codex", false)
    expect(
      resolveChatForwardedProps(useComposerStore.getState())
    ).toMatchObject({
      acp_runner: false,
      acp_runner_name: undefined,
      acp_runner_config: undefined,
    })
    store.setAcpRunnerEnabled("codex", true)
    expect(useComposerStore.getState().acp_runner).toBe(false)
  })
})
