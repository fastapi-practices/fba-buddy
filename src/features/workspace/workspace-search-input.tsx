import type { TranslationKey } from "@/lib/i18n"
import { SearchIcon } from "lucide-react"
import { useEffect } from "react"

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import type { WorkspaceSearchKind } from "@/features/workspace/workspace-nav"
import { useWorkspaceSearchStore } from "@/features/workspace/workspace-search"
import { useT } from "@/hooks/use-t"

const SEARCH_PLACEHOLDERS: Record<WorkspaceSearchKind, TranslationKey> = {
  skill: "common.searchSkills",
  knowledge: "knowledge.searchBases",
  artifact: "common.searchArtifacts",
  mcp: "common.searchMcp",
  phrase: "common.searchQuickPhrases",
  cron: "common.searchScheduledTasks",
}

/** 各库的搜索框：挂在动态侧边栏头部下方，收起即清空 */
export function WorkspaceSearchInput({ kind }: { kind: WorkspaceSearchKind }) {
  const t = useT()
  const query = useWorkspaceSearchStore((state) => state.query)
  const setQuery = useWorkspaceSearchStore((state) => state.setQuery)
  const placeholder = t(SEARCH_PLACEHOLDERS[kind])

  useEffect(() => () => setQuery(""), [setQuery])

  return (
    <InputGroup className="w-full">
      <InputGroupAddon>
        <SearchIcon />
      </InputGroupAddon>
      <InputGroupInput
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
    </InputGroup>
  )
}
