import {
  formatAttachmentSize,
  formatMimeLabel,
} from "@/features/chat/attachments"

export type ComposerAttachmentStatus = {
  type: string
  reason?: string
  progress?: number
  message?: string
}

export type ComposerAttachmentChipData = {
  name: string
  kind: "image" | "file"
  state: "uploading" | "done" | "error"
  progress?: number
  size?: number
  mime?: string
  errorMessage?: string
}

export function normalizeAttachmentProgress(
  progress: number | undefined
): number | undefined {
  if (progress == null || Number.isNaN(progress)) {
    return undefined
  }
  const percent = progress <= 1 ? progress * 100 : progress
  return Math.max(0, Math.min(100, Math.round(percent)))
}

export function composerAttachmentFromState(input: {
  name: string
  type: string
  size?: number
  mime?: string
  status: ComposerAttachmentStatus
}): ComposerAttachmentChipData {
  const kind = input.type === "image" ? "image" : "file"
  if (input.status.type === "running") {
    return {
      name: input.name,
      kind,
      state: "uploading",
      progress: normalizeAttachmentProgress(input.status.progress),
      size: input.size,
      mime: input.mime,
    }
  }
  if (input.status.type === "incomplete" && input.status.reason === "error") {
    return {
      name: input.name,
      kind,
      state: "error",
      size: input.size,
      mime: input.mime,
      errorMessage: input.status.message,
    }
  }
  return {
    name: input.name,
    kind,
    state: "done",
    size: input.size,
    mime: input.mime,
  }
}

export function composerAttachmentMeta(
  attachment: ComposerAttachmentChipData,
  labels: { uploading: string; error: string }
): string {
  if (attachment.state === "uploading") {
    return attachment.progress != null
      ? `${attachment.progress}%`
      : labels.uploading
  }
  if (attachment.state === "error") {
    return attachment.errorMessage || labels.error
  }
  return [
    attachment.mime ? formatMimeLabel(attachment.mime) : undefined,
    attachment.size != null
      ? formatAttachmentSize(attachment.size)
      : undefined,
  ]
    .filter(Boolean)
    .join(" · ")
}
