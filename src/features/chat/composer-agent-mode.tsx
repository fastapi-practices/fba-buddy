import type { TranslationKey } from "@/lib/i18n"
import {
  BriefcaseIcon,
  ChevronDownIcon,
  CodeXmlIcon,
  HandIcon,
  MessageCircleIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  type LucideIcon,
} from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useComposerStore } from "@/features/chat/composer-store"
import { useAgentMode } from "./conversation-mode"
import { SIDEBAR_HEADER_TITLE_CLASS } from "@/features/shell/sidebar-style"
import { useT } from "@/hooks/use-t"
import { cn } from "@/lib/utils"
import { type AgentMode, type PermissionMode } from "@/lib/types"

const MODE_TRIGGER_CLASS =
  "flex w-fit max-w-56 shrink-0 items-center gap-1.5 overflow-hidden rounded-full border border-input bg-transparent px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-1 focus-visible:ring-ring/50"

const AGENT_MODES: Array<{
  value: AgentMode
  label: string
  description: TranslationKey
  icon: LucideIcon
}> = [
  {
    value: "chat",
    label: "FbaBuddy Chat",
    description: "common.chatModeHint",
    icon: MessageCircleIcon,
  },
  {
    value: "work",
    label: "FbaBuddy Work",
    description: "common.researchWritingKnowledgeAndArtifacts",
    icon: BriefcaseIcon,
  },
  {
    value: "coding",
    label: "FbaBuddy Coding",
    description: "common.editFilesAndRunCommandsInASandbox",
    icon: CodeXmlIcon,
  },
]

const PERMISSION_MODES: Array<{
  value: PermissionMode
  label: TranslationKey
  description: TranslationKey
  icon: LucideIcon
}> = [
  {
    value: "ask",
    label: "common.askFirst",
    description: "hints.alwaysAskBeforeEditingExternalFilesOrUsingTheInternet",
    icon: HandIcon,
  },
  {
    value: "auto",
    label: "common.approveForMe",
    description: "common.onlyAskForApprovalOnDetectedRiskyActions",
    icon: ShieldCheckIcon,
  },
  {
    value: "full",
    label: "common.fullAccess",
    description:
      "hints.readAndWriteTheWorkspaceRunCommandsAndUseTheInternetWithoutRestriction",
    icon: ShieldAlertIcon,
  },
]

export function AgentModeMenu() {
  const t = useT()
  const agentMode = useComposerStore((state) => state.agent_mode ?? "work")
  const setAgentMode = useComposerStore((state) => state.setAgentMode)
  const current =
    AGENT_MODES.find((item) => item.value === agentMode) ?? AGENT_MODES[0]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          MODE_TRIGGER_CLASS,
          "electron-no-drag gap-1 rounded-md border-0 hover:bg-foreground/[0.06] hover:text-foreground",
          /* 与其余页的侧边栏标题共用内边距与字号 */
          SIDEBAR_HEADER_TITLE_CLASS
        )}
        aria-label={t("common.switchMode")}
      >
        {/* 直接亮出全称，不再缩写成 FbaBuddy */}
        <span className="min-w-0 truncate">{current.label}</span>
        <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="bottom"
        className="w-72"
      >
        <DropdownMenuGroup>
          <DropdownMenuRadioGroup
            value={agentMode}
            onValueChange={(value) => {
              if (value === "chat" || value === "work" || value === "coding")
                setAgentMode(value)
            }}
          >
            {AGENT_MODES.map((item) => (
              <DropdownMenuRadioItem
                key={item.value}
                value={item.value}
                closeOnClick
              >
                <item.icon />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span>{item.label}</span>
                  <span
                    data-slot="mode-desc"
                    className="text-xs font-normal text-muted-foreground"
                  >
                    {t(item.description)}
                  </span>
                </span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function ComposerCodingPermissionMenu() {
  const t = useT()
  const coding = useAgentMode() === "coding"
  const permissionMode = useComposerStore(
    (state) => state.permission_mode ?? "ask"
  )
  const setPermissionMode = useComposerStore((state) => state.setPermissionMode)
  if (!coding) {
    return null
  }
  const full = permissionMode === "full"
  const current =
    PERMISSION_MODES.find((item) => item.value === permissionMode) ??
    PERMISSION_MODES[0]
  const CurrentIcon = current.icon

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          MODE_TRIGGER_CLASS,
          full &&
            "text-orange-600 hover:bg-orange-500/12 hover:text-orange-600 dark:text-orange-400 dark:hover:text-orange-400"
        )}
        aria-label={t("common.permissions")}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <CurrentIcon className="size-3.5 shrink-0" />
          <span className="min-w-0 truncate">{t(current.label)}</span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuGroup>
          <DropdownMenuRadioGroup
            value={permissionMode}
            onValueChange={(value) =>
              setPermissionMode(value as PermissionMode)
            }
          >
            {PERMISSION_MODES.map((item) => (
              <DropdownMenuRadioItem
                key={item.value}
                value={item.value}
                closeOnClick
                className={
                  item.value === "full"
                    ? "text-orange-600 data-[state=checked]:text-orange-600 dark:text-orange-400 dark:data-[state=checked]:text-orange-400"
                    : undefined
                }
              >
                <item.icon />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span>{t(item.label)}</span>
                  <span
                    data-slot="mode-desc"
                    className={
                      item.value === "full"
                        ? "text-xs font-normal text-orange-600/80 dark:text-orange-400/80"
                        : "text-xs font-normal text-muted-foreground"
                    }
                  >
                    {t(item.description)}
                  </span>
                </span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
