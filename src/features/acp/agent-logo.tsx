import type { AcpAgent } from "@/features/acp/acp-agents"
import { cn } from "@/lib/utils"

const AGENT_LOGO_COLORS: Record<AcpAgent["id"], string> = {
  claude_code: "#d97757",
  codex: "#10a37f",
  opencode: "#f97316",
  cursor_cli: "#8b5cf6",
  kimi_code: "#3b82f6",
  codebuddy: "#14b8a6",
  pi: "#eab308",
}

export function AgentLogo({
  agent,
  className,
}: {
  agent: AcpAgent
  className?: string
}) {
  return (
    <span
      className={cn(
        "flex size-12 shrink-0 items-center justify-center",
        className
      )}
      aria-hidden="true"
    >
      <span
        className="size-7 bg-foreground"
        style={{
          backgroundColor: AGENT_LOGO_COLORS[agent.id],
          maskImage: `url("${agent.icon}")`,
          maskSize: "contain",
          maskPosition: "center",
          maskRepeat: "no-repeat",
        }}
      />
    </span>
  )
}
