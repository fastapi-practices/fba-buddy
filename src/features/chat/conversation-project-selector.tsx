import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { FolderIcon, FolderPlusIcon, FolderXIcon } from "lucide-react"

import { getConversation, listConversations, listProjects } from "@/api"
import { createProjectWithDirectory } from "@/api/project-workspace"
import { queryKeys } from "@/api/query-keys"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty"
import { toast } from "@/components/ui/toast"
import { matchesPickerQuery } from "@/features/chat/composer-picker-query"
import { PickerSearch } from "@/features/chat/composer-picker-search"
import { CreateProjectDialog } from "@/features/shell/create-project-dialog"
import { useT } from "@/hooks/use-t"
import { conversationProjectId } from "@/lib/conversation-workspace"
import { dataSourceKey, useAccountSourceStore } from "@/lib/account-source"
import { notifyError } from "@/lib/notify"
import { projectDirectoryName } from "@/lib/project-workspace"
import type { ProjectItem } from "@/lib/types"

export function ConversationProjectSelector({
  conversationId,
  draftProjectId,
  disabled,
  onDraftProjectChange,
}: {
  conversationId: string | null
  draftProjectId: number | null
  disabled: boolean
  onDraftProjectChange: (projectId: number | null) => void
}) {
  const t = useT()
  const queryClient = useQueryClient()
  const ready = useAccountSourceStore((state) => state.ready)
  const source = useAccountSourceStore(dataSourceKey)
  const [query, setQuery] = useState("")
  const [creatingProject, setCreatingProject] = useState(false)
  const [projectName, setProjectName] = useState("")
  const [projectDirectory, setProjectDirectory] = useState<string | null>(null)
  const projectsQuery = useQuery({
    queryKey: queryKeys.projects(),
    queryFn: listProjects,
    enabled: ready,
  })
  const conversationsQuery = useQuery({
    queryKey: queryKeys.conversations(),
    queryFn: () => listConversations(),
    enabled: ready,
  })
  const conversation = conversationsQuery.data?.items.find(
    (item) => item.conversation_id === conversationId
  )
  const detailKey = [
    ...queryKeys.conversations(),
    "composer-workspace",
    source,
    conversationId,
  ] as const
  const detailQuery = useQuery({
    queryKey: detailKey,
    queryFn: () => getConversation(conversationId!, { messageLimit: 50 }),
    enabled: ready && Boolean(conversationId) && !conversation,
  })
  const workspace = conversation ?? detailQuery.data
  const projectId = conversationId
    ? conversationProjectId(workspace)
    : draftProjectId
  const projects = projectsQuery.data ?? []
  const filteredProjects = projects.filter((item) =>
    matchesPickerQuery(query, item.name)
  )
  const project = projects.find((item) => item.id === projectId)
  const createProjectMutation = useMutation({
    mutationFn: createProjectWithDirectory,
    onMutate: async () => {
      const source = dataSourceKey()
      await queryClient.cancelQueries({ queryKey: queryKeys.projects() })
      if (source !== dataSourceKey())
        throw new DOMException("账号已切换", "AbortError")
      return {
        source,
        existingIds: new Set(
          queryClient
            .getQueryData<ProjectItem[]>(queryKeys.projects())
            ?.map((item) => item.id)
        ),
      }
    },
    onSuccess: async ({ project, directoryError }, { name }, context) => {
      if (context.source !== dataSourceKey()) return
      await queryClient.invalidateQueries({ queryKey: queryKeys.projects() })
      if (context.source !== dataSourceKey()) return
      const created = project
        ? [project]
        : (
            queryClient.getQueryData<ProjectItem[]>(queryKeys.projects()) ?? []
          ).filter(
            (item) => !context.existingIds.has(item.id) && item.name === name
          )
      if (created.length === 1) onDraftProjectChange(created[0]!.id)
      if (directoryError)
        notifyError(
          `${t("common.projectFolderBindingFailed")}：${directoryError instanceof Error ? directoryError.message : String(directoryError)}`
        )
      else toast.add({ title: t("common.projectCreated"), type: "success" })
      setCreatingProject(false)
      setProjectName("")
      setProjectDirectory(null)
    },
    onError: (error, _variables, context) => {
      if (context?.source !== dataSourceKey() || error.name === "AbortError")
        return
      notifyError(error.message || t("common.requestFailed"))
    },
  })
  const label =
    projectsQuery.isError || (!conversation && detailQuery.isError)
      ? t("common.requestFailed")
      : projectsQuery.isPending || (conversationId && !workspace)
        ? t("common.loading")
        : (project?.name ??
          t(projectId == null ? "common.noProject" : "common.projects"))
  const unavailable =
    disabled ||
    createProjectMutation.isPending ||
    !ready ||
    projectsQuery.isPending ||
    projectsQuery.isError ||
    Boolean(conversationId) ||
    Boolean(conversationId && !workspace)

  function choose(nextProjectId: number | null) {
    if (unavailable || nextProjectId === projectId) return
    onDraftProjectChange(nextProjectId)
  }

  return (
    <>
      <DropdownMenu onOpenChange={() => setQuery("")}>
        <DropdownMenuTrigger
          aria-label={`${t("chat.chooseProject")}: ${label}`}
          disabled={unavailable}
          render={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 max-w-56 min-w-0 shrink rounded-full data-popup-open:bg-muted"
            />
          }
        >
          <FolderIcon data-icon="inline-start" />
          <span className="min-w-0 truncate">{label}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          side="top"
          className="flex w-72 max-w-[calc(100vw-2rem)] flex-col overflow-hidden"
        >
          <PickerSearch
            value={query}
            placeholder={t("chat.searchProjects")}
            onChange={setQuery}
          />
          <DropdownMenuRadioGroup
            className="flex min-h-0 flex-col"
            value={projectId == null ? "none" : String(projectId)}
            onValueChange={(value) => {
              if (value === "none") {
                choose(null)
                return
              }
              const next = projects.find((item) => String(item.id) === value)
              if (next) choose(next.id)
            }}
          >
            <DropdownMenuGroup className="max-h-64 min-h-0 overflow-y-auto">
              {filteredProjects.map((item) => (
                <DropdownMenuRadioItem
                  key={item.id}
                  value={String(item.id)}
                  closeOnClick
                >
                  <FolderIcon />
                  <span className="truncate">{item.name}</span>
                </DropdownMenuRadioItem>
              ))}
              {filteredProjects.length === 0 ? (
                <Empty className="p-4">
                  <EmptyHeader>
                    <EmptyDescription>
                      {t(
                        query.trim()
                          ? "chat.noProjectsFound"
                          : "common.noProjects"
                      )}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : null}
            </DropdownMenuGroup>
            <DropdownMenuSeparator className="shrink-0" />
            <DropdownMenuGroup className="shrink-0">
              <DropdownMenuItem onClick={() => setCreatingProject(true)}>
                <FolderPlusIcon />
                {t("common.newProject")}
              </DropdownMenuItem>
              <DropdownMenuRadioItem value="none" closeOnClick>
                <FolderXIcon />
                {t("chat.workWithoutProject")}
              </DropdownMenuRadioItem>
            </DropdownMenuGroup>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateProjectDialog
        open={creatingProject}
        name={projectName}
        directory={projectDirectory}
        pending={createProjectMutation.isPending}
        onOpenChange={(open) => {
          setCreatingProject(open)
          if (!open) {
            setProjectName("")
            setProjectDirectory(null)
          }
        }}
        onNameChange={setProjectName}
        onDirectoryChange={(directory) => {
          setProjectDirectory(directory)
          if (!projectName.trim() && directory)
            setProjectName(projectDirectoryName(directory))
        }}
        onSubmit={(name) =>
          createProjectMutation.mutate({ name, directory: projectDirectory })
        }
      />
    </>
  )
}
