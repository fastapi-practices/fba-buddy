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

export function ArchiveConversationDialog({
  open,
  generating,
  onOpenChange,
  onConfirm,
}: {
  open: boolean
  generating: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  const t = useT()
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {generating
              ? t("common.archiveAnOngoingChat")
              : t("common.archiveChat")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {generating
              ? t(
                  "hints.archivingWillStopTheCurrentResponseGenerationTheChatWillBeHiddenFromTheListAndYouCanViewOrRestoreItFromArchivedChats"
                )
              : t(
                  "hints.thisChatWillBeHiddenFromTheListYouCanRestoreItFromArchivedChats"
                )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              onOpenChange(false)
              onConfirm()
            }}
          >
            {generating ? t("common.stopAndArchive") : t("common.archive")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
