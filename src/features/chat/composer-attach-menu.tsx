import { useMemo, useState, type ReactNode } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useChatRuntime } from "@/features/chat/chat-runtime"
import {
  BookOpenIcon,
  BotIcon,
  CheckIcon,
  InboxIcon,
  LayersIcon,
  PaperclipIcon,
  PlusIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { TooltipHint } from "@/components/ui/tooltip"
import {
  listArtifacts,
  listKnowledgeBasesWithDocuments,
  listSkills,
} from "@/api"
import { queryKeys } from "@/api/query-keys"
import {
  assistantInitial,
  pickAssistantOpening,
} from "@/features/assistants/assistant"
import {
  selectConversationAssistant,
  useAssistants,
} from "@/features/assistants/assistant-state"
import { matchesPickerQuery } from "@/features/chat/composer-picker-query"
import { PickerSearch } from "@/features/chat/composer-picker-search"
import { useComposerStore } from "@/features/chat/composer-store"
import { useSelectionStore } from "@/features/shell/selection-store"
import {
  nextWorkspaceRef,
  replaceSkillDirective,
  stripSkillDirectives,
} from "@/features/chat/workspace-ref"
import { useT } from "@/hooks/use-t"
import { avatarFallbackTone } from "@/lib/avatar-tone"
import { cn } from "@/lib/utils"
import type { AssistantItem, WorkspaceRefKind } from "@/lib/types"

const TRIGGER_CLASS =
  "size-7 rounded-full text-muted-foreground hover:bg-muted-foreground/15 hover:text-foreground"

function AssistantAvatar({ assistant }: { assistant: AssistantItem }) {
  return (
    <Avatar size="sm">
      <AvatarFallback className={avatarFallbackTone(assistant.id)}>
        {assistantInitial(assistant)}
      </AvatarFallback>
    </Avatar>
  )
}

function SearchableSubmenu({
  label,
  icon,
  placeholder,
  empty,
  items,
  selectedId,
  onSelect,
}: {
  label: string
  icon: ReactNode
  placeholder: string
  empty: string
  items: Array<{
    id: number
    name: string
    keywords: Array<string | null | undefined>
    leading: ReactNode
  }>
  selectedId: number | null
  onSelect: (id: number) => void
}) {
  const [query, setQuery] = useState("")
  const filtered = items.filter((item) =>
    matchesPickerQuery(query, item.name, ...item.keywords)
  )

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        {icon}
        {label}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-72 p-1">
        <PickerSearch
          value={query}
          placeholder={placeholder}
          onChange={setQuery}
        />
        <div className="max-h-64 overflow-y-auto">
          <DropdownMenuGroup>
            {filtered.length === 0 ? (
              <DropdownMenuItem disabled>
                <InboxIcon />
                {empty}
              </DropdownMenuItem>
            ) : (
              filtered.map((item) => (
                <DropdownMenuItem
                  key={item.id}
                  onClick={() => onSelect(item.id)}
                >
                  {item.leading}
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  {selectedId === item.id ? (
                    <CheckIcon className="ml-auto" />
                  ) : null}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuGroup>
        </div>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

function KindMark({ children }: { children: ReactNode }) {
  return (
    <span className="flex size-5 items-center justify-center text-muted-foreground [&_svg]:size-3.5">
      {children}
    </span>
  )
}

export function ComposerAttachMenu({
  children,
}: { children?: ReactNode } = {}) {
  const t = useT()
  const queryClient = useQueryClient()
  const runtime = useChatRuntime()
  const [open, setOpen] = useState(false)
  const selectedAssistantId = useSelectionStore(
    (state) => state.selectedAssistantId
  )
  const workspaceRef = useComposerStore((state) => state.workspace_ref)
  const setWorkspaceRef = useComposerStore((state) => state.setWorkspaceRef)
  const setDraft = useComposerStore((state) => state.setDraft)
  const assistantsQuery = useAssistants()
  const skillsQuery = useQuery({
    queryKey: queryKeys.skills(),
    queryFn: listSkills,
  })
  const knowledgeQuery = useQuery({
    queryKey: queryKeys.knowledge(),
    queryFn: listKnowledgeBasesWithDocuments,
  })
  const artifactsQuery = useQuery({
    queryKey: queryKeys.artifacts(),
    queryFn: () => listArtifacts(),
  })
  const assistants = assistantsQuery.data ?? []
  const skills = skillsQuery.data ?? []
  /* 缓存里是知识库连同文档，附件列表用平铺后的知识 */
  const knowledge = (knowledgeQuery.data ?? []).flatMap(
    (base) => base.documents
  )
  const artifacts = artifactsQuery.data ?? []
  const label = open ? t("common.off") : t("common.add")

  const assistantItems = useMemo(
    () =>
      (assistantsQuery.data ?? []).map((assistant) => ({
        id: assistant.id,
        name: assistant.name,
        keywords: [assistant.description, assistant.category],
        leading: <AssistantAvatar assistant={assistant} />,
      })),
    [assistantsQuery.data]
  )
  const skillItems = useMemo(
    () =>
      (skillsQuery.data ?? []).map((skill) => ({
        id: skill.id,
        name: skill.name,
        keywords: [skill.description],
        leading: (
          <KindMark>
            <SparklesIcon />
          </KindMark>
        ),
      })),
    [skillsQuery.data]
  )
  const knowledgeItems = useMemo(
    () =>
      (knowledgeQuery.data ?? []).flatMap((base) =>
        base.documents.map((item) => ({
          id: item.id,
          name: item.title,
          keywords: [item.source],
          leading: (
            <KindMark>
              <BookOpenIcon />
            </KindMark>
          ),
        }))
      ),
    [knowledgeQuery.data]
  )
  const artifactItems = useMemo(
    () =>
      (artifactsQuery.data ?? []).map((item) => ({
        id: item.id,
        name: item.title,
        keywords: [item.kind],
        leading: (
          <KindMark>
            <LayersIcon />
          </KindMark>
        ),
      })),
    [artifactsQuery.data]
  )

  function selectRef(kind: WorkspaceRefKind, id: number) {
    const next = nextWorkspaceRef(workspaceRef, kind, id)
    const draft = useComposerStore.getState().draft
    if (next?.kind === "skill") {
      const name =
        skills.find((item) => item.id === next.id)?.name ?? String(next.id)
      setDraft(replaceSkillDirective(draft, next.id, name))
    } else if (workspaceRef?.kind === "skill") {
      setDraft(stripSkillDirectives(draft))
    }
    setWorkspaceRef(next)
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <TooltipHint label={label} side="top">
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={label}
              aria-expanded={open}
              aria-pressed={Boolean(workspaceRef)}
              className={cn(
                TRIGGER_CLASS,
                workspaceRef && "bg-muted-foreground/15 text-foreground"
              )}
            />
          }
        >
          {open ? <XIcon /> : <PlusIcon />}
        </DropdownMenuTrigger>
      </TooltipHint>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={runtime.composer.openFilePicker}>
            <PaperclipIcon />
            {t("common.addFile")}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <SearchableSubmenu
            label={t("common.assistant")}
            icon={<BotIcon />}
            placeholder={t("common.searchAssistants")}
            empty={
              assistants.length === 0
                ? t("common.noAssistants")
                : t("common.noMatchingAssistants")
            }
            items={assistantItems}
            selectedId={selectedAssistantId}
            onSelect={(id) => {
              if (id === selectedAssistantId) {
                void selectConversationAssistant(null).then(() => {
                  void queryClient.invalidateQueries({
                    queryKey: queryKeys.conversations(),
                  })
                })
                return
              }
              const assistant = assistants.find((item) => item.id === id)
              const opening = assistant
                ? pickAssistantOpening(assistant)
                : undefined
              void selectConversationAssistant(id, { opening }).then(() => {
                void queryClient.invalidateQueries({
                  queryKey: queryKeys.conversations(),
                })
              })
            }}
          />
          <>
            <SearchableSubmenu
              label={t("common.skills")}
              icon={<SparklesIcon />}
              placeholder={t("common.searchSkills")}
              empty={
                skills.length === 0
                  ? t("common.noSkills")
                  : t("common.noMatchingSkills")
              }
              items={skillItems}
              selectedId={
                workspaceRef?.kind === "skill" ? workspaceRef.id : null
              }
              onSelect={(id) => selectRef("skill", id)}
            />
            <SearchableSubmenu
              label={t("common.knowledge")}
              icon={<BookOpenIcon />}
              placeholder={t("common.searchKnowledge")}
              empty={
                knowledge.length === 0
                  ? t("common.noKnowledge")
                  : t("common.noMatchingKnowledge")
              }
              items={knowledgeItems}
              selectedId={
                workspaceRef?.kind === "knowledge" ? workspaceRef.id : null
              }
              onSelect={(id) => selectRef("knowledge", id)}
            />
            <SearchableSubmenu
              label={t("common.artifacts")}
              icon={<LayersIcon />}
              placeholder={t("common.searchArtifacts")}
              empty={
                artifacts.length === 0
                  ? t("common.noArtifacts")
                  : t("common.noMatchingArtifacts")
              }
              items={artifactItems}
              selectedId={
                workspaceRef?.kind === "artifact" ? workspaceRef.id : null
              }
              onSelect={(id) => selectRef("artifact", id)}
            />
          </>
        </DropdownMenuGroup>
        {children ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>{children}</DropdownMenuGroup>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
