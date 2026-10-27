import { useAgentMode } from "@/features/chat/conversation-mode"
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react"
import { toast } from "@/components/ui/toast"
import { useT } from "@/hooks/use-t"
import type { WorkspaceBackend } from "@/shared/workspace"
import {
  currentAccountSource,
  dataSourceKey,
  useAccountSourceStore,
} from "@/lib/account-source"
import { useWorkspaceGit } from "./use-workspace-git"
import { WorkspaceGitCommit } from "./workspace-git-commit"
import { gitEntryConflict, gitEntryGroups } from "./workspace-git-state"

type WorkspaceGitSession = {
  conversationId: string | null
  git: ReturnType<typeof useWorkspaceGit>
  commitOpen: boolean
  openCommit: () => void
}

const WorkspaceGitSessionContext = createContext<WorkspaceGitSession | null>(
  null
)

// eslint-disable-next-line react-refresh/only-export-components -- 会话上下文与对应 Hook 保持同一入口
export function useWorkspaceGitSession() {
  return useContext(WorkspaceGitSessionContext)
}

export function WorkspaceGitProvider({
  children,
  conversationId,
  projectId,
  backend,
  chatRunning,
  panelOpen,
}: {
  children: ReactNode
  conversationId: string | null
  projectId?: number | null
  backend: WorkspaceBackend | null
  chatRunning: boolean
  panelOpen: boolean
}) {
  const source = useAccountSourceStore(dataSourceKey)
  const coding = useAgentMode() === "coding"
  const available =
    coding &&
    Boolean(conversationId || projectId != null) &&
    backend === "local" &&
    Boolean(window.buddyDesktop?.workspace)
  const scope = `${source}:${conversationId ?? `project-${projectId}`}`
  const [current, setCurrent] = useState<{
    scope: string
    session: WorkspaceGitSession
  } | null>(null)
  const publish = useCallback((scope: string, session: WorkspaceGitSession) => {
    setCurrent({ scope, session })
  }, [])

  // Git 生命周期按工作区隔离，聊天编辑器保持在稳定的上下文层级
  return (
    <WorkspaceGitSessionContext
      value={available && current?.scope === scope ? current.session : null}
    >
      {children}
      {available ? (
        <WorkspaceGitSessionController
          key={scope}
          scope={scope}
          publish={publish}
          conversationId={conversationId}
          projectId={projectId}
          chatRunning={chatRunning}
          panelOpen={panelOpen}
        />
      ) : null}
    </WorkspaceGitSessionContext>
  )
}

const WorkspaceGitSessionController = memo(
  function WorkspaceGitSessionController({
    scope,
    publish,
    conversationId,
    projectId,
    chatRunning,
    panelOpen,
  }: {
    scope: string
    publish: (scope: string, session: WorkspaceGitSession) => void
    conversationId: string | null
    projectId?: number | null
    chatRunning: boolean
    panelOpen: boolean
  }) {
    const t = useT()
    const [commitOpen, setCommitOpen] = useState(false)
    const git = useWorkspaceGit(
      conversationId,
      currentAccountSource(),
      projectId,
      chatRunning,
      panelOpen || commitOpen,
      panelOpen
    )
    const staged = gitEntryGroups(git.status?.entries ?? []).staged
    const conflicts = git.status?.entries.some(gitEntryConflict) ?? false
    const commitDisabled =
      git.loading ||
      git.busy ||
      !!git.error ||
      !git.status?.repository ||
      !staged.length ||
      conflicts
    const session = {
      conversationId,
      git,
      commitOpen,
      openCommit: () => {
        if (git.busy) return
        git.clearActionError()
        void git.refresh()
        setCommitOpen(true)
      },
    }
    useLayoutEffect(() => {
      publish(scope, session)
    })
    return (
      <WorkspaceGitCommit
        open={commitOpen}
        onOpenChange={setCommitOpen}
        branch={git.status?.branch ?? null}
        entries={staged}
        loading={git.loading}
        busy={git.busy}
        disabled={commitDisabled}
        error={
          git.actionError ||
          git.error ||
          (conflicts ? t("common.gitConflictsHint") : "")
        }
        onCommit={async (message) => {
          if (commitDisabled) return false
          const result = await git.commit(message)
          if (!result || !("commit" in result)) return false
          toast.add({
            title: t("common.gitCommitSuccess", {
              hash: result.commit.hash.slice(0, 8),
            }),
            type: "success",
          })
          return true
        }}
      />
    )
  }
)
