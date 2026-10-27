import { XIcon } from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Spinner } from "@/components/ui/spinner"
import { useT } from "@/hooks/use-t"

export function RemoveProjectDialog({
  open,
  name,
  pending,
  disabled,
  onOpenChange,
  onConfirm,
}: {
  open: boolean
  name: string
  pending: boolean
  disabled: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  const t = useT()
  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!pending) onOpenChange(nextOpen)
      }}
    >
      <AlertDialogContent className="sm:max-w-lg">
        <AlertDialogCancel
          variant="ghost"
          size="icon-sm"
          className="absolute top-2 right-2"
          aria-label={t("common.close")}
          disabled={pending}
        >
          <XIcon />
        </AlertDialogCancel>
        <AlertDialogHeader>
          <AlertDialogTitle className="pr-8 wrap-anywhere">
            {t("common.removeProjectTitle", { name })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("common.removeProjectDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel variant="ghost" disabled={pending}>
            {t("common.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending || disabled}
            onClick={onConfirm}
          >
            {pending ? <Spinner data-icon="inline-start" /> : null}
            {t("common.removeProject")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
