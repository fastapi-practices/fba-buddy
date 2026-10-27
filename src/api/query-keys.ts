import type { AgentMode } from "@/lib/types"

export const queryKeys = {
  projects: () => ["projects"] as const,
  conversations: () => ["conversations"] as const,
  conversationList: (view: AgentMode) =>
    ["conversations", "list", view] as const,
  conversationFollowUps: (conversationId: string | null) =>
    ["conversations", conversationId, "follow-ups"] as const,
  conversationPlan: (conversationId: string) =>
    ["conversations", conversationId, "plan"] as const,
  conversationInputRequests: (conversationId: string) =>
    ["conversations", conversationId, "input-requests"] as const,
  conversationDelegations: (conversationId: string, runId: string) =>
    ["conversations", conversationId, "delegations", runId] as const,
  assistantLists: () => ["assistants"] as const,
  assistants: (sortType = "comprehensive") => ["assistants", sortType] as const,
  assistantCategories: () => ["assistant-categories"] as const,
  modelOptions: () => ["model-options"] as const,
  myProviders: () => ["providers", "me"] as const,
  myProvider: (id: number) => ["providers", "me", id] as const,
  myProviderModels: (id: number) =>
    ["providers", "me", id, "models"] as const,
  myModels: () => ["models", "me"] as const,
  myModel: (id: number) => ["models", "me", id] as const,
  memories: () => ["memories"] as const,
  memory: (path: string) => ["memories", path] as const,
  knowledge: () => ["knowledge"] as const,
  knowledgeDocuments: (baseId: number) =>
    ["knowledge", "documents", baseId] as const,
  knowledgeBases: () => ["knowledge-bases"] as const,
  myKnowledgeBases: () => ["my-knowledge-bases"] as const,
  skills: () => ["skills"] as const,
  artifacts: () => ["artifacts"] as const,
  artifact: (id: number | string) => ["artifacts", id] as const,
  mcps: () => ["mcps"] as const,
  mcpOauthConfig: (id: number) => ["mcp-oauth-config", id] as const,
  quickPhrases: () => ["quick-phrases"] as const,
  webSearchOptions: () => ["web-search-options"] as const,
  slashCommands: (origin = "web") => ["slash-commands", origin] as const,
  experts: () => ["experts"] as const,
  expert: (id: number) => ["experts", "detail", id] as const,
  channels: () => ["channels"] as const,
  channelBindOptions: () => ["channel-bind-options"] as const,
  channelQrcode: (type: string, nonce: number) =>
    ["channel-qrcode", type, nonce] as const,
  channelQrcodePoll: (type: string, sessionId: string) =>
    ["channel-qrcode-poll", type, sessionId] as const,
  crons: () => ["crons"] as const,
  subagents: () => ["subagents"] as const,
  modelpediaExact: (ids: string[]) => ["modelpedia-exact", ids] as const,
}

export function libraryQueryKey(kind: "knowledge" | "skill" | "artifact") {
  if (kind === "knowledge") {
    return queryKeys.knowledge()
  }
  if (kind === "skill") {
    return queryKeys.skills()
  }
  return queryKeys.artifacts()
}
