import type { WorkspaceArtifactListItem } from "@/lib/types"

const EXTENSION_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  avif: "image/avif",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  md: "text/markdown",
  markdown: "text/markdown",
  html: "text/html",
  htm: "text/html",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  json: "application/json",
  txt: "text/plain",
  text: "text/plain",
}

export function artifactFileFormat(artifact: WorkspaceArtifactListItem) {
  if (!artifact.relative_path) {
    return { name: `artifact-${artifact.id}.md`, mimeType: "text/markdown" }
  }
  const name = artifact.relative_path.split("/").at(-1)!
  const dot = name.lastIndexOf(".")
  const extension = dot < 0 ? "" : name.slice(dot + 1).toLowerCase()
  const declared = artifact.mime_type?.split(";")[0]?.trim().toLowerCase()
  const mimeType =
    declared && declared !== "application/octet-stream"
      ? declared
      : Object.hasOwn(EXTENSION_TYPES, extension)
        ? EXTENSION_TYPES[extension]!
        : "application/octet-stream"
  return { name, mimeType }
}
