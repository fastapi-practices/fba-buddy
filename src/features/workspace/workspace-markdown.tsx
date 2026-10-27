import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"

import { isMarkdownFormat } from "@/features/workspace/workspace-records"
import { cn } from "@/lib/utils"

const DOCUMENT_CLASS =
  "text-sm leading-relaxed [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:my-3 [&_blockquote]:border-s-2 [&_blockquote]:border-muted-foreground/30 [&_blockquote]:ps-4 [&_blockquote]:text-muted-foreground [&_code]:rounded-md [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_h1]:mt-5 [&_h1]:mb-2 [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:first:mt-0 [&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:first:mt-0 [&_h3]:mt-3 [&_h3]:mb-1.5 [&_h3]:font-medium [&_hr]:my-4 [&_hr]:border-border [&_img]:my-3 [&_img]:max-w-full [&_img]:rounded-lg [&_li]:my-0.5 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:ps-5 [&_p]:my-2 [&_p]:first:mt-0 [&_p]:last:mb-0 [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:my-3 [&_table]:w-full [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-border [&_th]:bg-muted/50 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_ul]:my-3 [&_ul]:list-disc [&_ul]:ps-5"

export function WorkspaceMarkdown({
  kind,
  content,
  emptyLabel,
}: {
  kind?: string
  content: string
  emptyLabel?: string
}) {
  const text = content.trim()
  if (!text) {
    return <p className="text-sm text-muted-foreground">{emptyLabel ?? ""}</p>
  }
  if (!kind || !isMarkdownFormat(kind)) {
    return <p className="text-sm whitespace-pre-wrap">{content}</p>
  }

  return (
    <div className={cn(DOCUMENT_CLASS)}>
      <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
    </div>
  )
}
