import { SearchIcon } from "lucide-react"
import { useEffect } from "react"

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import type { AssistantsSection } from "@/features/assistants/assistant-nav"
import { useAssistantSearchStore } from "@/features/assistants/assistant-state"
import { useT } from "@/hooks/use-t"

/** 助手/专家列表的搜索框：挂在动态侧边栏头部下方，收起即清空 */
export function AssistantSearchInput({
  section,
}: {
  section: AssistantsSection
}) {
  const t = useT()
  const query = useAssistantSearchStore((state) => state.query)
  const setQuery = useAssistantSearchStore((state) => state.setQuery)
  const placeholder =
    section === "expert"
      ? t("common.searchExperts")
      : t("common.searchAssistants")

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
