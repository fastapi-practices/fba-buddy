import type { ChatAttachment, OutgoingContentPart } from "@/lib/types"

export function attachmentKind(mime: string): ChatAttachment["kind"] {
  if (mime.startsWith("image/")) {
    return "image"
  }
  if (mime.startsWith("audio/")) {
    return "audio"
  }
  if (mime.startsWith("video/")) {
    return "video"
  }
  return "document"
}

export function dataUrlToBase64(dataUrl: string): string {
  const separator = dataUrl.indexOf(",")
  return separator >= 0 ? dataUrl.slice(separator + 1) : dataUrl
}

export function mapAttachmentToContent(
  attachment: ChatAttachment
): OutgoingContentPart {
  return {
    type: attachment.kind,
    source: {
      type: attachment.url ? "url" : "data",
      value: attachment.url ?? attachment.data,
      mimeType: attachment.mime,
    },
    metadata: {
      filename: attachment.name,
      size: attachment.size,
    },
  }
}

export function buildOutgoingContent(
  text: string,
  attachments: ChatAttachment[]
): string | OutgoingContentPart[] {
  if (attachments.length === 0) {
    return text
  }
  const parts: OutgoingContentPart[] = []
  if (text.trim()) {
    parts.push({ type: "text", text })
  }
  for (const attachment of attachments) {
    parts.push(mapAttachmentToContent(attachment))
  }
  return parts
}

function formatSizeValue(value: number): string {
  return value >= 10
    ? `${Math.round(value)}`
    : value.toFixed(1).replace(/\.0$/, "")
}

export function formatAttachmentSize(size: number): string {
  if (size < 1024) {
    return `${size} B`
  }
  if (size < 1024 * 1024) {
    return `${formatSizeValue(size / 1024)} KB`
  }
  if (size < 1024 * 1024 * 1024) {
    return `${formatSizeValue(size / (1024 * 1024))} MB`
  }
  return `${formatSizeValue(size / (1024 * 1024 * 1024))} GB`
}

export function formatMimeLabel(mimeType: string): string {
  const type = mimeType.toLowerCase()
  if (type === "image/jpeg") {
    return "JPG"
  }
  const subtype = type.split("/")[1]?.split(";")[0]
  if (!subtype) {
    return type.toUpperCase()
  }
  return subtype.replace(/^x-/, "").replace(/\+xml$/, "").toUpperCase()
}

export function base64ByteSize(value: string): number | undefined {
  const comma = value.indexOf(",")
  const header = comma >= 0 ? value.slice(0, comma) : ""
  if (header && !/;base64/i.test(header)) {
    return undefined
  }
  const payload = (comma >= 0 ? value.slice(comma + 1) : value).replace(
    /\s/g,
    ""
  )
  if (!payload || !/^[A-Za-z0-9+/]*={0,2}$/.test(payload)) {
    return undefined
  }
  const padding = (payload.match(/=/g) || []).length
  return Math.floor((payload.length * 3) / 4) - padding
}
