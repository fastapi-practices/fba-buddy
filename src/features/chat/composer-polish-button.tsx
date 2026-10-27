import { translateCurrent } from "@/lib/i18n"
import { SparklesIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import {
  polishComposerDraft,
  usePolishStore,
} from "@/features/chat/composer-polish"
import { useComposerStore } from "@/features/chat/composer-store"
import { TooltipHint } from "@/components/ui/tooltip"
import { useT } from "@/hooks/use-t"
import { apiErrorMessage } from "@/api/http"

export function ComposerPolishButton() {
  const t = useT()
  const draft = useComposerStore((state) => state.draft)
  const pending = usePolishStore((state) => state.pending)

  async function polish() {
    const text = draft.trim()
    if (!text) {
      toast.add({ title: t("common.enterTextToPolishFirst"), type: "error" })
      return
    }
    try {
      const result = await polishComposerDraft(text)
      if (result !== null) {
        toast.add({
          title: t("common.draftPolishedNotSavedToHistory"),
          type: "success",
        })
      }
    } catch (error) {
      toast.add({
        title: apiErrorMessage(
          error,
          translateCurrent("common.couldNotPolish")
        ),
        type: "error",
      })
    }
  }

  return (
    <TooltipHint
      label={t(pending ? "common.polishing" : "common.polish")}
      side="top"
    >
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-7 rounded-full"
        aria-label={t(pending ? "common.polishing" : "common.polish")}
        disabled={!draft.trim() || pending}
        onClick={() => void polish()}
      >
        {pending ? <Spinner /> : <SparklesIcon />}
      </Button>
    </TooltipHint>
  )
}
