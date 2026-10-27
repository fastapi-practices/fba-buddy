"use client"

import { SyntaxHighlighter } from "./shiki-highlighter"
import { CodeBlock, CodeBlockContent } from "@/components/ui/code-block"
import { ImageViewer } from "./image-viewer"
import { toolOutputImages } from "@/features/chat/tool-output"

export function ToolValue({
  value,
  language,
}: {
  value: string
  language?: string
}) {
  if (!value) return null
  let code = value,
    format = language,
    command = ""
  if (!format) {
    try {
      const parsed = JSON.parse(value)
      if (
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed) &&
        typeof parsed.command === "string"
      ) {
        command = parsed.command
        delete parsed.command
        if (!Object.keys(parsed).length) code = ""
      }
      code = JSON.stringify(
        parsed,
        (key, entry) =>
          ["data", "image"].includes(key) &&
          typeof entry === "string" &&
          entry.length > 2000
            ? `[${entry.length} characters]`
            : entry,
        2
      )
      if (command && code === "{}") code = ""
      format = "json"
    } catch {
      /* Plain tool output */
    }
  }
  const images = toolOutputImages(value)
  return (
    <div className="flex min-w-0 flex-col gap-2 [&_pre]:max-h-60 [&_pre]:overflow-auto">
      {images.map((image) => (
        <ImageViewer key={image.src} {...image}>
          <img
            data-media-image
            src={image.src}
            alt={image.alt}
            className="max-h-64 max-w-full rounded-lg object-contain"
          />
        </ImageViewer>
      ))}
      {command ? <SyntaxHighlighter code={command} language="bash" /> : null}
      {format && code ? (
        <SyntaxHighlighter code={code} language={format} />
      ) : !format ? (
        <CodeBlock size="sm">
          <CodeBlockContent wrap className="max-h-60">
            {value}
          </CodeBlockContent>
        </CodeBlock>
      ) : null}
    </div>
  )
}
