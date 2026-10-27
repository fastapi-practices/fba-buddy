import type { ObjectDetail } from "@/lib/types/storage"

export type StagedAttachment = {
  object: ObjectDetail
  filename: string
  content_type: string
}
