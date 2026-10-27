import type { McpItem } from "./tools"
import type { KnowledgeBaseItem, WorkspaceSkillSearchHit } from "./workspace"

export type ExpertItem = {
  id: number
  name: string
  prompt: string
  description: string | null
  starters: string[]
  mcp_ids: number[]
  skill_ids: number[]
  knowledge_ids: number[]
  sort: number
  usage_count: number
  user_id?: number
  created_time?: string
  updated_time?: string | null
}

export type ExpertDetail = Omit<
  ExpertItem,
  "mcp_ids" | "skill_ids" | "knowledge_ids"
> & {
  mcps: McpItem[]
  skills: WorkspaceSkillSearchHit[]
  knowledge_bases: KnowledgeBaseItem[]
}

export type ApplyExpertResult = {
  assistant_id: number | null
  mcp_ids: number[]
  skill_ids: number[]
  knowledge_ids: number[]
  starters: string[]
}

export type ExpertWriteBody = {
  name: string
  prompt: string
  description?: string | null
  starters?: string[]
  mcp_ids?: number[]
  skill_ids?: number[]
  knowledge_ids?: number[]
  sort?: number
}
