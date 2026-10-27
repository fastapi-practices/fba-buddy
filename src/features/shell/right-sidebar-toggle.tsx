import { PanelRightIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TooltipHint } from "@/components/ui/tooltip"
import { useT } from "@/hooks/use-t"
import { cn } from "@/lib/utils"
import { useRightSidebar, useRightSidebarStore } from "./right-sidebar-store"
import { NAVBAR_ICON_CLASS } from "./sidebar-style"

export function RightSidebarToggle({
  hostKey,
  panelId,
}: {
  hostKey: string
  panelId?: string
}) {
  const t = useT()
  const sidebar = useRightSidebar(hostKey)
  return (
    <TooltipHint
      label={t(
        sidebar.open ? "common.rightSidebarCollapse" : "common.rightSidebar"
      )}
      side="top"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={t("common.rightSidebar")}
        aria-expanded={sidebar.open}
        aria-controls={panelId}
        data-active={sidebar.open ? "true" : undefined}
        className={cn(
          NAVBAR_ICON_CLASS,
          sidebar.open && "bg-foreground/[0.08] text-foreground"
        )}
        onClick={() =>
          useRightSidebarStore.getState().setOpen(hostKey, !sidebar.open)
        }
      >
        <PanelRightIcon strokeWidth={1.75} />
      </Button>
    </TooltipHint>
  )
}
