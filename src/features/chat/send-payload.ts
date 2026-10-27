import { buildOutgoingContent } from "@/features/chat/attachments"
import { resolveChatForwardedProps } from "@/features/chat/forwarded-props"
import type { TranscriptQuoteAnchor } from "@/features/chat/transcript-state"
import { quoteAnchor } from "@/shared/inline-quotes"
import { skillRefFromText } from "@/features/chat/workspace-ref"
import type {
  ChatAttachment,
  ChatSendPayload,
  ForwardedProps,
} from "@/lib/types"

export function workspaceRefForSend(
  composer: ForwardedProps,
  text: string
): ForwardedProps["workspace_ref"] {
  const fromText = skillRefFromText(text)
  if (fromText) {
    return fromText
  }
  if (composer.workspace_ref?.kind === "skill") {
    return null
  }
  return composer.workspace_ref
}

export function buildChatSendPayload(input: {
  conversationId: string
  projectId?: number | null
  assistantId?: number | null
  state?: ChatSendPayload["state"]
  messageId: string
  text: string
  attachments: ChatAttachment[]
  composer: ForwardedProps
  deferredApprovals?: Record<string, boolean>
  quote?: TranscriptQuoteAnchor
}): ChatSendPayload {
  const quote = input.quote ? quoteAnchor(input.quote) : undefined
  return {
    conversation_id: input.conversationId,
    state: input.state,
    ...(input.projectId != null ? { project_id: input.projectId } : {}),
    ...(input.assistantId != null ? { assistant_id: input.assistantId } : {}),
    messages: [
      {
        id: input.messageId,
        role: "user",
        content: buildOutgoingContent(input.text, input.attachments),
      },
    ],
    forwarded_props: {
      ...resolveChatForwardedProps(
        {
          ...input.composer,
          workspace_ref: workspaceRefForSend(input.composer, input.text),
        },
        {
          conversationId: input.conversationId,
          deferred_approvals: input.deferredApprovals,
        }
      ),
      ...(quote ? { quote } : {}),
    },
  }
}
