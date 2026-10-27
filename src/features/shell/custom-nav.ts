import {
  BotIcon,
  GraduationCapIcon,
  PlugIcon,
  QuoteIcon,
  SparklesIcon,
  type LucideIcon,
} from "lucide-react"

import { appPaths } from "@/app/location"
import type { AssistantsSection } from "@/features/assistants/assistant-nav"
import type { TranslationKey } from "@/lib/i18n"
import type { WorkspaceKind } from "@/lib/types"

export const CUSTOM_NAV_ENTRIES: ReadonlyArray<{
  id: WorkspaceKind | AssistantsSection
  label: TranslationKey
  icon: LucideIcon
  path: string
}> = [
  {
    id: "phrase",
    label: "common.quickPhrases",
    icon: QuoteIcon,
    path: appPaths().workspace("phrase"),
  },
  {
    id: "assistant",
    label: "common.assistant",
    icon: BotIcon,
    path: appPaths().assistants("assistant"),
  },
  {
    id: "expert",
    label: "common.experts",
    icon: GraduationCapIcon,
    path: appPaths().assistants("expert"),
  },
  {
    id: "skill",
    label: "common.skills",
    icon: SparklesIcon,
    path: appPaths().workspace("skill"),
  },
  {
    id: "mcp",
    label: "common.mcp",
    icon: PlugIcon,
    path: appPaths().workspace("mcp"),
  },
]
