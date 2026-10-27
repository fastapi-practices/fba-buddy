type ObjectKind =
  | "attachment"
  | "artifact"
  | "workspace_file"
  | "tool_output"
  | "test_report"
  | "knowledge"
  | "skill"

type ObjectLocation = "local" | "sandbox" | "s3" | "cache"

type ObjectState = "active" | "tombstoned" | "deleted"

export type ObjectDetail = {
  id: number
  user_id: number
  kind: ObjectKind
  location: ObjectLocation
  storage_id: number | null
  object_key: string
  sha256: string | null
  size: number | null
  mime_type: string | null
  ref_count: number
  state: ObjectState
  tombstoned_time: string | null
  delete_after_time: string | null
  physically_deleted_time: string | null
  created_time: string
}
