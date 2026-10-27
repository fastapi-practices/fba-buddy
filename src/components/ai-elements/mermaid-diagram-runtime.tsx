"use client"

import { memo, type FC } from "react"
import { useChatMessagePart } from "@/features/chat/chat-runtime"
import {
  MermaidDiagram as MermaidDiagramBase,
  MermaidZoom,
} from "./mermaid-diagram"

type MermaidDiagramProps = {
  code: string
  language?: string
  className?: string
  node?: unknown
  components?: unknown
}

const MermaidDiagramImpl: FC<MermaidDiagramProps> = ({
  code,
  className,
  node: _node,
  components: _components,
  language: _language,
}) => {
  void _node
  void _components
  void _language
  const part = useChatMessagePart()
  const isStreaming = part?.type === "text" && part.status?.type === "running"
  return (
    <MermaidDiagramBase
      code={code}
      {...(className !== undefined ? { className } : {})}
      streaming={isStreaming}
    />
  )
}

const MermaidDiagram = memo(
  MermaidDiagramImpl
) as unknown as FC<MermaidDiagramProps> & {
  Zoom: typeof MermaidZoom
}

MermaidDiagram.displayName = "MermaidDiagram"
MermaidDiagram.Zoom = MermaidZoom

export { MermaidDiagram,  }
