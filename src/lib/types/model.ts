export const AI_PROVIDER_TYPE = {
  openai: 0,
  anthropic: 1,
  google: 2,
  xai: 3,
  openrouter: 4,
  openai_responses: 5,
} as const

export type AIProviderType =
  (typeof AI_PROVIDER_TYPE)[keyof typeof AI_PROVIDER_TYPE]

export type ThinkingEffort =
  "none" | "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max"

type ThinkingLevel =
  "minimal" | "low" | "medium" | "high" | "xhigh" | "max"

export type ThinkingPolicy = {
  levels: ThinkingLevel[]
  default_level: ThinkingLevel | null
  can_disable: boolean
}

export type ModelThinking = {
  supported: boolean
  efforts: ThinkingEffort[]
  default: ThinkingEffort
  mandatory: boolean
}

export type ModelKind = "chat" | "embedding" | "image"

export type BackendModelCapability = "tools" | "thinking"

export type ModelModality = "text" | "image" | "audio" | "video" | "pdf"

export type ProviderItem = {
  id: number
  user_id: number
  name: string
  type: AIProviderType
  api_key: string
  api_host: string
  status: number
  remark: string | null
  created_time: string
  updated_time: string | null
}

export type ProviderWriteBody = {
  name: string
  type: AIProviderType
  api_key: string
  api_host: string | null
  status: number
  remark: string | null
}

export type ProviderModelItem = {
  id: string
  object: string | null
  created: number | null
  display_name: string | null
  kind: ModelKind
  capabilities: BackendModelCapability[]
  input_modalities: ModelModality[]
  context_window: number | null
  max_output_tokens: number | null
}

export type ModelItem = {
  id: number
  provider_id: number
  model_id: string
  name: string
  kind: ModelKind
  capabilities: BackendModelCapability[]
  input_modalities: ModelModality[] | null
  thinking_policy: ThinkingPolicy | null
  context_window: number | null
  max_output_tokens: number | null
  sort: number
  status: number
  remark: string | null
  created_time: string
  updated_time: string | null
}

export type MyModelItem = Omit<ModelItem, "name"> & {
  name: string | null
  type: AIProviderType
  api_key: string
  api_host: string
  user_id: number
}

export type ModelWriteBody = {
  provider_id: number
  model_id: string
  name?: string | null
  kind: ModelKind
  capabilities: BackendModelCapability[]
  input_modalities: ModelModality[] | null
  thinking_policy: ThinkingPolicy | null
  context_window?: number | null
  max_output_tokens?: number | null
  sort?: number
  status?: number
  remark?: string | null
}

type ModelArchitectureSyncSkipped = {
  id: number
  model_id: string
  reason: string
}

export type ModelArchitectureSyncResult = {
  updated_count: number
  skipped: ModelArchitectureSyncSkipped[]
}

export type ProviderOption = {
  id: number
  user_id: number
  name: string
  type: AIProviderType
  status: number
  models: ModelItem[]
}

export type DefaultModel = {
  id: number
  kind: ModelKind
  provider_id: number
  provider_name: string
  provider_type: AIProviderType
  model_id: string
  status: number
  created_time: string
  updated_time: string | null
}

export type ModelOptions = {
  providers: ProviderOption[]
  default_candidates: Record<ModelKind, number[]>
  default_models: Record<ModelKind, DefaultModel | null>
}

export const AI_PROVIDER_DEFAULT_HOST: Record<AIProviderType, string> = {
  0: "https://api.openai.com",
  1: "https://api.anthropic.com",
  2: "https://generativelanguage.googleapis.com",
  3: "https://api.x.ai",
  4: "https://openrouter.ai",
  5: "https://api.openai.com",
}
