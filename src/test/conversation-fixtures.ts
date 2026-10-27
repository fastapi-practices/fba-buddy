import type { ConversationDetail, ConversationListItem } from "@/lib/types"

export function conversationDetailFixture(
  patch: Partial<ConversationDetail> & Pick<ConversationDetail, "id">
): ConversationDetail {
  return {
    ...patch,
    id: patch.id,
    conversation_id: patch.conversation_id ?? `conversation-${patch.id}`,
    title: patch.title ?? "Conversation",
    agent_mode: patch.agent_mode ?? "chat",
    project_id: patch.project_id ?? null,
    assistant_id: patch.assistant_id ?? null,
    goal: patch.goal ?? null,
    origin: patch.origin ?? "web",
    surface: patch.surface ?? "chat",
    is_pinned: patch.is_pinned ?? false,
    is_archived: patch.is_archived ?? false,
    is_generating: patch.is_generating ?? false,
    source: patch.source ?? "cloud",
    provider_id: patch.provider_id ?? 1,
    model_id: patch.model_id ?? "test-model",
    revision: patch.revision ?? 1,
    created_time: patch.created_time ?? "2026-01-01T00:00:00Z",
    updated_time: patch.updated_time ?? null,
    messages_snapshot: patch.messages_snapshot ?? { messages: [] },
    history_has_more: patch.history_has_more ?? false,
    history_cursor: patch.history_cursor ?? null,
  }
}

export function conversationListItemFixture(
  patch: Partial<ConversationListItem> &
    Pick<ConversationListItem, "id" | "title">
): ConversationListItem {
  return {
    ...patch,
    id: patch.id,
    conversation_id: patch.conversation_id ?? `conversation-${patch.id}`,
    title: patch.title,
    agent_mode: patch.agent_mode ?? "chat",
    project_id: patch.project_id ?? null,
    assistant_id: patch.assistant_id ?? null,
    goal: patch.goal ?? null,
    origin: patch.origin ?? "web",
    surface: patch.surface ?? "chat",
    is_pinned: patch.is_pinned ?? false,
    is_archived: patch.is_archived ?? false,
    is_generating: patch.is_generating ?? false,
    source: patch.source ?? "cloud",
    last_message_preview: patch.last_message_preview ?? null,
    last_message_time: patch.last_message_time ?? null,
    revision: patch.revision ?? 1,
    created_time: patch.created_time ?? "2026-01-01T00:00:00Z",
    updated_time: patch.updated_time ?? null,
  }
}
