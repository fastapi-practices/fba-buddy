export type WorkspaceRefKind = "knowledge" | "skill" | "artifact"

export type WorkspaceKind =
  | "artifact"
  | "memory"
  | "knowledge"
  | "skill"
  | "mcp"
  | "acp"
  | "phrase"
  | "cron"

export type WorkspaceRef = {
  kind: WorkspaceRefKind
  id: number
}

export type KnowledgeBaseItem = {
  id: number
  name: string
  description: string | null
  provider_id?: number | null
  model_id?: string | null
  user_id?: number
  created_time?: string
  updated_time?: string | null
}

export type KnowledgeBaseWriteBody = {
  name: string
  description?: string | null
  provider_id?: number | null
  model_id?: string | null
}

export type KnowledgeFileType =
  "md" | "txt" | "pdf" | "docx" | "pptx" | "xlsx" | "image"

export type WorkspaceKnowledgeItem = {
  id: number
  title: string
  source: string | null
  content?: string
  object_key?: string | null
  knowledge_base_id: number
  knowledge_base_name?: string
  file_type: KnowledgeFileType
  provider_id?: number | null
  model_id?: string | null
  user_id?: number
  created_time?: string
  updated_time?: string | null
}

/** 知识库连同库下文档，字段对齐后端 knowledge_base 与 documents */
export type KnowledgeBaseWithDocuments = KnowledgeBaseItem & {
  documents: WorkspaceKnowledgeItem[]
}

export type WorkspaceSkillItem = {
  id: number
  name: string
  description: string | null
  version: string
  content?: string
  object_key?: string | null
  user_id?: number
  created_time?: string
  updated_time?: string | null
}

export type WorkspaceSkillSearchHit = {
  id: number
  name: string
  description: string | null
  version: string
  user_id: number
  created_time?: string
  updated_time?: string | null
}

export type WorkspaceArtifactKind =
  "image" | "video" | "audio" | "text" | "document" | "other"

export type WorkspaceArtifactListItem = {
  id: number
  user_id: number
  title: string
  kind: WorkspaceArtifactKind
  object_key: string | null
  storage_id: number | null
  storage_backend: WorkspaceArtifactStorageBackend
  workspace_id: string | null
  relative_path: string | null
  mime_type: string | null
  size: number | null
  sha256: string | null
  state: WorkspaceArtifactState
  created_time: string
  updated_time: string | null
}

export type WorkspaceArtifactItem = WorkspaceArtifactListItem & {
  content: string
}

export type WorkspaceArtifactPage = {
  items: WorkspaceArtifactListItem[]
  next_cursor: string | null
  has_more: boolean
}

type WorkspaceArtifactStorageBackend = "local" | "s3" | "sandbox"

type WorkspaceArtifactState =
  "working" | "ready" | "archived" | "deleted"

type WorkspaceBackend = "local" | "cloud" | "sandbox"

type WorkspaceState =
  "provisioning" | "ready" | "active" | "archived" | "error" | "deleted"

type WorkspaceFileState =
  "working" | "ready" | "active" | "archived" | "error" | "deleted"

export type WorkspaceItem = {
  id: number
  user_id: number
  workspace_id: string
  name: string | null
  backend: WorkspaceBackend
  object_prefix: string | null
  revision: number
  state: WorkspaceState
  created_time: string
  updated_time: string | null
}

export type WorkspaceWriteBody = {
  workspace_id: string
  name?: string | null
  backend: WorkspaceBackend
  object_prefix?: string | null
  revision?: number
  state?: WorkspaceState
}

export type WorkspaceUpdateBody = {
  name?: string | null
  backend?: WorkspaceBackend
  object_prefix?: string | null
  revision?: number
  state?: WorkspaceState
}

export type WorkspaceFileItem = {
  id: number
  user_id: number
  workspace_id: string
  relative_path: string
  object_key: string | null
  storage_id: number | null
  size: number | null
  sha256: string | null
  mime_type: string | null
  state: WorkspaceFileState
  revision: number
  created_time: string
  updated_time: string | null
}

export type WorkspaceFileWriteBody = {
  relative_path: string
  object_key?: string | null
  size?: number | null
  sha256?: string | null
  mime_type?: string | null
  state?: WorkspaceFileState
  revision?: number
}

export type WorkspaceArtifactReferenceBody = {
  title: string
  kind: WorkspaceArtifactKind
  storage_backend: WorkspaceArtifactStorageBackend
  workspace_id?: string | null
  relative_path: string
  mime_type?: string | null
  size?: number | null
  sha256?: string | null
  state?: WorkspaceArtifactState
}

export type MemoryListItem = {
  path: string
  truncated: boolean
  preview: string
}

export type MemoryDetail = {
  path: string
  content: string
  version: string
  truncated: boolean
}
