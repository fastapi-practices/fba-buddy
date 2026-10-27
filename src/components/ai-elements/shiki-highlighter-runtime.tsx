"use client"

import type { FC } from "react"
import type { ShikiHighlighterProps } from "react-shiki"
import { useChatMessagePart } from "@/features/chat/chat-runtime"
import { SyntaxHighlighter as SyntaxHighlighterBase } from "./shiki-highlighter"

export type HighlighterProps = Omit<
  ShikiHighlighterProps,
  "children" | "theme"
> & {
  theme?: ShikiHighlighterProps["theme"]
  language?: string
  code: string
  node?: unknown
  components?: unknown
}

export const SyntaxHighlighter: FC<HighlighterProps> = ({
  node: _node,
  components: _components,
  ...props
}) => {
  void _node
  void _components
  const part = useChatMessagePart()
  const isStreaming = part?.type === "text" && part.status?.type === "running"
  return <SyntaxHighlighterBase {...props} streaming={isStreaming} hasHeader />
}

SyntaxHighlighter.displayName = "SyntaxHighlighter"
