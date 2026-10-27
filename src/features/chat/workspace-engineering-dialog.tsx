import { useState } from "react"
import { CheckCheckIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { TooltipHint } from "@/components/ui/tooltip"
import { useT } from "@/hooks/use-t"
import type { WorkspaceTarget } from "@/shared/workspace"
import { WorkspaceEngineering } from "./workspace-engineering"

export function WorkspaceEngineeringDialog({
  target,
}: {
  target: WorkspaceTarget
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <TooltipHint label={t("common.engineeringCheck")}>
        <DialogTrigger
          render={<Button variant="ghost" size="icon-sm" />}
          aria-label={t("common.engineeringCheck")}
          data-slot="workspace-engineering-action"
        >
          <CheckCheckIcon />
        </DialogTrigger>
      </TooltipHint>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{t("common.engineeringCheck")}</DialogTitle>
          <DialogDescription>
            {t("common.engineeringCheckHint")}
          </DialogDescription>
        </DialogHeader>
        {open && <WorkspaceEngineering target={target} />}
      </DialogContent>
    </Dialog>
  )
}
