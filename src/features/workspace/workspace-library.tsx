import { translateCurrent } from "@/lib/i18n"
import { useEffect, useMemo, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { create } from "zustand"
import {
  BookOpenIcon,
  FileIcon,
  FileTextIcon,
  ImageIcon,
  LayersIcon,
  MessageSquarePlusIcon,
  MusicIcon,
  NotebookTextIcon,
  PlusIcon,
  SearchIcon,
  SparklesIcon,
  TagIcon,
  Trash2Icon,
  UploadIcon,
  VideoIcon,
  XIcon,
} from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { TooltipHint } from "@/components/ui/tooltip"
import {
  deleteMyKnowledgeDocument,
  deleteMySkill,
  getArtifact,
  listArtifacts,
  listSkills,
  uploadMySkill,
} from "@/api"
import { libraryQueryKey, queryKeys } from "@/api/query-keys"
import { startDraftChat } from "@/app/navigation"
import { useComposerStore } from "@/features/chat/composer-store"
import { startResourceCreateChat } from "@/features/chat/resource-create"
import {
  replaceSkillDirective,
  stripSkillDirectives,
} from "@/features/chat/workspace-ref"
import {
  SIDEBAR_EDGE_INSET_X_CLASS,
  SIDEBAR_HEADER_ICON_CLASS,
} from "@/features/shell/sidebar-style"
import { SidebarToolbarButton } from "@/features/shell/sidebar-toolbar-button"
import {
  filesFromLocalSkill,
  filterLocalSkills,
} from "@/features/workspace/local-skill-search"
import { ExpandableText } from "@/features/workspace/expandable-text"
import { WorkspaceMarkdown } from "@/features/workspace/workspace-markdown"
import { KnowledgeDocumentOverview } from "@/features/workspace/knowledge-document-overview"
import { ArtifactDownload } from "@/features/workspace/artifact-download"
import { getWorkspaceNavItem } from "@/features/workspace/workspace-nav"
import {
  libraryOverviewKind,
  libraryRecordDescription,
  libraryRecordInitial,
  libraryRecordKindLabel,
  libraryRecordOverview,
  libraryRecordTitle,
  libraryRecordVersion,
  matchesLibraryQuery,
  type LibraryKind,
  type LibraryOverviewRecord,
  type LibraryRecord,
} from "@/features/workspace/workspace-records"
import { useWorkspaceSearchStore } from "@/features/workspace/workspace-search"
import { useT } from "@/hooks/use-t"
import { apiErrorMessage } from "@/api/http"
import { avatarFallbackTone } from "@/lib/avatar-tone"
import { notifyError } from "@/lib/notify"
import { canEditOwnedResource } from "@/lib/ownership"
import type {
  WorkspaceArtifactItem,
  WorkspaceArtifactKind,
  WorkspaceArtifactListItem,
  WorkspaceKnowledgeItem,
  WorkspaceSkillItem,
} from "@/lib/types"
import type { DesktopLocalSkillHit } from "@/shared/desktop"
import { cn } from "@/lib/utils"

type CatalogRecord = LibraryRecord

const LIBRARY_ICONS = {
  knowledge: BookOpenIcon,
  skill: SparklesIcon,
  artifact: LayersIcon,
} as const

const ARTIFACT_CATEGORIES = [
  { value: "image", label: "common.image", icon: ImageIcon },
  { value: "video", label: "common.video", icon: VideoIcon },
  { value: "audio", label: "common.audio", icon: MusicIcon },
  { value: "text", label: "common.text", icon: NotebookTextIcon },
  { value: "document", label: "common.document", icon: FileTextIcon },
  { value: "other", label: "common.other", icon: FileIcon },
] as const

type ArtifactCategory = WorkspaceArtifactKind

/* 产物文件分类筛选：侧边栏选定分类后主列表只留对应文件 */
const useArtifactCategoryStore = create<{
  category: ArtifactCategory | null
  setCategory: (category: ArtifactCategory | null) => void
}>((set) => ({
  category: null,
  setCategory: (category) => set({ category }),
}))

/** 产物页侧边栏：固定文件分类与所有文件入口 */
export function ArtifactCategoriesSidebar() {
  const t = useT()
  const category = useArtifactCategoryStore((state) => state.category)
  const setCategory = useArtifactCategoryStore((state) => state.setCategory)
  const recordsQuery = useQuery({
    queryKey: libraryQueryKey("artifact"),
    queryFn: () => listArtifacts(),
  })
  const records = useMemo(() => recordsQuery.data ?? [], [recordsQuery.data])
  const counts = useMemo(() => {
    const counts = new Map<ArtifactCategory, number>()
    for (const record of records) {
      const key = record.kind
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return counts
  }, [records])

  return (
    <SidebarGroup className="gap-0.5 px-3 py-1">
      <SidebarGroupLabel>{t("common.fileCategories")}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu className="gap-0.5">
          {ARTIFACT_CATEGORIES.map(({ value, label, icon: Icon }) => (
            <SidebarMenuItem key={value}>
              <SidebarMenuButton
                isActive={category === value}
                onClick={() => setCategory(value)}
              >
                <Icon />
                <span className="truncate">{t(label)}</span>
              </SidebarMenuButton>
              <SidebarMenuBadge>{counts.get(value) ?? 0}</SidebarMenuBadge>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
        <SidebarSeparator className="mx-0 my-2" />
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={category === null}
              onClick={() => setCategory(null)}
            >
              <LayersIcon />
              <span className="truncate">{t("common.allFiles")}</span>
            </SidebarMenuButton>
            <SidebarMenuBadge>{records.length}</SidebarMenuBadge>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

export function WorkspaceLibrary({ kind }: { kind: "skill" | "artifact" }) {
  const t = useT()
  const queryClient = useQueryClient()
  const meta = getWorkspaceNavItem(kind)
  const Icon = LIBRARY_ICONS[kind]
  const query = useWorkspaceSearchStore((state) => state.query)
  const recordsQuery = useQuery({
    queryKey: libraryQueryKey(kind),
    queryFn: (): Promise<CatalogRecord[]> =>
      kind === "skill" ? listSkills() : listArtifacts(),
  })
  const [selected, setSelected] = useState<CatalogRecord | null>(null)

  useEffect(() => {
    return () => {
      useWorkspaceSearchStore.getState().setQuery("")
    }
  }, [kind])

  const records = useMemo(() => recordsQuery.data ?? [], [recordsQuery.data])
  const artifactCategory = useArtifactCategoryStore((state) => state.category)
  const filtered = useMemo(() => {
    const byQuery = records.filter((item) => matchesLibraryQuery(item, query))
    if (kind !== "artifact" || artifactCategory === null) {
      return byQuery
    }
    return byQuery.filter(
      (item) => (item as WorkspaceArtifactListItem).kind === artifactCategory
    )
  }, [artifactCategory, kind, query, records])

  return (
    <div className="absolute inset-0 flex flex-col overflow-y-auto">
      <div
        className={cn(
          "flex min-h-full w-full flex-1 flex-col gap-6 pt-6 pb-8",
          SIDEBAR_EDGE_INSET_X_CLASS
        )}
      >
        {recordsQuery.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-40 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
          </div>
        ) : recordsQuery.isError ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Icon />
              </EmptyMedia>
              <EmptyTitle>
                {t("common.couldNotLoadName", { name: t(meta.label) })}
              </EmptyTitle>
              <EmptyDescription>
                {apiErrorMessage(
                  recordsQuery.error,
                  translateCurrent("common.pleaseTryAgainLater")
                )}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : filtered.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Icon />
              </EmptyMedia>
              <EmptyTitle>
                {records.length === 0
                  ? t("common.noNameYet", { name: t(meta.label) })
                  : t(libraryEmptyMatchKey(kind))}
              </EmptyTitle>
              {records.length === 0 ? (
                <EmptyDescription>
                  {t(libraryEmptyHintKey(kind))}
                </EmptyDescription>
              ) : null}
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((record) => (
              <CatalogCard
                key={record.id}
                kind={kind}
                record={record}
                onOpen={() => setSelected(record)}
              />
            ))}
          </div>
        )}
      </div>
      <CatalogDialog
        kind={kind}
        record={selected}
        onClose={() => setSelected(null)}
        onDeleted={() => {
          setSelected(null)
          void queryClient.invalidateQueries({
            queryKey: libraryQueryKey(kind),
          })
        }}
      />
    </div>
  )
}

export function WorkspaceSkillCreateInChatButton() {
  const t = useT()
  return (
    <SidebarToolbarButton
      label={t("common.createInChat")}
      onClick={() => void startResourceCreateChat("skill").catch(() => undefined)}
    >
      <MessageSquarePlusIcon strokeWidth={1.75} />
    </SidebarToolbarButton>
  )
}

export function WorkspaceSkillAddButton() {
  const t = useT()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [skillSearchOpen, setSkillSearchOpen] = useState(false)

  async function uploadSkills(files: FileList | File[]) {
    const list = Array.from(files)
    if (list.length === 0) {
      return
    }
    setUploading(true)
    try {
      await uploadMySkill(list)
      await queryClient.invalidateQueries({ queryKey: queryKeys.skills() })
    } catch (error) {
      notifyError(apiErrorMessage(error, t("common.couldNotUploadTheSkill")))
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        className="sr-only"
        accept=".zip,application/zip,.md,text/markdown"
        multiple
        onChange={(event) => {
          if (!event.target.files) {
            return
          }
          void uploadSkills(event.target.files)
        }}
      />
      <DropdownMenu>
        {/* 新建只留加号图标，展开的菜单里是系统搜索与本地导入 */}
        <TooltipHint label={t("common.addSkill")} side="top">
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("common.addSkill")}
                className={cn(SIDEBAR_HEADER_ICON_CLASS, "electron-no-drag")}
                disabled={uploading}
              />
            }
          >
            {uploading ? <Spinner /> : <PlusIcon strokeWidth={1.75} />}
          </DropdownMenuTrigger>
        </TooltipHint>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setSkillSearchOpen(true)}>
            <SearchIcon />
            {t("common.systemSearch")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
            <UploadIcon />
            {t("common.importLocally")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <SkillSystemSearchDialog
        open={skillSearchOpen}
        onOpenChange={setSkillSearchOpen}
        onImported={async () => {
          await queryClient.invalidateQueries({
            queryKey: queryKeys.skills(),
          })
          setSkillSearchOpen(false)
        }}
      />
    </>
  )
}

function SkillSystemSearchDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported: () => Promise<void>
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? <SkillSystemSearchBody onImported={onImported} /> : null}
    </Dialog>
  )
}

function SkillSystemSearchBody({
  onImported,
}: {
  onImported: () => Promise<void>
}) {
  const t = useT()
  const [query, setQuery] = useState("")
  const [hits, setHits] = useState<DesktopLocalSkillHit[]>([])
  const [loading, setLoading] = useState(() =>
    Boolean(window.buddyDesktop?.scanLocalSkills)
  )
  const [importingPath, setImportingPath] = useState<string | null>(null)
  const filtered = useMemo(() => filterLocalSkills(hits, query), [hits, query])

  useEffect(() => {
    const desktop = window.buddyDesktop
    if (!desktop?.scanLocalSkills) {
      notifyError(t("hints.localSkillSearchIsAvailableInTheDesktopApp"))
      return
    }
    let cancelled = false
    void desktop
      .scanLocalSkills()
      .then((next) => {
        if (!cancelled) {
          setHits(next)
        }
      })
      .catch((error) => {
        if (!cancelled) {
          notifyError(
            apiErrorMessage(error, t("common.couldNotScanLocalSkills"))
          )
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [t])

  async function importHit(hit: DesktopLocalSkillHit) {
    const desktop = window.buddyDesktop
    if (!desktop?.readLocalSkill) {
      notifyError(t("hints.localSkillSearchIsAvailableInTheDesktopApp"))
      return
    }
    setImportingPath(hit.path)
    try {
      const payload = await desktop.readLocalSkill(hit.path)
      await uploadMySkill(filesFromLocalSkill(payload))
      await onImported()
    } catch (error) {
      notifyError(apiErrorMessage(error, t("common.couldNotUploadTheSkill")))
    } finally {
      setImportingPath(null)
    }
  }

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{t("common.systemSearch")}</DialogTitle>
      </DialogHeader>
      <Input
        value={query}
        placeholder={t("common.searchSkills")}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="max-h-72 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("common.noMatchingSkills")}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((hit) => (
              <div
                key={hit.path}
                className="flex items-center justify-between gap-2 rounded-md px-3 py-2 hover:bg-muted/50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{hit.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {hit.description || t("common.noDescription")}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={importingPath != null}
                  onClick={() => void importHit(hit)}
                >
                  {importingPath === hit.path ? (
                    <Spinner data-icon="inline-start" />
                  ) : null}
                  {t("common.import")}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </DialogContent>
  )
}

function CatalogCard({
  kind,
  record,
  onOpen,
}: {
  kind: LibraryKind
  record: CatalogRecord
  onOpen: () => void
}) {
  const t = useT()
  const title = libraryRecordTitle(kind, record)
  const description = libraryRecordDescription(kind, record)
  /* 知识的内置标记挂在知识库标题上，卡片不再重复 */
  const builtin = kind === "skill" && !canEditOwnedResource(ownedUserId(record))
  return (
    <Card
      size="sm"
      role="button"
      tabIndex={0}
      className={cn(
        "cursor-pointer py-4 text-left transition-colors hover:bg-muted/40"
      )}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onOpen()
        }
      }}
    >
      <CardHeader className="gap-3">
        <div className="flex items-start gap-3">
          <Avatar className="size-8">
            <AvatarFallback className={avatarFallbackTone(record.id)}>
              {libraryRecordInitial(title)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <CardTitle className="flex items-center gap-2 truncate text-base">
              <span className="min-w-0 truncate">{title}</span>
              {builtin ? (
                <Badge variant="outline">{t("common.builtIn")}</Badge>
              ) : null}
            </CardTitle>
            {description ? (
              <CardDescription className="mt-1 line-clamp-2 leading-5">
                {description}
              </CardDescription>
            ) : null}
          </div>
        </div>
      </CardHeader>
    </Card>
  )
}

export function CatalogDialog({
  kind,
  record,
  onClose,
  onDeleted,
}: {
  kind: LibraryKind
  record: CatalogRecord | null
  onClose: () => void
  onDeleted?: () => void
}) {
  const t = useT()
  const artifactQuery = useQuery({
    queryKey: queryKeys.artifact(record?.id ?? 0),
    queryFn: () => getArtifact(record?.id ?? 0),
    enabled: kind === "artifact" && record != null,
  })
  const viewer: LibraryOverviewRecord | null =
    kind === "artifact"
      ? (artifactQuery.data ?? null)
      : (record as WorkspaceSkillItem | WorkspaceKnowledgeItem | null)
  const title = record ? libraryRecordTitle(kind, record) : ""
  const description = record ? libraryRecordDescription(kind, record) : ""
  const overview = viewer ? libraryRecordOverview(kind, viewer) : ""
  const version = record ? libraryRecordVersion(kind, record) : null
  const kindLabel = record ? libraryRecordKindLabel(kind, record) : null
  const overviewKind = viewer ? libraryOverviewKind(kind, viewer) : "markdown"
  const canDeleteOwned =
    (kind === "skill" || kind === "knowledge") &&
    record != null &&
    canEditOwnedResource(ownedUserId(record))
  const [removing, setRemoving] = useState(false)

  function applyItem() {
    if (!record) {
      return
    }
    startDraftChat()
    const composer = useComposerStore.getState()
    if (kind === "skill") {
      composer.setDraft(replaceSkillDirective(composer.draft, record.id, title))
      composer.setWorkspaceRef({ kind: "skill", id: record.id })
    } else {
      if (composer.workspace_ref?.kind === "skill") {
        composer.setDraft(stripSkillDirectives(composer.draft))
      }
      composer.setWorkspaceRef({ kind, id: record.id })
    }
    onClose()
  }

  async function removeOwned() {
    if (!record || !canDeleteOwned || removing) {
      return
    }
    setRemoving(true)
    try {
      if (kind === "skill") {
        await deleteMySkill(record.id)
      } else {
        const baseId = (record as WorkspaceKnowledgeItem).knowledge_base_id
        await deleteMyKnowledgeDocument(baseId, record.id)
      }
      onDeleted?.()
    } catch (error) {
      notifyError(
        apiErrorMessage(
          error,
          t(
            kind === "skill"
              ? "common.couldNotDeleteTheSkill"
              : "common.couldNotDeleteTheKnowledge"
          )
        )
      )
    } finally {
      setRemoving(false)
    }
  }

  return (
    <Dialog
      open={record != null}
      onOpenChange={(open) => {
        if (!open) {
          onClose()
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        overlayClassName="bg-black/50 supports-backdrop-filter:backdrop-blur-sm"
        className="gap-6 overflow-y-auto rounded-3xl p-6 sm:max-w-xl"
      >
        {record ? (
          <>
            <DialogHeader className="gap-4">
              <div className="flex items-start gap-4">
                <Avatar className="size-16">
                  <AvatarFallback className={avatarFallbackTone(record.id)}>
                    {libraryRecordInitial(title)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex min-w-0 flex-1 flex-col gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <DialogTitle className="min-w-0 flex-1 truncate text-lg font-semibold">
                      {title}
                    </DialogTitle>
                    <DialogClose
                      render={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="shrink-0"
                        />
                      }
                    >
                      <XIcon />
                      <span className="sr-only">{t("common.close")}</span>
                    </DialogClose>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="lg"
                      className="w-fit"
                      onClick={applyItem}
                    >
                      {kind === "skill" ? (
                        <SparklesIcon data-icon="inline-start" />
                      ) : kind === "knowledge" ? (
                        <BookOpenIcon data-icon="inline-start" />
                      ) : (
                        <LayersIcon data-icon="inline-start" />
                      )}
                      {kind === "skill"
                        ? t("common.useSkill")
                        : kind === "knowledge"
                          ? t("common.useKnowledge")
                          : t("common.useArtifact")}
                    </Button>
                    {canDeleteOwned ? (
                      <Button
                        type="button"
                        size="lg"
                        variant="destructive"
                        className="w-fit"
                        disabled={removing}
                        onClick={() => void removeOwned()}
                      >
                        {removing ? (
                          <Spinner data-icon="inline-start" />
                        ) : (
                          <Trash2Icon data-icon="inline-start" />
                        )}
                        {t("common.delete")}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
              {kind !== "knowledge" ? (
                <>
                  <DialogDescription className="sr-only">
                    {description || t("common.noDescription")}
                  </DialogDescription>
                  <ExpandableText
                    key={`${kind}-${record.id}-description`}
                    text={description}
                    emptyLabel={t("common.noDescription")}
                  />
                </>
              ) : null}
            </DialogHeader>
            <div className="flex flex-col gap-5">
              {kind === "artifact" && artifactQuery.data ? (
                <ArtifactDownload
                  key={artifactQuery.data.id}
                  artifact={artifactQuery.data}
                />
              ) : null}
              <section
                className="flex flex-col gap-3"
                aria-label={t("common.overview")}
              >
                <p className="flex items-center gap-2 text-sm font-medium text-foreground [&_svg]:size-4 [&_svg]:text-muted-foreground">
                  <NotebookTextIcon />
                  {t("common.overview")}
                </p>
                <ScrollArea
                  className="h-72 rounded-lg bg-foreground/4"
                  viewportClassName="bg-foreground/4"
                >
                  <div className="p-3">
                    {kind === "artifact" && artifactQuery.isLoading ? (
                      <Skeleton className="h-24 w-full" />
                    ) : kind === "artifact" && artifactQuery.isError ? (
                      <p className="text-sm text-destructive" role="alert">
                        {apiErrorMessage(artifactQuery.error)}
                      </p>
                    ) : kind === "artifact" && !artifactQuery.data ? (
                      <p className="text-sm text-muted-foreground">
                        {t("common.noContent")}
                      </p>
                    ) : kind === "knowledge" ? (
                      <KnowledgeDocumentOverview
                        key={record.id}
                        document={record as WorkspaceKnowledgeItem}
                      />
                    ) : (
                      <WorkspaceMarkdown
                        kind={overviewKind}
                        content={overview}
                        emptyLabel={t(
                          kind === "artifact" &&
                            (viewer as WorkspaceArtifactItem | null)
                              ?.relative_path
                            ? "common.artifactFileContent"
                            : "common.noContent"
                        )}
                      />
                    )}
                  </div>
                </ScrollArea>
              </section>
              {kind === "skill" ? (
                <section className="flex flex-col gap-3">
                  <p className="flex items-center gap-2 text-sm font-medium text-foreground [&_svg]:size-4 [&_svg]:text-muted-foreground">
                    <TagIcon />
                    {t("common.version")}
                  </p>
                  <p className="text-sm text-foreground/80">
                    {version || t("common.noVersion")}
                  </p>
                </section>
              ) : null}
              {kind === "knowledge" ? (
                <section className="flex flex-col gap-3">
                  <p className="flex items-center gap-2 text-sm font-medium text-foreground [&_svg]:size-4 [&_svg]:text-muted-foreground">
                    <BookOpenIcon />
                    {t("common.knowledgeBase")}
                  </p>
                  <p className="text-sm text-foreground/80">
                    {(record as WorkspaceKnowledgeItem).knowledge_base_name ||
                      t("common.noDescription")}
                  </p>
                </section>
              ) : null}
              {kind === "artifact" ? (
                <section className="flex flex-col gap-3">
                  <p className="flex items-center gap-2 text-sm font-medium text-foreground [&_svg]:size-4 [&_svg]:text-muted-foreground">
                    <TagIcon />
                    {t("common.type")}
                  </p>
                  <p className="text-sm text-foreground/80">
                    {kindLabel || t("common.noDescription")}
                  </p>
                </section>
              ) : null}
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function ownedUserId(record: CatalogRecord | null | undefined) {
  if (!record || !("user_id" in record)) {
    return undefined
  }
  return record.user_id
}

function libraryEmptyMatchKey(kind: "skill" | "artifact") {
  if (kind === "skill") {
    return "common.noMatchingSkills"
  }
  return "common.noMatchingArtifacts"
}

function libraryEmptyHintKey(kind: "skill" | "artifact") {
  if (kind === "artifact") {
    return "common.theyAppearHereAfterTheModelWritesThem"
  }
  return "hints.builtInItemsAreMaintainedInAdminYouCanAlsoUploadYourOwn"
}
