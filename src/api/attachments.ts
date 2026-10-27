import { apiRequest } from "@/api/http"
import type { ObjectDetail, StagedAttachment } from "@/lib/types"

export function stageAttachment(file: File) {
  const body = new FormData()
  body.append("file", file)
  return apiRequest<StagedAttachment>("/attachments/staged", {
    method: "POST",
    body,
    silent: true,
  })
}

export function promoteAttachment(objectId: number, conversationId: string) {
  return apiRequest<ObjectDetail>(
    `/attachments/staged/${objectId}/promote`,
    {
      method: "POST",
      body: JSON.stringify({ conversation_id: conversationId }),
      silent: true,
    }
  )
}
