import { useQuery } from "@tanstack/react-query"
import { getConversation } from "@/api/conversations"
import { useT } from "@/hooks/use-t"
import {
  currentAccountSource,
  dataSourceKey,
  useAccountSourceStore,
} from "@/lib/account-source"
import { conversationProjectId } from "@/lib/conversation-workspace"
import { bindProjectConversation } from "@/lib/project-workspace"

export function workspaceEnvironmentQueryKey(
  sourceKey: string,
  conversationId: string | null,
  projectId: number | null
) {
  return ["workspace-environment", sourceKey, conversationId, projectId] as const
}

export function useWorkspaceEnvironment({
  conversationId,
  projectId,
  draftConversationId,
  enabled = true,
}: {
  conversationId: string | null
  projectId?: number | null
  draftConversationId?: string | null
  enabled?: boolean
}) {
  const t = useT()
  const sourceKey = useAccountSourceStore(dataSourceKey)
  const ready = useAccountSourceStore((state) => state.ready)
  const workspaceId = conversationId ?? draftConversationId ?? null
  const normalizedProjectId = projectId ?? null

  return useQuery({
    queryKey: workspaceEnvironmentQueryKey(
      sourceKey,
      workspaceId,
      normalizedProjectId
    ),
    enabled: enabled && ready && Boolean(window.buddyDesktop?.workspace),
    queryFn: async () => {
      if (conversationId) {
        const conversation = await getConversation(conversationId, {
          messageLimit: 1,
          silent: true,
        })
        if (sourceKey !== dataSourceKey())
          throw new DOMException("账号已切换", "AbortError")
        await bindProjectConversation(
          conversationId,
          conversationProjectId(conversation)
        )
      }
      const source = currentAccountSource() ?? undefined
      const result = await window.buddyDesktop!.workspace(
        conversationId
          ? {
              action: "lock-environment",
              conversationId,
              ...(normalizedProjectId == null
                ? {}
                : { projectId: normalizedProjectId }),
              source,
            }
          : {
              action: "environment",
              ...(workspaceId ? { conversationId: workspaceId } : {}),
              ...(normalizedProjectId == null
                ? {}
                : { projectId: normalizedProjectId }),
              source,
            }
      )
      if (!result || !("environment" in result))
        throw new Error(t("common.gitResponseInvalid"))
      return result.environment
    },
  })
}
