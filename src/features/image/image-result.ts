import { extractImageUrls } from "@/features/image/image-options"
import type { ChatAttachment, ChatMessage } from "@/lib/types"

function imageAttachmentUrl(attachment: ChatAttachment): string | null {
  if (attachment.kind !== "image" || attachment.sourceType === "id") return null
  if (attachment.url) return attachment.url
  if (!attachment.data) return null
  return attachment.data.startsWith("data:")
    ? attachment.data
    : `data:${attachment.mime};base64,${attachment.data}`
}

export function imageResultFromMessages(messages: ChatMessage[]) {
  const turnStart =
    messages.findLastIndex((message) => message.role === "user") + 1
  const assistants = messages
    .slice(turnStart)
    .filter((message) => message.role === "assistant")
  const content = assistants
    .map((message) => message.content)
    .filter(Boolean)
    .join("\n\n")
  const attachments = assistants.flatMap((message) =>
    (message.attachments ?? []).flatMap((attachment) => {
      const url = imageAttachmentUrl(attachment)
      return url ? [url] : []
    })
  )
  const failed = assistants.findLast((message) => message.status === "error")
  return {
    content,
    urls: [...new Set([...attachments, ...extractImageUrls(content)])],
    failed: Boolean(failed),
    error: failed ? failed.error || content || undefined : undefined,
  }
}
