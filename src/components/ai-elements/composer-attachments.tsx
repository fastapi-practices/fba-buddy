import type { ComponentProps, ReactNode } from "react"
import { FileTextIcon, XIcon } from "lucide-react"

import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment"
import { Spinner } from "@/components/ui/spinner"
import {
  composerAttachmentMeta,
  type ComposerAttachmentChipData,
} from "@/features/chat/composer-attachments"
import { useT } from "@/hooks/use-t"
import { cn } from "@/lib/utils"

export function ComposerAttachments({
  className,
  ...props
}: ComponentProps<typeof AttachmentGroup>) {
  return (
    <AttachmentGroup
      data-slot="composer-attachments"
      className={cn("py-0 empty:hidden", className)}
      {...props}
    />
  )
}

export function ComposerAttachmentChip({
  attachment,
  onRemove,
  preview,
  className,
  ...props
}: Omit<ComponentProps<typeof Attachment>, "children" | "state"> & {
  attachment: ComposerAttachmentChipData
  onRemove?: (name: string) => void
  preview?: ReactNode
}) {
  const t = useT()
  const meta = composerAttachmentMeta(attachment, {
    uploading: t("common.uploading"),
    error: t("common.uploadFailed"),
  })
  const showImage = attachment.kind === "image" && preview

  return (
    <Attachment
      data-slot="composer-attachment"
      state={attachment.state}
      size="sm"
      className={className}
      {...props}
    >
      <AttachmentMedia variant={showImage ? "image" : "icon"}>
        {showImage ? preview : <FileTextIcon />}
      </AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle>{attachment.name}</AttachmentTitle>
        {meta ? <AttachmentDescription>{meta}</AttachmentDescription> : null}
      </AttachmentContent>
      <AttachmentActions>
        {attachment.state === "uploading" ? (
          <Spinner />
        ) : attachment.state === "done" && onRemove ? (
          <AttachmentAction
            type="button"
            aria-label={t("common.removeAttachment")}
            onClick={() => onRemove(attachment.name)}
          >
            <XIcon />
          </AttachmentAction>
        ) : null}
      </AttachmentActions>
    </Attachment>
  )
}
