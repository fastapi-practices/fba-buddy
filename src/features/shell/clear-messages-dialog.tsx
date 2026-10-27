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
import { useT } from "@/hooks/use-t"

export function ClearMessagesDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  const t = useT()
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("common.clearMessages")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("hints.thisDeletesEveryMessageInThisChatTheChatItselfIsKept")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              onOpenChange(false)
              onConfirm()
            }}
          >
            {t("common.clear")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
