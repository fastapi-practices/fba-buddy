import type { WorkspaceKnowledgeItem } from "@/lib/types"

const IMAGE_PLACEHOLDER = /^\s*\[image\]\s+([^\r\n]+)\s*(?:\r?\n|$)/i
const MARKDOWN_IMAGE =
  /!\[([^\]]*)\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+["'][^"']*["'])?\s*\)/
const IMAGE_SOURCE = /^(?:data:image\/|blob:|https?:\/\/|\/\/)/i

function sourceFilename(source: string | null | undefined): string | null {
  if (!source) return null
  if (/^(?:data:|blob:)/i.test(source)) return null
  const filename = source.split(/[\\/]/).at(-1)?.split(/[?#]/)[0]?.trim()
  return filename || null
}

export type KnowledgeImageOverview = {
  source: string | null
  filename: string
  text: string
}

export function knowledgeImageOverview(
  document: WorkspaceKnowledgeItem,
  content = document.content ?? ""
): KnowledgeImageOverview {
  const value = content.trim()
  const markdown = value.match(MARKDOWN_IMAGE)
  if (markdown) {
    const source = markdown[2] ?? markdown[3] ?? null
    return {
      source,
      filename:
        markdown[1]?.trim() ||
        sourceFilename(source) ||
        sourceFilename(document.source) ||
        document.title,
      text: value.replace(markdown[0], "").trim(),
    }
  }
  if (IMAGE_SOURCE.test(value)) {
    return {
      source: value,
      filename: sourceFilename(document.source) || document.title,
      text: "",
    }
  }
  const placeholder = value.match(IMAGE_PLACEHOLDER)
  return {
    source: null,
    filename:
      placeholder?.[1]?.trim() ||
      sourceFilename(document.source) ||
      document.title,
    text: placeholder ? value.replace(placeholder[0], "").trim() : value,
  }
}
