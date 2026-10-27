import type { TranslationKey } from "@/lib/i18n"
import type { WorkspaceKind } from "@/lib/types"

export const WORKSPACE_KIND_IDS = [
  "artifact",
  "memory",
  "knowledge",
  "skill",
  "mcp",
  "acp",
  "phrase",
  "cron",
] as const

export type WorkspaceNavItem = {
  id: WorkspaceKind
  label: TranslationKey
  description: TranslationKey
}

const WORKSPACE_KIND_ITEMS: Record<WorkspaceKind, WorkspaceNavItem> = {
  artifact: {
    id: "artifact",
    label: "common.artifacts",
    description: "hints.resultsTheAiSavedOpenOneToReadTheFullText",
  },
  memory: {
    id: "memory",
    label: "common.memory",
    description: "hints.longTermMemoriesTheAssistantWroteViewOrDeleteThem",
  },
  knowledge: {
    id: "knowledge",
    label: "knowledge.title",
    description:
      "hints.builtInKnowledgeIsReadOnlyYouCanAlsoCreateYourOwnKnowledgeBases",
  },
  skill: {
    id: "skill",
    label: "common.skills",
    description:
      "hints.builtInSkillsAreReadOnlyYouCanAlsoUploadYourOwnSkillPacks",
  },
  mcp: {
    id: "mcp",
    label: "common.mcp",
    description: "hints.createOrImportJsonToConnectMcpToYourChats",
  },
  acp: {
    id: "acp",
    label: "common.acp",
    description: "common.manageExternalCodingAgentsForCodingMode",
  },
  phrase: {
    id: "phrase",
    label: "common.quickPhrases",
    description: "hints.yourQuickPhrasesClickOneToInsertItIntoChat",
  },
  cron: {
    id: "cron",
    label: "common.scheduledTasks",
    description: "common.scheduleAnExistingChatToRunATurn",
  },
}

export const WORKSPACE_NAV_ITEMS: readonly WorkspaceNavItem[] = [
  WORKSPACE_KIND_ITEMS.knowledge,
  WORKSPACE_KIND_ITEMS.skill,
  WORKSPACE_KIND_ITEMS.mcp,
  WORKSPACE_KIND_ITEMS.acp,
  WORKSPACE_KIND_ITEMS.phrase,
  WORKSPACE_KIND_ITEMS.cron,
  WORKSPACE_KIND_ITEMS.artifact,
]

/* 「自定义」固定栏收编的可自建类别，动态侧边栏按这个顺序展示 */
export const CUSTOM_WORKSPACE_KINDS = ["phrase", "skill", "mcp"] as const

export type CustomWorkspaceKind = (typeof CUSTOM_WORKSPACE_KINDS)[number]

export function isCustomWorkspaceKind(
  kind: WorkspaceKind
): kind is CustomWorkspaceKind {
  return (CUSTOM_WORKSPACE_KINDS as readonly string[]).includes(kind)
}

const WORKSPACE_SEARCH_KINDS = [
  "skill",
  "knowledge",
  "artifact",
  "mcp",
  "phrase",
  "cron",
] as const

export type WorkspaceSearchKind = (typeof WORKSPACE_SEARCH_KINDS)[number]

export function isWorkspaceSearchKind(
  kind: WorkspaceKind
): kind is WorkspaceSearchKind {
  return (WORKSPACE_SEARCH_KINDS as readonly string[]).includes(kind)
}

export function normalizeWorkspaceKind(value: unknown): WorkspaceKind {
  if (typeof value !== "string") {
    return "artifact"
  }
  return (
    WORKSPACE_KIND_IDS.find((candidate) => candidate === value) ?? "artifact"
  )
}

export function getWorkspaceNavItem(id: WorkspaceKind): WorkspaceNavItem {
  return WORKSPACE_KIND_ITEMS[id] ?? WORKSPACE_KIND_ITEMS.artifact
}
