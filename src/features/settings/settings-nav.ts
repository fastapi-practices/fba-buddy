import type { TranslationKey } from "@/lib/i18n"
import { i18nSearchBlob } from "@/lib/i18n"

const SETTINGS_SECTION_IDS = [
  "general",
  "display",
  "shortcuts",
  "models",
  "assistant",
  "environment",
  "worktrees",
  "memories",
  "archived",
] as const

export type SettingsSectionId = (typeof SETTINGS_SECTION_IDS)[number]

export type SettingsNavGroupId = "application" | "ai" | "coding" | "data"

export type SettingsNavItem = {
  id: SettingsSectionId
  group: SettingsNavGroupId
  label: TranslationKey
  pageTitle?: TranslationKey
  description: TranslationKey
}

export const SETTINGS_NAV_GROUPS: ReadonlyArray<{
  id: SettingsNavGroupId
  label: TranslationKey
}> = [
  { id: "application", label: "settings.group.application" },
  { id: "ai", label: "settings.group.ai" },
  { id: "coding", label: "settings.group.coding" },
  { id: "data", label: "settings.group.data" },
]

const SETTINGS_NAV_ITEMS: readonly SettingsNavItem[] = [
  {
    id: "general",
    group: "application",
    label: "common.general",
    description: "common.generalSettingsDescription",
  },
  {
    id: "display",
    group: "application",
    label: "common.appearance",
    description: "common.modeThemeColorsFontsFontSizesAndContrast",
  },
  {
    id: "shortcuts",
    group: "application",
    label: "common.shortcuts",
    description: "common.seeTheKeyboardShortcutsCurrentlyAvailable",
  },
  {
    id: "models",
    group: "ai",
    label: "models.providerManagement",
    description: "common.connectProvidersAndModelsWithYourOwnKeys",
  },
  {
    id: "assistant",
    group: "ai",
    label: "common.aiSettings",
    description: "common.advisorModelAndMcpWriteConfirmation",
  },
  {
    id: "environment",
    group: "coding",
    label: "common.runtimeEnvironment",
    description: "common.runtimeEnvironmentDescription",
  },
  {
    id: "worktrees",
    group: "coding",
    label: "common.worktrees",
    description: "common.worktreeManagerDescription",
  },
  {
    id: "memories",
    group: "data",
    label: "common.memory",
    description: "hints.longTermMemoriesTheAssistantWroteViewOrDeleteThem",
  },
  {
    id: "archived",
    group: "data",
    label: "navigation.archivedChats",
    pageTitle: "common.archivedChats",
    description: "common.archivedConversationsRestoreOrDeleteThem",
  },
]

export function normalizeSettingsSection(value: unknown): SettingsSectionId {
  return (
    SETTINGS_SECTION_IDS.find((candidate) => candidate === value) ?? "general"
  )
}

export function getSettingsNavItem(id: SettingsSectionId): SettingsNavItem {
  const item = SETTINGS_NAV_ITEMS.find((candidate) => candidate.id === id)
  return item ?? SETTINGS_NAV_ITEMS[0]
}

export function filterSettingsNavItems(query: string): SettingsNavItem[] {
  const needle = query.trim().toLowerCase()
  if (!needle) {
    return [...SETTINGS_NAV_ITEMS]
  }
  return SETTINGS_NAV_ITEMS.filter((item) => {
    return i18nSearchBlob(
      item.label,
      item.pageTitle,
      item.description
    ).includes(needle)
  })
}
