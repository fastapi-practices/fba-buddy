import type { TranslationKey } from "@/lib/i18n"
import claudeIcon from "@/assets/agents/claude_code.svg"
import codebuddyIcon from "@/assets/agents/codebuddy.svg"
import codexIcon from "@/assets/agents/codex.svg"
import cursorIcon from "@/assets/agents/cursor_cli.svg"
import kimiIcon from "@/assets/agents/kimi_code.svg"
import opencodeIcon from "@/assets/agents/opencode.svg"
import piIcon from "@/assets/agents/pi.svg"
import type { AcpRunnerName } from "@/lib/types"
import type { AcpLaunchConfig } from "@/lib/types/acp"

export type AcpAgent = {
  id: AcpRunnerName
  name: string
  publisher: string
  description: TranslationKey
  icon: string
  website: string
  defaults: AcpLaunchConfig
}

export const ACP_AGENTS: AcpAgent[] = [
  {
    id: "claude_code",
    name: "Claude Code",
    publisher: "Anthropic",
    description: "common.collaborateOnComplexTasksAcrossYourCodebase",
    icon: claudeIcon,
    website: "https://github.com/agentclientprotocol/claude-agent-acp",
    defaults: {
      command: "npx",
      args: ["-y", "@agentclientprotocol/claude-agent-acp"],
    },
  },
  {
    id: "codex",
    name: "Codex",
    publisher: "OpenAI",
    description: "common.aCodingPartnerForImplementationAndReview",
    icon: codexIcon,
    website: "https://github.com/agentclientprotocol/codex-acp",
    defaults: {
      command: "npx",
      args: ["-y", "@agentclientprotocol/codex-acp"],
    },
  },
  {
    id: "opencode",
    name: "OpenCode",
    publisher: "Anomaly",
    description: "common.anOpenSourceAgentWithMultipleModelProviders",
    icon: opencodeIcon,
    website: "https://opencode.ai",
    defaults: { command: "opencode", args: ["acp"] },
  },
  {
    id: "cursor_cli",
    name: "Cursor",
    publisher: "Cursor",
    description: "common.bringCursorSCodingCapabilitiesToTheTerminal",
    icon: cursorIcon,
    website: "https://cursor.com/docs/cli/acp",
    defaults: { command: "agent", args: ["acp"] },
  },
  {
    id: "kimi_code",
    name: "Kimi Code",
    publisher: "Moonshot AI",
    description: "common.kimiSCodingAgentForTerminalWorkflows",
    icon: kimiIcon,
    website: "https://moonshotai.github.io/kimi-cli/",
    defaults: { command: "kimi", args: ["acp"] },
  },
  {
    id: "codebuddy",
    name: "CodeBuddy",
    publisher: "Tencent Cloud",
    description: "common.anIntelligentCodingAgentFromTencentCloud",
    icon: codebuddyIcon,
    website: "https://www.codebuddy.cn/cli/",
    defaults: { command: "codebuddy", args: ["--acp"] },
  },
  {
    id: "pi",
    name: "Pi",
    publisher: "Pi",
    description: "common.aLightweightExtensibleOpenSourceCodingAgent",
    icon: piIcon,
    website: "https://github.com/svkozak/pi-acp",
    defaults: { command: "npx", args: ["-y", "pi-acp"] },
  },
]

export function parseAcpLaunchConfig(
  command: string,
  argsText: string
): AcpLaunchConfig {
  const value = command.trim()
  if (!value || value.length > 512 || /[\r\n\0]/.test(value)) {
    throw new Error("common.enterAValidLaunchCommand")
  }
  const args = argsText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  if (
    args.length > 64 ||
    args.some((arg) => arg.length > 4096 || arg.includes("\0"))
  ) {
    throw new Error("common.invalidLaunchArgumentsEnterOnePerLine")
  }
  return { command: value, args }
}

export function acpConfigKey(config: AcpLaunchConfig): string {
  return JSON.stringify([config.command, config.args])
}

export function resolveAcpLaunchConfig(
  runner: AcpRunnerName,
  saved: Partial<Record<AcpRunnerName, AcpLaunchConfig>> | undefined
): AcpLaunchConfig | undefined {
  const custom = saved?.[runner]
  if (custom) {
    return { command: custom.command, args: custom.args }
  }
  return ACP_AGENTS.find((agent) => agent.id === runner)?.defaults
}
