"use client"

import { memo, useState, type FC } from "react"
import {
  BracesIcon,
  DownloadIcon,
  EyeIcon,
  FileIcon,
  FileTextIcon,
  ImageIcon,
  MusicIcon,
  VideoIcon,
} from "lucide-react"
import { FilePreview } from "./file-preview"
import { MediaPreview } from "./media-preview"
import { useT } from "@/hooks/use-t"
import type { FileMessagePart } from "@/features/chat/thread-types"
import { downloadMediaSource } from "@/features/chat/media-transfer"
import {
  base64ByteSize,
  formatAttachmentSize,
  formatMimeLabel,
} from "@/features/chat/attachments"
import { toast } from "@/components/ui/toast"
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
} from "@/components/ui/attachment"

function getMimeTypeIcon(mimeType: string): FC<{ className?: string }> {
  const type = mimeType.toLowerCase()
  if (type.startsWith("image/")) {
    return ImageIcon
  }
  if (type === "application/pdf") {
    return FileTextIcon
  }
  if (type === "application/json") {
    return BracesIcon
  }
  if (type.startsWith("text/")) {
    return FileTextIcon
  }
  if (type.startsWith("audio/")) {
    return MusicIcon
  }
  if (type.startsWith("video/")) {
    return VideoIcon
  }
  return FileIcon
}

type FileDataKind = "data-uri" | "url" | "base64" | "id"

function getFileDataKind(
  data: string,
  sourceType?: "url" | "id"
): FileDataKind {
  if (sourceType === "url" && /^data:/i.test(data)) return "data-uri"
  if (sourceType) return sourceType
  if (/^data:/i.test(data)) return "data-uri"
  if (/^(https?:\/\/|blob:)/i.test(data)) return "url"
  return "base64"
}

const FileImpl = ({
  filename,
  data,
  mimeType,
  size: sourceSize,
  sourceType,
}: FileMessagePart) => {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const kind = getFileDataKind(data, sourceType)
  const src = kind === "base64" ? `data:${mimeType};base64,${data}` : data
  const available = kind !== "id" && /^(data:|https?:|blob:)/i.test(src)
  const playable = available && /^(audio|video)\//.test(mimeType)
  const previewable =
    available &&
    (playable ||
      mimeType.startsWith("image/") ||
      mimeType.startsWith("text/") ||
      mimeType === "application/pdf" ||
      mimeType === "application/json" ||
      /\.(?:md|csv|tsv|pdf|html?|json|tsx?|jsx?|py|go|rs|ya?ml|toml|sh|css|sql|txt)$/i.test(
        filename ?? ""
      ))
  const size =
    sourceSize && sourceSize > 0
      ? sourceSize
      : kind === "base64" || kind === "data-uri"
        ? base64ByteSize(data)
        : undefined
  const description = available
    ? [
        formatMimeLabel(mimeType),
        size === undefined ? undefined : formatAttachmentSize(size),
      ]
        .filter(Boolean)
        .join(" · ")
    : t("common.fileUnavailable")
  const Icon = getMimeTypeIcon(mimeType)

  const download = async () => {
    if (!available || busy) return
    setBusy(true)
    try {
      await downloadMediaSource(src, filename || "download")
    } catch {
      toast.add({ title: t("common.downloadFailed"), type: "error" })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex max-w-full min-w-0 flex-col gap-2">
      <Attachment
        data-slot="file-attachment"
        state={available ? "done" : "error"}
        className="max-w-full"
      >
        <AttachmentMedia>
          <Icon />
        </AttachmentMedia>
        <AttachmentContent>
          <AttachmentTitle title={filename}>{filename}</AttachmentTitle>
          <AttachmentDescription>{description}</AttachmentDescription>
        </AttachmentContent>
        <AttachmentActions>
          {previewable ? (
            <AttachmentAction
              type="button"
              aria-label={t("common.previewFile")}
              onClick={() => setOpen(true)}
            >
              <EyeIcon />
            </AttachmentAction>
          ) : null}
          {available ? (
            <AttachmentAction
              type="button"
              aria-label={t("common.download")}
              disabled={busy}
              onClick={() => void download()}
            >
              <DownloadIcon />
            </AttachmentAction>
          ) : null}
        </AttachmentActions>
        {previewable ? (
          <AttachmentTrigger
            aria-label={t("common.previewFile")}
            onClick={() => setOpen(true)}
          />
        ) : null}
      </Attachment>
      {playable ? (
        <MediaPreview
          key={src}
          src={src}
          video={mimeType.startsWith("video/")}
          className="max-h-80 max-w-full rounded-lg"
        />
      ) : null}
      {previewable ? (
        <FilePreview
          name={filename ?? "file"}
          mimeType={mimeType}
          src={src}
          open={open}
          onOpenChange={setOpen}
        />
      ) : null}
    </div>
  )
}

const File = memo(FileImpl)

File.displayName = "File"

export { File, getMimeTypeIcon,  }
