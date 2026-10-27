import {
  ArchiveIcon,
  BotIcon,
  BrainIcon,
  CpuIcon,
  GitForkIcon,
  KeyboardIcon,
  MonitorIcon,
  SlidersHorizontalIcon,
  TerminalIcon,
} from "lucide-react"

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import {
  filterSettingsNavItems,
  SETTINGS_NAV_GROUPS,
  type SettingsSectionId,
} from "@/features/settings/settings-nav"
import { useSettingsSearchStore } from "@/features/settings/settings-search"
import { SIDEBAR_EMPTY_PLACEHOLDER_CLASS } from "@/features/shell/sidebar-style"
import { useT } from "@/hooks/use-t"

const SECTION_ICONS = {
  general: SlidersHorizontalIcon,
  environment: TerminalIcon,
  worktrees: GitForkIcon,
  assistant: BotIcon,
  models: CpuIcon,
  display: MonitorIcon,
  shortcuts: KeyboardIcon,
  memories: BrainIcon,
  archived: ArchiveIcon,
} as const

type SettingsSidebarProps = {
  activeSection: SettingsSectionId
  onSelectSection: (section: SettingsSectionId) => void
}

export function SettingsSidebar({
  activeSection,
  onSelectSection,
}: SettingsSidebarProps) {
  const t = useT()
  const query = useSettingsSearchStore((state) => state.query)
  const results = filterSettingsNavItems(query)

  return (
    <>
      {SETTINGS_NAV_GROUPS.map((group) => {
        const items = results.filter((item) => item.group === group.id)
        if (items.length === 0) {
          return null
        }
        return (
          <SidebarGroup key={group.id} className="px-3 py-1">
            {/* 设置里的分组标题纯展示，不响应点击也不要悬浮高亮 */}
            <SidebarGroupLabel className="px-2 text-sm font-medium text-muted-foreground">
              {t(group.label)}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {items.map((item) => {
                  const Icon = SECTION_ICONS[item.id]
                  return (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton
                        isActive={item.id === activeSection}
                        onClick={() => onSelectSection(item.id)}
                      >
                        <Icon />
                        <span>{t(item.label)}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )
      })}
      {results.length === 0 ? (
        <SidebarGroup className="px-3 py-1">
          <SidebarGroupContent>
            <p className={SIDEBAR_EMPTY_PLACEHOLDER_CLASS}>
              {t("common.noMatchingSettings")}
            </p>
          </SidebarGroupContent>
        </SidebarGroup>
      ) : null}
    </>
  )
}
