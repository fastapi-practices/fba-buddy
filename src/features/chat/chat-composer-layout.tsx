import { useContext } from "react"

import type { ComposerLayoutProps } from "@/components/ai-elements/thread"

import { ChatComposer } from "./chat-composer"
import { ChatPaneSlotsContext } from "./chat-pane-slots"
import { ComposerContextDisplay } from "./composer-context-display"
import {
  ComposerWorkContext,
  ComposerWorkLocation,
} from "./composer-work-context"
import { ConversationProjectSelector } from "./conversation-project-selector"

// Slot components stay the same function identity so a model catalog refresh
// does not remount the composer picker.
export function ChatComposerLayoutSlot({
  input,
  actions,
}: ComposerLayoutProps) {
  const {
    paneKey,
    conversationId,
    projectId,
    onProjectChange,
    projectDisabled,
    worktreeDraft,
    providers,
    defaultModel,
  } = useContext(ChatPaneSlotsContext)
  return (
    <ChatComposer
      input={input}
      actions={actions}
      providers={providers}
      defaultModel={defaultModel}
      conversationId={conversationId}
      project={
        <ConversationProjectSelector
          conversationId={conversationId}
          draftProjectId={projectId}
          disabled={projectDisabled}
          onDraftProjectChange={onProjectChange}
        />
      }
      codingContext={
        <ComposerWorkContext
          paneKey={paneKey}
          conversationId={conversationId}
          projectId={projectId}
          onProjectChange={onProjectChange}
          projectDisabled={projectDisabled}
          worktreeDraft={worktreeDraft}
        />
      }
      workLocation={
        <ComposerWorkLocation
          paneKey={paneKey}
          conversationId={conversationId}
          projectId={projectId}
          worktreeDraft={worktreeDraft}
        />
      }
      usage={<ComposerContextDisplay providers={providers} />}
    />
  )
}
