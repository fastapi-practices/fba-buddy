import type { KnowledgeFileType } from "@/lib/types"

const KNOWLEDGE_EXTENSIONS: Record<string, KnowledgeFileType> = {
  md: "md",
  markdown: "md",
  txt: "txt",
  text: "txt",
  pdf: "pdf",
  docx: "docx",
  pptx: "pptx",
  xlsx: "xlsx",
  png: "image",
  jpg: "image",
  jpeg: "image",
  webp: "image",
  gif: "image",
  bmp: "image",
  tif: "image",
  tiff: "image",
}

export const KNOWLEDGE_UPLOAD_ACCEPT = [
  ...Object.keys(KNOWLEDGE_EXTENSIONS),
  "zip",
]
  .map((extension) => `.${extension}`)
  .join(",")

export function knowledgeUploadFileType(
  name: string
): KnowledgeFileType | null {
  const dot = name.lastIndexOf(".")
  const extension = dot < 0 ? "" : name.slice(dot + 1).toLowerCase()
  return Object.hasOwn(KNOWLEDGE_EXTENSIONS, extension)
    ? KNOWLEDGE_EXTENSIONS[extension]!
    : null
}

export function supportsKnowledgeUpload(name: string): boolean {
  return (
    name.toLowerCase().endsWith(".zip") ||
    knowledgeUploadFileType(name) !== null
  )
}
