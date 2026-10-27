import type {
  ConversationDetail,
  ConversationListItem,
  ConversationWorkspace,
} from "@/lib/types"

const EMPTY_CONVERSATION_WORKSPACE: ConversationWorkspace = {
  project_id: null,
  assistant_id: null,
  goal: null,
}

type ConversationWorkspaceSource = Pick<
  ConversationListItem & ConversationDetail,
  "project_id" | "assistant_id"
> &
  Partial<Pick<ConversationDetail, "goal">>

export function conversationProjectId(
  item: ConversationWorkspaceSource | null | undefined
): number | null {
  if (!item) {
    return null
  }
  return item.project_id
}

export function conversationAssistantId(
  item: ConversationWorkspaceSource | null | undefined
): number | null {
  if (!item) {
    return null
  }
  return item.assistant_id
}

export function workspaceFromConversation(
  item: ConversationWorkspaceSource | null | undefined
): ConversationWorkspace {
  if (!item) {
    return { ...EMPTY_CONVERSATION_WORKSPACE }
  }
  return {
    project_id: conversationProjectId(item),
    assistant_id: conversationAssistantId(item),
    goal: item.goal ?? null,
  }
}

export function mergeConversationWorkspace(
  current: ConversationWorkspace,
  patch: Partial<ConversationWorkspace>
): ConversationWorkspace {
  return {
    project_id:
      patch.project_id !== undefined ? patch.project_id : current.project_id,
    assistant_id:
      patch.assistant_id !== undefined
        ? patch.assistant_id
        : current.assistant_id,
    goal: patch.goal !== undefined ? patch.goal : current.goal,
  }
}

export function toConversationWorkspaceBody(workspace: ConversationWorkspace) {
  return {
    project_id: workspace.project_id,
    assistant_id: workspace.assistant_id,
    goal: workspace.goal,
  }
}
