"use client"

import { LocateFixedIcon, PencilIcon } from "lucide-react"

import { TooltipIconButton } from "@/components/ai-elements/tooltip-icon-button"
import { Separator } from "@/components/ui/separator"
import { useMessageScroller } from "@/components/ui/message-scroller"
import { useComposerStore } from "@/features/chat/composer-store"
import { useT } from "@/hooks/use-t"

export function ComposerEditBanner({
  conversationId,
}: {
  conversationId: string | null
}) {
  const t = useT()
  const { scrollToMessage } = useMessageScroller()
  const editingMessageId = useComposerStore((state) => state.editingMessageId)
  const editingConversationId = useComposerStore(
    (state) => state.editingConversationId
  )

  /* 编辑态只属于所属栏：分屏时另一栏不显示编辑条，定位也就落在正确的栏 */
  if (!editingMessageId || editingConversationId !== conversationId) {
    return null
  }

  return (
    <div data-slot="composer-edit-banner" className="-mx-2 -mt-2 flex flex-col">
      <div className="flex items-center justify-between px-2.5 py-1.5">
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <PencilIcon className="size-3.5" />
          {t("common.editing")}
        </span>
        <TooltipIconButton
          type="button"
          side="top"
          tooltip={t("common.jumpToOriginalMessage")}
          aria-label={t("common.jumpToOriginalMessage")}
          className="text-muted-foreground"
          onClick={() => {
            scrollToMessage(editingMessageId, {
              align: "center",
              behavior: "smooth",
            })
            useComposerStore.getState().flashLocate(editingMessageId)
          }}
        >
          <LocateFixedIcon />
        </TooltipIconButton>
      </div>
      <Separator />
    </div>
  )
}
