import { defaultUrlTransform, type Options } from "react-markdown"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import rehypeKatex from "rehype-katex"
import rehypeRaw from "rehype-raw"
import rehypeSanitize, { defaultSchema } from "rehype-sanitize"
import {
  remarkTranscript,
  remarkPreserveLineBreaks,
  remarkMarkdownCompatibility,
  rehypeTranscriptMedia,
} from "./markdown-enhancements"
import { parseFileReference } from "@/shared/file-reference"
import { parseInlineQuote } from "./transcript-quote-selector"

export const markdownUrl = (url: string, key: string) => {
  if (
    key === "href" &&
    (parseInlineQuote(url) ||
      /^(?:fba|t3)-thread:\/\/[a-zA-Z\d_-]{1,128}$/.test(url))
  )
    return url
  if (parseFileReference(url)) return url
  if (
    key === "src" &&
    /^(data:image\/(?:png|jpeg|gif|webp|svg\+xml);base64,|blob:)/i.test(url)
  )
    return url
  if (key === "href") {
    try {
      const decoded = decodeURI(url)
      if (
        /^(?:file:\/\/)?((?:\/|\.\.?\/)?[\p{L}\p{N}_@()./-]+\.[a-zA-Z][a-zA-Z0-9]{0,11})(?:(?::|#L)(\d+)(?::\d+|(?:-L?\d+))?)?$/u.test(
          decoded
        )
      )
        return decoded
    } catch {
      return defaultUrlTransform(url)
    }
  }
  return defaultUrlTransform(url)
}

export const remarkPlugins: NonNullable<Options["remarkPlugins"]> = [
  remarkGfm,
  remarkMath,
  remarkMarkdownCompatibility,
  remarkTranscript,
]
export const userRemarkPlugins: NonNullable<Options["remarkPlugins"]> = [
  ...remarkPlugins,
  remarkPreserveLineBreaks,
]
export const rehypePlugins: NonNullable<Options["rehypePlugins"]> = [
  rehypeRaw,
  rehypeTranscriptMedia,
  [
    rehypeSanitize,
    {
      ...defaultSchema,
      clobberPrefix: "",
      protocols: {
        ...defaultSchema.protocols,
        src: ["http", "https", "data", "blob", "file"],
        href: [
          ...(defaultSchema.protocols?.href ?? []),
          "file",
          "fba-citation",
          "fba-thread",
          "t3-thread",
        ],
      },
      tagNames: [...(defaultSchema.tagNames ?? []), "details", "summary"],
      attributes: {
        ...defaultSchema.attributes,
        code: [...(defaultSchema.attributes?.code ?? []), "dataFenceTitle"],
        blockquote: ["dataAlert"],
        details: ["open"],
        img: [...(defaultSchema.attributes?.img ?? []), "dataStandalone"],
        div: [...(defaultSchema.attributes?.div ?? []), "dataArtifactTemplate"],
      },
    },
  ],
  rehypeKatex,
]
