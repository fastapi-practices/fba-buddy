import { useAgentMode } from "@/features/chat/conversation-mode"
import { DropdownMenuGroup } from "@/components/ui/dropdown-menu"
import { ComposerAcpSelector } from "@/features/chat/composer-acp-selector"
import { ConversationProjectSelector } from "@/features/chat/conversation-project-selector"
import { ComposerEnvironmentPicker } from "@/features/chat/composer-environment-picker"
import type { WorktreeDraft } from "@/features/chat/worktree-draft"
import { useWorktreeDraftStore } from "@/features/chat/worktree-draft"
import { useChatRuntimeState } from "@/features/chat/chat-runtime"

export function ComposerWorkContext({
  conversationId,
  projectId,
  projectDisabled,
  onProjectChange,
  worktreeDraft,
  paneKey,
}: {
  conversationId: string | null
  projectId: number | null
  projectDisabled: boolean
  onProjectChange: (projectId: number | null) => void
  worktreeDraft?: WorktreeDraft | null
  paneKey: string
}) {
  const mode = useAgentMode()
  const coding = mode === "coding"
  const hasMessages = useChatRuntimeState((state) => state.thread.messages.length > 0)
  const started = Boolean(conversationId) || hasMessages
  if (mode === "chat") return null
  const environment = (
    <ComposerEnvironmentPicker
      submenu={started}
      conversationId={conversationId}
      projectId={projectId}
      draft={worktreeDraft}
      paneKey={paneKey}
    />
  )
  if (started)
    return (
      <DropdownMenuGroup data-slot="composer-context-menu">
        {environment}
      </DropdownMenuGroup>
    )
  if (!coding) return null
  return (
    <div
      data-slot="composer-context-header"
      className="chat-composer-context-header mx-3 -mb-3 flex min-w-0 flex-wrap items-center gap-1 rounded-t-2xl px-2 pt-1 pb-4"
    >
      {coding && (
        <ConversationProjectSelector
          conversationId={conversationId}
          draftProjectId={projectId}
          disabled={projectDisabled}
          onDraftProjectChange={(projectId) => {
            if (worktreeDraft) useWorktreeDraftStore.setState({ draft: null })
            onProjectChange(projectId)
          }}
        />
      )}
      {coding && <ComposerAcpSelector />}
      {environment}
    </div>
  )
}

export function ComposerWorkLocation({
  conversationId,
  projectId,
  worktreeDraft,
  paneKey,
}: {
  conversationId: string | null
  projectId: number | null
  worktreeDraft?: WorktreeDraft | null
  paneKey: string
}) {
  const mode = useAgentMode()
  const hasMessages = useChatRuntimeState((state) => state.thread.messages.length > 0)
  const started = Boolean(conversationId) || hasMessages
  if (mode !== "work" || started) return null
  return (
    <ComposerEnvironmentPicker
      submenu={false}
      conversationId={conversationId}
      projectId={projectId}
      draft={worktreeDraft}
      paneKey={paneKey}
    />
  )
}
