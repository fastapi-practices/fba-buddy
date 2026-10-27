import { SearchIcon } from "lucide-react"
import { useEffect } from "react"

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { useSettingsSearchStore } from "@/features/settings/settings-search"
import { useT } from "@/hooks/use-t"

/** 设置搜索框：固定在设置大标题下方过滤设置导航，离开设置即随输入框卸载清空 */
export function SettingsSearchInput() {
  const t = useT()
  const query = useSettingsSearchStore((state) => state.query)
  const setQuery = useSettingsSearchStore((state) => state.setQuery)

  useEffect(() => () => setQuery(""), [setQuery])

  return (
    <InputGroup className="w-full">
      <InputGroupAddon>
        <SearchIcon />
      </InputGroupAddon>
      <InputGroupInput
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t("common.searchSettings")}
        aria-label={t("common.searchSettings")}
      />
    </InputGroup>
  )
}
