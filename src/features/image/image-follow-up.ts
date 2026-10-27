import { imageResultFromMessages } from "@/features/image/image-result"
import type {
  ChatAttachment,
  ChatMessage,
  ChatSendPayload,
  OutgoingContentPart,
} from "@/lib/types"

export function imageFollowUpMessage(prompt: string, history: ChatMessage[]) {
  let previous: ChatMessage[] = []
  let urls: string[] = []
  let end = history.length
  for (let index = history.length - 1; index >= -1; index--) {
    if (index >= 0 && history[index]?.role !== "user") continue
    previous = history.slice(index + 1, end)
    urls = imageResultFromMessages(previous).urls
    if (urls.length) break
    end = index
  }
  const id = crypto.randomUUID()
  const attachments: ChatAttachment[] = urls.map((url, index) => ({
    id: `${id}:reference:${index}`,
    name: "",
    size: 0,
    kind: "image",
    sourceType: "url",
    mime:
      previous
        .flatMap((message) => message.attachments ?? [])
        .find((attachment) => attachment.url === url)?.mime ||
      url.match(/^data:([^;,]+)/)?.[1] ||
      "image/png",
    data: "",
    url,
  }))
  const content: ChatSendPayload["messages"][number]["content"] =
    attachments.length
      ? [
          { type: "text", text: prompt },
          ...attachments.map((attachment): OutgoingContentPart => ({
            type: "image",
            source: attachment.url!.startsWith("data:")
              ? {
                  type: "data",
                  value: attachment.url!.slice(
                    attachment.url!.indexOf(",") + 1
                  ),
                  mimeType: attachment.mime,
                }
              : {
                  type: "url",
                  value: attachment.url!,
                  mimeType: attachment.mime,
                },
          })),
        ]
      : prompt
  const message: ChatMessage = {
    id,
    role: "user",
    content: prompt,
    status: "complete",
    createdAt: new Date().toISOString(),
    ...(attachments.length
      ? {
          attachments,
          parts: [
            { type: "text" as const, text: prompt },
            ...attachments.map((attachment) => ({
              type: "attachment" as const,
              attachmentId: attachment.id,
            })),
          ],
        }
      : {}),
  }
  return { message, outgoing: { id, role: "user" as const, content } }
}
