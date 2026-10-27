import { useRightSidebar } from "@/features/shell/right-sidebar-store"
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { MessageCirclePlusIcon, PlusIcon } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import {
  deleteProject,
  listConversations,
  listProjects,
  toProjectWriteBody,
  updateProject,
} from "@/api"
import { createProjectWithDirectory } from "@/api/project-workspace"
import { queryKeys } from "@/api/query-keys"
import { openSettings, startDraftChat } from "@/app/navigation"
import type { ConversationMessageTarget } from "@/app/conversation-message-location"
import { useAppLocation } from "@/app/use-app-location"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { TooltipHint } from "@/components/ui/tooltip"
import { toast } from "@/components/ui/toast"
import { conversationAssistantId } from "@/lib/conversation-workspace"
import { setProjectDirectory } from "@/lib/project-workspace"
import { notifyError } from "@/lib/notify"
import { dataSourceKey } from "@/lib/account-source"
import { ImageRecordsSidebar } from "@/features/image/image-records-sidebar"
import { SettingsSidebar } from "@/features/settings/SettingsSidebar"
import { partitionSidebarConversations } from "@/features/shell/sidebar-conversation-groups"
import { SidebarChrome } from "@/features/shell/sidebar-chrome"
import { CustomNavSection } from "@/features/shell/sidebar-custom-nav"
import { ConversationItems } from "@/features/shell/sidebar-conversations"
import { CreateProjectDialog } from "@/features/shell/create-project-dialog"
import { ProjectGroupRow } from "@/features/shell/sidebar-project-group"
import { SidebarGroupSection } from "@/features/shell/sidebar-group-section"
import { useSelectionStore } from "@/features/shell/selection-store"
import {
  SIDEBAR_EMPTY_PLACEHOLDER_CLASS,
  SIDEBAR_TRAILING_ICON_CLASS,
} from "@/features/shell/sidebar-style"
import type { WorkspaceCommand } from "@/features/shell/workspace-commands"
import type { ConversationListItem, CursorPage, ProjectItem } from "@/lib/types"
import { CronRecordsSidebar } from "@/features/workspace/cron-library"
import { KnowledgeBasesSidebar } from "@/features/workspace/knowledge-bases-sidebar"
import { ArtifactCategoriesSidebar } from "@/features/workspace/workspace-library"
import { useComposerStore } from "@/features/chat/composer-store"
import { isCustomWorkspaceKind } from "@/features/workspace/workspace-nav"
import { useT } from "@/hooks/use-t"

type AppSidebarProps = {
  onCommand: (command: WorkspaceCommand) => void
  onSelectConversation: (id: string, target?: ConversationMessageTarget) => void
}

