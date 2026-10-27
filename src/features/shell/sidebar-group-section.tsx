import { ChevronDownIcon, ChevronRightIcon } from "lucide-react"
import type { ReactNode } from "react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
} from "@/components/ui/sidebar"
import {
  SIDEBAR_GROUP_LABEL_CLASS,
  SIDEBAR_TRAILING_HOVER_ICON_CLASS,
  SIDEBAR_TRAILING_ICON_CLASS,
  SIDEBAR_TRAILING_SLOT_CLASS,
} from "@/features/shell/sidebar-style"
import { cn } from "@/lib/utils"

export function SidebarGroupSection({
  label,
  open,
  onOpenChange,
  trailing,
  children,
}: {
  label: string
  open: boolean
  onOpenChange: (open: boolean) => void
  trailing?: ReactNode
  children: ReactNode
}) {
  return (
    <SidebarGroup className="px-3 py-1">
      <Collapsible
        open={open}
        onOpenChange={onOpenChange}
        className="group/collapsible flex flex-col gap-0.5"
      >
        <div className="group/label relative">
          <SidebarGroupLabel
            render={<CollapsibleTrigger />}
            className={cn(SIDEBAR_GROUP_LABEL_CLASS, trailing && "pr-16")}
          >
            {label}
            <span
              className={cn(
                SIDEBAR_TRAILING_SLOT_CLASS,
                SIDEBAR_TRAILING_HOVER_ICON_CLASS,
                "group-focus-within/label:opacity-100"
              )}
            >
              <span className={SIDEBAR_TRAILING_ICON_CLASS}>
                {/* 收起朝右、展开朝下，两个图标直接切换而不是旋转 */}
                {open ? <ChevronDownIcon /> : <ChevronRightIcon />}
              </span>
            </span>
          </SidebarGroupLabel>
          {trailing && (
            <span
              className={cn(
                SIDEBAR_TRAILING_SLOT_CLASS,
                SIDEBAR_TRAILING_HOVER_ICON_CLASS,
                "right-8 group-focus-within/label:opacity-100"
              )}
            >
              {trailing}
            </span>
          )}
        </div>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">{children}</SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </Collapsible>
    </SidebarGroup>
  )
}
