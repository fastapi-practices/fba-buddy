import { appNavigate } from "@/app/navigation"
import { useAppLocation } from "@/app/use-app-location"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { useT } from "@/hooks/use-t"
import { CUSTOM_NAV_ENTRIES } from "@/features/shell/custom-nav"

/** 自定义分区：助手、专家与各类自建内容的统一入口 */
export function CustomNavSection() {
  const t = useT()
  const location = useAppLocation()

  return (
    <SidebarGroup className="px-3 py-1">
      <SidebarGroupContent>
        <SidebarMenu className="gap-0.5">
          {CUSTOM_NAV_ENTRIES.map((entry) => {
            const active =
              entry.id === "assistant" || entry.id === "expert"
                ? location.route === "assistants" &&
                  location.assistantsSection === entry.id
                : location.route === "workspace" &&
                  location.workspaceKind === entry.id
            return (
              <SidebarMenuItem key={entry.id}>
                <SidebarMenuButton
                  tooltip={t(entry.label)}
                  isActive={active}
                  className="font-medium"
                  onClick={() => appNavigate(entry.path)}
                >
                  <entry.icon />
                  <span>{t(entry.label)}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
