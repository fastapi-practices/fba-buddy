import { useQueryClient } from "@tanstack/react-query"
import { BotIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { TooltipHint } from "@/components/ui/tooltip"
import { queryKeys } from "@/api/query-keys"
import {
  selectConversationAssistant,
  useAssistants,
} from "@/features/assistants/assistant-state"
import { useSelectionStore } from "@/features/shell/selection-store"
import { useT } from "@/hooks/use-t"

export function ComposerAssistantChip() {
  const t = useT()
  const queryClient = useQueryClient()
  const selectedAssistantId = useSelectionStore(
    (state) => state.selectedAssistantId
  )
  const assistantsQuery = useAssistants()
  if (selectedAssistantId == null) {
    return null
  }
  const assistant = assistantsQuery.data?.find(
    (item) => item.id === selectedAssistantId
  )
  const name = assistant?.name.trim() || t("common.assistant")
  const label = t("common.removeAssistant")

  return (
    <TooltipHint label={label} side="top">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 max-w-40 shrink-0 rounded-full"
        aria-label={label}
        onClick={() => {
          void selectConversationAssistant(null).then(() => {
            void queryClient.invalidateQueries({
              queryKey: queryKeys.conversations(),
            })
          })
        }}
      >
        <BotIcon data-icon="inline-start" />
        <span className="min-w-0 truncate">{name}</span>
        <XIcon data-icon="inline-end" />
      </Button>
    </TooltipHint>
  )
}
