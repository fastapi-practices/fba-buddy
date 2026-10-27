"use client"

import { useState } from "react"
import { ArrowUpRightIcon, GlobeIcon } from "lucide-react"
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace"
import { safeHref } from "@/components/ai-elements/href"
import { useTranscriptFind } from "@/components/ai-elements/transcript"
import { useT } from "@/hooks/use-t"
import { researchSources, type ResearchSource } from "./research-sources"

export function SourcesView({
  sources,
  open,
  onOpenChange,
}: {
  sources: readonly ResearchSource[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useT()
  if (!sources.length) return null
  return (
    <TraceCollapsible
      data-slot="sources"
      open={open}
      onOpenChange={onOpenChange}
    >
      <TraceCollapsibleTrigger>
        <TraceLine>
          <TraceIcon>
            <GlobeIcon />
          </TraceIcon>
          <TraceTitle>
            {t("common.usedNSources", { n: sources.length })}
          </TraceTitle>
        </TraceLine>
      </TraceCollapsibleTrigger>
      <TraceCollapsibleContent>
        <Trace>
          {sources.map((source) => {
            const href = safeHref(source.url)
            const line = (
              <TraceLine>
                <TraceTitle>
                  {source.title}
                  <span className="sr-only"> (opens in a new tab)</span>
                </TraceTitle>
                <TraceIcon>
                  <ArrowUpRightIcon />
                </TraceIcon>
              </TraceLine>
            )
            return href ? (
              <a key={source.url} href={href} target="_blank" rel="noreferrer">
                {line}
              </a>
            ) : (
              <div key={source.url}>{line}</div>
            )
          })}
        </Trace>
      </TraceCollapsibleContent>
    </TraceCollapsible>
  )
}

export function MessageSources({ raw }: { raw: unknown }) {
  const [open, setOpen] = useState(false)
  const finding = Boolean(useTranscriptFind())
  const sources = researchSources(raw)
  if (!sources.length) return null
  return (
    <Trace className="my-3" data-slot="research-sources">
      <SourcesView
        sources={sources}
        open={open || finding}
        onOpenChange={setOpen}
      />
    </Trace>
  )
}
