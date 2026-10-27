import { useAgentMode } from "@/features/chat/conversation-mode"
import { useContext, useEffect } from "react"
import { RightSidebarChromeContext } from "@/features/shell/right-sidebar-chrome-context"
import {
  useRightSidebar,
  type ChatPaneSide,
} from "@/features/shell/right-sidebar-store"
import type { WorktreeDraft } from "./worktree-draft"
import { useWorkspaceEnvironment } from "./use-workspace-environment"

export function useWorkspaceGitPanel(
  hostKey: string,
  conversationId: string | null,
  worktreeDraft?: WorktreeDraft | null,
  pane: ChatPaneSide = "left",
  projectId?: number | null
) {
  const coding = useAgentMode() === "coding"
  const pendingWorktree =
    !conversationId && worktreeDraft?.mode === "worktree" && !worktreeDraft.path
  const workspaceConversationId =
    conversationId ??
    (pendingWorktree ? null : (worktreeDraft?.conversationId ?? null))
  const workspaceProjectId = pendingWorktree ? null : projectId
  const environmentQuery = useWorkspaceEnvironment({
    conversationId,
    projectId: workspaceProjectId,
    draftConversationId:
      workspaceConversationId === conversationId
        ? null
        : workspaceConversationId,
    enabled: !!window.buddyDesktop?.workspace,
  })
  const workspaceBackend = environmentQuery.data?.backend ?? null
  const available =
    coding &&
    (!!workspaceConversationId || workspaceProjectId != null) &&
    !!window.buddyDesktop?.workspace &&
    workspaceBackend === "local"
  const sidebar = useRightSidebar(hostKey)
  const chrome = useContext(RightSidebarChromeContext)
  const setDiffAvailability = chrome?.setDiffAvailability
  useEffect(() => {
    if (!setDiffAvailability) return
    setDiffAvailability((current) =>
      current[hostKey]?.[pane] === available
        ? current
        : { ...current, [hostKey]: { ...current[hostKey], [pane]: available } }
    )
    return () => {
      setDiffAvailability((current) => {
        const next = { ...current }
        const panes = { ...next[hostKey] }
        delete panes[pane]
        if (Object.keys(panes).length) next[hostKey] = panes
        else delete next[hostKey]
        return next
      })
    }
  }, [setDiffAvailability, hostKey, pane, available])
  const open =
    available &&
    sidebar.open &&
    sidebar.activePanel === "diff" &&
    sidebar.diffPane === pane
  return {
    workspaceConversationId,
    workspaceProjectId,
    workspaceBackend,
    open,
  }
}
