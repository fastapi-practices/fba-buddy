import { create } from "zustand"
import { startDraftChat } from "@/app/navigation"
import { useComposerStore } from "@/features/chat/composer-store"
import { useSelectionStore } from "@/features/shell/selection-store"
import { dataSourceKey, useAccountSourceStore } from "@/lib/account-source"
import type { WorkspaceEnvironment } from "@/shared/workspace"

export type WorktreeDraft = {
  conversationId: string
  path: string | null
  head?: string
  mode: "local" | "worktree"
  branch: string | null
  baseBranch: string | null
  projectId?: number | null
  sourcePath: string
  source: string
  paneKey: string
}

export const useWorktreeDraftStore = create<{ draft: WorktreeDraft | null }>(
  () => ({ draft: null })
)

export function configureWorktreeDraft(
  environment: WorkspaceEnvironment,
  conversationId: string,
  paneKey: string,
  projectId: number | null
) {
  useWorktreeDraftStore.setState({
    draft: {
      conversationId,
      paneKey,
      projectId,
      source: dataSourceKey(),
      mode: environment.mode,
      path: environment.path,
      sourcePath: environment.sourcePath,
      branch: environment.branch,
      baseBranch: environment.baseBranch,
    },
  })
}

export function startWorktreeDraft(
  draft: Omit<WorktreeDraft, "paneKey" | "mode" | "baseBranch">
) {
  if (
    !useAccountSourceStore.getState().ready ||
    draft.source !== dataSourceKey()
  )
    return false
  useComposerStore.getState().clearInput()
  useSelectionStore.getState().setFocusedChatPane("left")
  startDraftChat()
  useComposerStore.getState().setAgentMode("coding")
  useWorktreeDraftStore.setState({
    draft: {
      ...draft,
      mode: "worktree",
      baseBranch: null,
      paneKey: useSelectionStore.getState().chatPaneKey,
    },
  })
  return true
}

export function useWorktreeDraft(paneKey: string) {
  const source = useAccountSourceStore(dataSourceKey)
  return useWorktreeDraftStore((state) =>
    state.draft?.source === source && state.draft.paneKey === paneKey
      ? state.draft
      : null
  )
}
