import { useAgentMode } from "@/features/chat/conversation-mode"
import { CodeXmlIcon, Settings2Icon } from "lucide-react"

import { openWorkspace } from "@/app/navigation"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ACP_AGENTS } from "@/features/acp/acp-agents"
import { AgentLogo } from "@/features/acp/agent-logo"
import { useComposerStore } from "@/features/chat/composer-store"
import { useT } from "@/hooks/use-t"

export function ComposerAcpSelector() {
  const t = useT()
  const mode = useAgentMode()
  const enabled = useComposerStore((state) => state.enabledAcpRunners)
  const external = useComposerStore((state) => state.acp_runner)
  const selectedId = useComposerStore((state) => state.acp_runner_name)
  const setRunner = useComposerStore((state) => state.setAcpRunnerName)
  const setExternal = useComposerStore((state) => state.setAcpRunner)
  if (mode !== "coding") return null

  const agents = ACP_AGENTS.filter((agent) => enabled.includes(agent.id))
  const selected = external
    ? agents.find((agent) => agent.id === selectedId)
    : undefined
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("common.chooseCodingAgent")}
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 max-w-56 min-w-0 shrink rounded-full data-popup-open:bg-muted"
          />
        }
      >
        {selected ? (
          <span data-icon="inline-start">
            <AgentLogo
              agent={selected}
              className="size-3.5 rounded-none bg-transparent [&>span]:size-3.5"
            />
          </span>
        ) : (
          <CodeXmlIcon data-icon="inline-start" />
        )}
        <span className="min-w-0 truncate">
          {selected?.name ?? t("common.builtInAgent")}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="top"
        className="max-h-64 w-60 max-w-[calc(100vw-2rem)]"
      >
        <DropdownMenuGroup>
          <DropdownMenuRadioGroup
            value={selected?.id ?? "builtin"}
            onValueChange={(value) => {
              if (value === "builtin") setExternal(false)
              else {
                const agent = agents.find((item) => item.id === value)
                if (agent) setRunner(agent.id)
              }
            }}
          >
            <DropdownMenuRadioItem value="builtin" closeOnClick>
              <CodeXmlIcon />
              {t("common.builtInAgent")}
            </DropdownMenuRadioItem>
            {agents.map((agent) => (
              <DropdownMenuRadioItem
                key={agent.id}
                value={agent.id}
                closeOnClick
              >
                <AgentLogo
                  agent={agent}
                  className="size-4 rounded-none bg-transparent [&>span]:size-4"
                />
                {agent.name}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => openWorkspace("acp")}>
            <Settings2Icon />
            {t("common.manageAcp")}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