export function AppSidebar({
  onCommand,
  onSelectConversation,
}: AppSidebarProps) {
  const t = useT()
  const queryClient = useQueryClient()
  const location = useAppLocation()
  const selectedProjectId = useSelectionStore(
    (state) => state.selectedProjectId
  )
  const setSelectedProjectId = useSelectionStore(
    (state) => state.setSelectedProjectId
  )
  const selectedConversationId = useSelectionStore(
    (state) => state.selectedConversationId
  )
  /* 对话高亮跟随可见的主栏或侧栏会话 */
  const hostKey = useSelectionStore((state) => state.chatPaneKey)
  const rightSidebar = useRightSidebar(hostKey)
  const sidebarChatVisible =
    rightSidebar.open && rightSidebar.activePanel === "chat"
  const focusedChatPane = useSelectionStore((state) => state.focusedChatPane)
  const sidebarConversationId = useSelectionStore(
    (state) => state.sidebarConversationId
  )
  const sidebarChatFocused = sidebarChatVisible && focusedChatPane === "right"
  const activeConversationId =
    location.route !== "chat"
      ? null
      : sidebarChatFocused
        ? sidebarConversationId
        : selectedConversationId
  const view = useComposerStore((state) => state.agent_mode ?? "work")
  const [creatingProject, setCreatingProject] = useState(false)
  const [projectName, setProjectName] = useState("")
  const [projectDirectory, setProjectDirectoryState] = useState<string | null>(
    null
  )
  const [collapsedProjectIds, setCollapsedProjectIds] = useState<number[]>([])
  const [pinnedOpen, setPinnedOpen] = useState(true)
  const [projectsOpen, setProjectsOpen] = useState(true)
  const [chatsOpen, setChatsOpen] = useState(true)

  const projectsQuery = useQuery({
    queryKey: queryKeys.projects(),
    queryFn: listProjects,
    refetchOnWindowFocus: true,
    // 服务端恢复不一定触发浏览器 online 事件，失败后定期重试
    refetchInterval: (query) => (query.state.error ? 30_000 : false),
  })
  const conversationsQuery = useQuery({
    queryKey: queryKeys.conversationList(view),
    queryFn: () => listConversations({ view }),
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: true,
    refetchInterval: (query) => (query.state.error ? 30_000 : false),
  })

  const projects = useMemo(
    () =>
      [...(projectsQuery.data ?? [])].sort(
        (left, right) => left.sort - right.sort
      ),
    [projectsQuery.data]
  )
  useEffect(() => {
    if (
      projectsQuery.isSuccess &&
      !projectsQuery.isFetching &&
      selectedProjectId !== null &&
      !projects.some((project) => project.id === selectedProjectId)
    ) {
      setSelectedProjectId(null)
    }
  }, [
    projects,
    projectsQuery.isFetching,
    projectsQuery.isSuccess,
    selectedProjectId,
    setSelectedProjectId,
  ])
  /* 会话搜索走弹窗，侧边栏列表不再按搜索词过滤 */
  const conversations = useMemo(
    () => conversationsQuery.data?.items ?? [],
    [conversationsQuery.data]
  )
  const conversationTitles = useMemo(
    () =>
      Object.fromEntries(
        conversations.map((item) => [item.conversation_id, item.title])
      ),
    [conversations]
  )
  const openConversationIds =
    location.route === "chat"
      ? sidebarChatVisible
        ? [selectedConversationId, sidebarConversationId]
        : [selectedConversationId]
      : []
  const { pinned, byProject } = useMemo(
    () => partitionSidebarConversations(conversations),
    [conversations]
  )
  async function refreshProjects() {
    await queryClient.invalidateQueries({ queryKey: queryKeys.projects() })
  }

  const createProjectMutation = useMutation({
    mutationFn: createProjectWithDirectory,
    onMutate: async () => {
      const source = dataSourceKey()
      await queryClient.cancelQueries({ queryKey: queryKeys.projects() })
      return source
    },
    onSuccess: async ({ project, directoryError }, _variables, source) => {
      if (source !== dataSourceKey()) return
      await refreshProjects()
      if (source !== dataSourceKey()) return
      if (project) setSelectedProjectId(project.id)
      if (directoryError)
        notifyError(
          `${t("common.projectFolderBindingFailed")}：${directoryError instanceof Error ? directoryError.message : String(directoryError)}`
        )
      else toast.add({ title: t("common.projectCreated"), type: "success" })
      setProjectName("")
      setProjectDirectoryState(null)
      setCreatingProject(false)
    },
    onError: (error, _variables, source) => {
      if (source !== dataSourceKey() || error.name === "AbortError") return
      notifyError(error.message || t("common.requestFailed"))
    },
  })

  function refreshConversations() {
    void queryClient.invalidateQueries({ queryKey: queryKeys.conversations() })
  }

  function selectConversation(id: string, target?: ConversationMessageTarget) {
    const item = conversations.find((entry) => entry.conversation_id === id)
    if (item) {
      useSelectionStore
        .getState()
        .setSelectedAssistantId(conversationAssistantId(item))
    }
    /* 替换主对话或侧栏对话由当前可见栏的焦点决定，这里只上报点选 */
    onSelectConversation(id, target)
  }

  function clearConversation() {
    startDraftChat()
  }

  return (
    <Sidebar collapsible="offcanvas" className="absolute inset-y-0 h-auto">
      <SidebarChrome
        showWorkspaceTools={location.route !== "settings"}
        onSelectConversation={selectConversation}
        conversationTitles={conversationTitles}
      />

      <SidebarContent>
        {location.route === "settings" ? (
          <SettingsSidebar
            activeSection={location.settingsSection}
            onSelectSection={openSettings}
          />
        ) : /* 对话列表只在主页（对话路由）出现，其余页面各显各的内容 */
        location.route === "chat" ? (
          <>
            <SidebarGroup className="px-3 py-1">
              <SidebarGroupContent>
                <SidebarMenu className="gap-0.5">
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      tooltip={t("common.newChat")}
                      isActive={
                        location.route === "chat" && !selectedConversationId
                      }
                      className="font-medium"
                      onClick={() => onCommand("new-conversation")}
                    >
                      <MessageCirclePlusIcon />
                      <span>{t("common.newChat")}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {pinned.length > 0 ? (
              <SidebarGroupSection
                label={t("common.pin")}
                open={pinnedOpen}
                onOpenChange={setPinnedOpen}
              >
                <ConversationItems
                  items={pinned}
                  selectedId={activeConversationId}
                  openIds={openConversationIds}
                  projects={projects}
                  onSelect={selectConversation}
                  onClear={clearConversation}
                  onRefresh={refreshConversations}
                />
              </SidebarGroupSection>
            ) : null}

            <SidebarGroupSection
              label={t("common.projects")}
              open={projectsOpen}
              onOpenChange={setProjectsOpen}
              trailing={
                <TooltipHint label={t("common.newProject")} side="top">
                  <button
                    type="button"
                    aria-label={t("common.newProject")}
                    className={SIDEBAR_TRAILING_ICON_CLASS}
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      setCreatingProject(true)
                    }}
                  >
                    <PlusIcon />
                  </button>
                </TooltipHint>
              }
            >
              {projects.length === 0 ? (
                <SidebarMenuItem>
                  <span className={SIDEBAR_EMPTY_PLACEHOLDER_CLASS}>
                    {t("common.noProjects")}
                  </span>
                </SidebarMenuItem>
              ) : (
                projects.map((project) => (
                  <ProjectGroupRow
                    key={project.id}
                    project={project}
                    items={byProject.get(project.id) ?? []}
                    expanded={!collapsedProjectIds.includes(project.id)}
                    selectedId={activeConversationId}
                    openIds={openConversationIds}
                    onToggle={() =>
                      setCollapsedProjectIds((current) =>
                        current.includes(project.id)
                          ? current.filter((id) => id !== project.id)
                          : [...current, project.id]
                      )
                    }
                    onNewConversation={() => {
                      setSelectedProjectId(project.id)
                      onCommand("new-conversation")
                    }}
                    onRename={async (name) => {
                      await updateProject(
                        project.id,
                        toProjectWriteBody(project, { name })
                      )
                      await refreshProjects()
                    }}
                    onTogglePinned={async () => {
                      const source = dataSourceKey()
                      await queryClient.cancelQueries({
                        queryKey: queryKeys.projects(),
                      })
                      if (source !== dataSourceKey()) return
                      const current = queryClient
                        .getQueryData<ProjectItem[]>(queryKeys.projects())
                        ?.find((item) => item.id === project.id)
                      if (!current) return
                      // 用整数范围偏移保存置顶状态，取消置顶后恢复原排序
                      const sort =
                        current.sort < 0
                          ? current.sort + 2_147_483_648
                          : current.sort - 2_147_483_648
                      await updateProject(
                        current.id,
                        toProjectWriteBody(current, { sort })
                      )
                      if (source !== dataSourceKey()) return
                      queryClient.setQueryData<ProjectItem[]>(
                        queryKeys.projects(),
                        (items) =>
                          items?.map((item) =>
                            item.id === current.id ? { ...item, sort } : item
                          )
                      )
                      void refreshProjects()
                    }}
                    onDelete={async () => {
                      const source = dataSourceKey()
                      await deleteProject(project.id)
                      if (source !== dataSourceKey()) return
                      queryClient.setQueryData<ProjectItem[]>(
                        queryKeys.projects(),
                        (current) =>
                          current?.filter((item) => item.id !== project.id)
                      )
                      queryClient.setQueriesData<
                        CursorPage<ConversationListItem>
                      >({ queryKey: queryKeys.conversations() }, (current) =>
                        current
                          ? {
                              ...current,
                              items: current.items.map((item) =>
                                item.project_id ===
                                project.id
                                  ? { ...item, project_id: null }
                                  : item
                              ),
                            }
                          : current
                      )
                      if (
                        useSelectionStore.getState().selectedProjectId ===
                        project.id
                      ) {
                        setSelectedProjectId(null)
                      }
                      toast.add({
                        title: t("common.projectDeleted"),
                        type: "success",
                      })
                      void refreshProjects()
                      refreshConversations()
                      void setProjectDirectory(project.id, null).catch(
                        (error: unknown) => {
                          if (source !== dataSourceKey()) return
                          toast.add({
                            title: t("common.projectFolderUnbindingFailed"),
                            description:
                              error instanceof Error
                                ? error.message
                                : String(error),
                            type: "warning",
                          })
                        }
                      )
                    }}
                    projects={projects}
                    onSelect={selectConversation}
                    onClear={clearConversation}
                    onRefresh={refreshConversations}
                  />
                ))
              )}
            </SidebarGroupSection>

            <SidebarGroupSection
              label={t("common.recent")}
              open={chatsOpen}
              onOpenChange={setChatsOpen}
            >
              {(byProject.get(null) ?? []).length === 0 ? (
                <SidebarMenuItem>
                  <span className={SIDEBAR_EMPTY_PLACEHOLDER_CLASS}>
                    {t("common.noChatsYet")}
                  </span>
                </SidebarMenuItem>
              ) : (
                <ConversationItems
                  items={byProject.get(null) ?? []}
                  selectedId={activeConversationId}
                  openIds={openConversationIds}
                  projects={projects}
                  onSelect={selectConversation}
                  onClear={clearConversation}
                  onRefresh={refreshConversations}
                />
              )}
            </SidebarGroupSection>
          </>
        ) : location.route === "assistants" ||
          (location.route === "workspace" &&
            isCustomWorkspaceKind(location.workspaceKind)) ? (
          <CustomNavSection />
        ) : location.route === "workspace" &&
          location.workspaceKind === "knowledge" ? (
          <KnowledgeBasesSidebar />
        ) : location.route === "image" ? (
          <ImageRecordsSidebar />
        ) : location.route === "workspace" &&
          location.workspaceKind === "cron" ? (
          <CronRecordsSidebar />
        ) : location.route === "workspace" &&
          location.workspaceKind === "artifact" ? (
          <ArtifactCategoriesSidebar />
        ) : null}
      </SidebarContent>

      <CreateProjectDialog
        open={creatingProject}
        name={projectName}
        pending={createProjectMutation.isPending}
        directory={projectDirectory}
        onOpenChange={(open) => {
          setCreatingProject(open)
          if (!open) {
            setProjectName("")
            setProjectDirectoryState(null)
          }
        }}
        onNameChange={setProjectName}
        onDirectoryChange={(directory) => {
          setProjectDirectoryState(directory)
          if (!projectName.trim() && directory) {
            const folderName = directory
              .replace(/[\\/]+$/, "")
              .split(/[\\/]/)
              .at(-1)
            if (folderName) setProjectName(folderName)
          }
        }}
        onSubmit={(name) =>
          createProjectMutation.mutate({ name, directory: projectDirectory })
        }
      />
      <SidebarRail />
    </Sidebar>
  )
}
