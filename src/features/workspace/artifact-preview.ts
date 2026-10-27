import { downloadArtifact } from "@/api/workspace"
import { PREVIEW_BYTE_LIMIT } from "@/features/chat/file-preview-data"
import { artifactFileFormat } from "@/features/workspace/artifact-format"
import type { WorkspaceArtifactListItem } from "@/lib/types"

export function artifactPreviewMetadata(artifact: WorkspaceArtifactListItem) {
  const { name, mimeType } = artifactFileFormat(artifact)
  const supported =
    /^(?:image|audio|video|text)\//.test(mimeType) ||
    mimeType === "application/pdf" ||
    mimeType === "application/json"
  return supported ? { name, mimeType } : null
}

export async function loadArtifactPreview(
  artifact: WorkspaceArtifactListItem,
  signal: AbortSignal
) {
  signal.throwIfAborted()
  const metadata = artifactPreviewMetadata(artifact)
  if (!metadata) throw new Error("common.artifactPreviewUnsupported")
  if ((artifact.size ?? 0) > PREVIEW_BYTE_LIMIT)
    throw new RangeError("common.previewResourceLimit")
  const blob = await downloadArtifact(artifact.id, signal)
  signal.throwIfAborted()
  if (blob.size > PREVIEW_BYTE_LIMIT)
    throw new RangeError("common.previewResourceLimit")
  return { ...metadata, blob: blob.slice(0, blob.size, metadata.mimeType) }
}
