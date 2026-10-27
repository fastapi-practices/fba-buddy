import { CircleHelpIcon } from "lucide-react"

import { Marker, MarkerContent } from "@/components/ui/marker"
import { TooltipHint } from "@/components/ui/tooltip"
import type { ModelCheckpoint } from "@/features/chat/model-checkpoints"
import { useT } from "@/hooks/use-t"

/**
 * 模型切换检查点：对话中途换模型时插在回合之间，
 * 文案末尾的问号说明换模型对上下文缓存与费用的影响
 */
export function ModelCheckpointMarker({
  checkpoint,
}: {
  checkpoint: ModelCheckpoint
}) {
  const t = useT()
  const hint = t("hints.switchingModelMidConversation")
  return (
    <Marker
      variant="separator"
      data-slot="model-checkpoint"
      className="mt-1 mb-3 last:mb-0"
    >
      <MarkerContent className="inline-flex items-center gap-1.5">
        <span>
          {t("chat.modelChangedCheckpoint", {
            from: checkpoint.fromLabel,
            to: checkpoint.toLabel,
          })}
        </span>
        <TooltipHint label={hint}>
          <button
            type="button"
            aria-label={hint}
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <CircleHelpIcon className="size-3.5" />
          </button>
        </TooltipHint>
      </MarkerContent>
    </Marker>
  )
}
