import { BookOpenIcon } from "lucide-react"

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import { SIDEBAR_EMPTY_PLACEHOLDER_CLASS } from "@/features/shell/sidebar-style"
import {
  useKnowledgeBases,
  useKnowledgeWorkspaceStore,
  useSelectedKnowledgeBase,
} from "@/features/workspace/knowledge-workspace"
import { useWorkspaceSearchStore } from "@/features/workspace/workspace-search"
import { useT } from "@/hooks/use-t"
import { canEditOwnedResource } from "@/lib/ownership"

export function KnowledgeBasesSidebar() {
  const t = useT()
  const basesQuery = useKnowledgeBases()
  const bases = basesQuery.data ?? []
  const selected = useSelectedKnowledgeBase(bases)
  const selectBase = useKnowledgeWorkspaceStore((state) => state.selectBase)
  const query = useWorkspaceSearchStore((state) => state.query)
  const needle = query.trim().toLowerCase()
  const filtered = bases.filter((base) =>
    [base.name, base.description].some((text) =>
      text?.toLowerCase().includes(needle)
    )
  )

  return (
    <SidebarGroup className="px-3 py-1">
      <SidebarGroupContent>
        <SidebarMenu aria-label={t("knowledge.title")} className="gap-0.5">
          {basesQuery.isPending ? (
            <SidebarMenuItem>
              <Skeleton className="h-8 w-full" />
            </SidebarMenuItem>
          ) : basesQuery.isError || filtered.length === 0 ? (
            <SidebarMenuItem>
              <span className={SIDEBAR_EMPTY_PLACEHOLDER_CLASS}>
                {basesQuery.isError
                  ? t("common.couldNotLoadName", { name: t("knowledge.title") })
                  : needle
                    ? t("knowledge.noMatchingBases")
                    : t("knowledge.createFirst")}
              </span>
            </SidebarMenuItem>
          ) : (
            filtered.map((base) => (
              <SidebarMenuItem key={base.id}>
                <SidebarMenuButton
                  isActive={base.id === selected?.id}
                  aria-current={base.id === selected?.id ? "page" : undefined}
                  onClick={() => selectBase(base.id)}
                  tooltip={base.name}
                >
                  <BookOpenIcon />
                  <span className="truncate">{base.name}</span>
                  {!canEditOwnedResource(base.user_id) ? (
                    <span className="ml-auto text-xs text-muted-foreground">
                      {t("common.builtIn")}
                    </span>
                  ) : null}
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
