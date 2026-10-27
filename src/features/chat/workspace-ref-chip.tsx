import { useQuery } from "@tanstack/react-query"
import { BookOpenIcon, LayersIcon, XIcon } from "lucide-react"

import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment"
import { listArtifacts, listKnowledgeBasesWithDocuments } from "@/api"
import { queryKeys } from "@/api/query-keys"
import { useComposerStore } from "@/features/chat/composer-store"
import { workspaceRefLabel } from "@/features/chat/workspace-ref"
import { useT } from "@/hooks/use-t"

export function WorkspaceRefChip() {
  const t = useT()
  const workspaceRef = useComposerStore((state) => state.workspace_ref)
  const setWorkspaceRef = useComposerStore((state) => state.setWorkspaceRef)
  const knowledgeQuery = useQuery({
    queryKey: queryKeys.knowledge(),
    queryFn: listKnowledgeBasesWithDocuments,
  })
  const artifactsQuery = useQuery({
    queryKey: queryKeys.artifacts(),
    queryFn: () => listArtifacts(),
  })

  if (!workspaceRef || workspaceRef.kind === "skill") {
    return null
  }

  const name = workspaceRefLabel(workspaceRef, {
    /* 缓存里是知识库连同文档，取名时用平铺后的知识 */
    knowledge: (knowledgeQuery.data ?? []).flatMap((base) => base.documents),
    artifacts: artifactsQuery.data,
  })

  const Icon = workspaceRef.kind === "knowledge" ? BookOpenIcon : LayersIcon

  return (
    <Attachment data-slot="composer-attachment" state="done" size="sm">
      <AttachmentMedia variant="icon">
        <Icon />
      </AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle>{name}</AttachmentTitle>
        <AttachmentDescription>
          {workspaceRef.kind === "knowledge"
            ? t("common.knowledge")
            : t("common.artifacts")}
        </AttachmentDescription>
      </AttachmentContent>
      <AttachmentActions>
        <AttachmentAction
          type="button"
          aria-label={t("common.removeReference")}
          onClick={() => setWorkspaceRef(null)}
        >
          <XIcon />
        </AttachmentAction>
      </AttachmentActions>
    </Attachment>
  )
}
