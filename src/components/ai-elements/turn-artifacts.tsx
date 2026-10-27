"use client"

import { useMemo } from "react"

import { openWorkspace } from "@/app/navigation"
import { artifactCardsFromMessages } from "@/features/chat/artifact-cards"
import { useWorkspaceSearchStore } from "@/features/workspace/workspace-search"
import { useT } from "@/hooks/use-t"
import { cn } from "@/lib/utils"
import { ArtifactCard } from "./artifact-card"

type TurnArtifactsProps = {
  messages: Parameters<typeof artifactCardsFromMessages>[0]
  className?: string
}

/** 本轮生成的产物，作为回答后的可操作文档卡片 */
export function TurnArtifacts({ messages, className }: TurnArtifactsProps) {
  const t = useT()
  const cards = useMemo(() => artifactCardsFromMessages(messages), [messages])
  if (!cards.length) return null

  return (
    <div
      className={cn("flex min-w-0 flex-col gap-2", className)}
      data-slot="turn-artifacts"
    >
      <div className="flex w-full flex-wrap gap-2">
        {cards.map((card) => (
          <ArtifactCard
            key={card.id}
            data-change={card.change}
            aria-label={t("common.openArtifact", { name: card.title })}
            onClick={() => {
              useWorkspaceSearchStore.getState().setQuery(card.title)
              openWorkspace("artifact")
            }}
            title={card.title}
            meta={t("common.artifactMeta", {
              kind: t(`common.${card.kind}`),
              version: card.version,
            })}
            generating={card.generating}
            generation={card.generation}
            words={card.words}
          />
        ))}
      </div>
    </div>
  )
}
