"use client"

import { CircleXIcon, FileCodeIcon, LayersIcon } from "lucide-react"
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace"
import { useT } from "@/hooks/use-t"

function parseFrame(line: string) {
  const match = line.match(/^at (.+) \((.+):(\d+):(\d+)\)$/)
  return {
    line,
    name: match?.[1],
    file: match?.[2],
    lineNumber: match?.[3],
    internal: line.includes("node_modules") || line.includes("node:"),
  }
}

export function StackTrace({
  stack,
  open,
  onOpenChange,
}: {
  stack: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useT()
  const [error, ...lines] = stack.split("\n").map((line) => line.trim())
  const frames = lines.map(parseFrame)
  const appFrames = frames.filter((frame) => !frame.internal)
  const internalFrames = frames.filter((frame) => frame.internal)

  return (
    <Trace data-slot="stack-trace">
      <TraceCollapsible open={open} onOpenChange={onOpenChange}>
        <TraceCollapsibleTrigger data-slot="tool-fallback-trigger">
          <TraceLine status="error">
            <TraceIcon>
              <CircleXIcon />
            </TraceIcon>
            <TraceTitle>
              {t("common.toolCallFailed")}: {error}
            </TraceTitle>
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent keepMounted className="flex flex-col gap-2">
          <p className="font-mono text-xs text-destructive">{error}</p>
          {frames.length > 0 ? (
            <Trace>
              {appFrames.map((frame) => (
                <a key={frame.line} href={`#${frame.file}:${frame.lineNumber}`}>
                  <TraceLine>
                    <TraceIcon>
                      <FileCodeIcon />
                    </TraceIcon>
                    <TraceTitle>
                      {frame.name} in {frame.file}:{frame.lineNumber}
                    </TraceTitle>
                  </TraceLine>
                </a>
              ))}
              {internalFrames.length > 0 ? (
                <TraceCollapsible>
                  <TraceCollapsibleTrigger>
                    <TraceLine>
                      <TraceIcon>
                        <LayersIcon />
                      </TraceIcon>
                      <TraceTitle>
                        {t("common.frameworkFrames", {
                          n: internalFrames.length,
                        })}
                      </TraceTitle>
                    </TraceLine>
                  </TraceCollapsibleTrigger>
                  <TraceCollapsibleContent>
                    <ol className="flex flex-col gap-1 overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs">
                      {internalFrames.map((frame) => (
                        <li key={frame.line} className="whitespace-nowrap">
                          {frame.line}
                        </li>
                      ))}
                    </ol>
                  </TraceCollapsibleContent>
                </TraceCollapsible>
              ) : null}
            </Trace>
          ) : null}
        </TraceCollapsibleContent>
      </TraceCollapsible>
    </Trace>
  )
}
