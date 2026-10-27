"use client"

import { FileTextIcon, ImageIcon, MusicIcon, VideoIcon } from "lucide-react"
import type { ComponentType, PropsWithChildren } from "react"
import {
  ComposerAttachmentChip,
  ComposerAttachments as ComposerAttachmentsGroup,
} from "@/components/ai-elements/composer-attachments"
import { File } from "./file"
import { Image } from "./image"
import { WorkspaceRefChip } from "@/features/chat/workspace-ref-chip"
import { composerAttachmentFromState } from "@/features/chat/composer-attachments"
import {
  useChatMessage,
  useChatRuntime,
} from "@/features/chat/chat-runtime"
import { AttachmentGroup } from "@/components/ui/attachment"

function attachmentPreview(url: string | undefined, mime: string) {
  if (url) return <img src={url} alt="" className="size-full object-cover" />
  const Icon = mime.startsWith("image/")
    ? ImageIcon
    : mime.startsWith("audio/")
      ? MusicIcon
      : mime.startsWith("video/")
        ? VideoIcon
        : FileTextIcon
  return <Icon className="size-4" />
}

export const ComposerAttachments: ComponentType = () => {
  const runtime = useChatRuntime()
  return (
    <ComposerAttachmentsGroup className="composer-attachments">
      <WorkspaceRefChip />
      {runtime.composer.attachments.map((attachment) => {
        const attachmentView = composerAttachmentFromState({
          name: attachment.name,
          type: attachment.kind === "image" ? "image" : "document",
          size: attachment.size,
          mime: attachment.mime,
          status: { type: "complete" },
        })
        return (
          <ComposerAttachmentChip
            key={attachment.id}
            attachment={attachmentView}
            onRemove={() => runtime.composer.removeAttachment(attachment.id)}
            preview={attachmentPreview(
              attachment.url ??
                (attachment.data
                  ? `data:${attachment.mime};base64,${attachment.data}`
                  : undefined),
              attachment.mime
            )}
          />
        )
      })}
    </ComposerAttachmentsGroup>
  )
}

export const UserMessageAttachments: ComponentType<PropsWithChildren> = ({
  children,
}) => {
  const message = useChatMessage()
  const attachments = message.attachments ?? []
  return (
    <AttachmentGroup className="w-full flex-wrap justify-end overflow-visible py-0 empty:hidden">
      {attachments.flatMap((attachment) =>
        attachment.content.map((part, index) =>
          part.type === "image" ? (
            <Image
              key={`${attachment.id}:${index}`}
              {...part}
              className="has-data-[slot=attachment-content]:w-30"
            />
          ) : (
            <File key={`${attachment.id}:${index}`} {...part} />
          )
        )
      )}
      {children}
    </AttachmentGroup>
  )
}
