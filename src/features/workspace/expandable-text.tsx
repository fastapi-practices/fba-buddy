import { useLayoutEffect, useRef, useState } from "react"
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useT } from "@/hooks/use-t"
import { cn } from "@/lib/utils"

export function ExpandableText({
  text,
  emptyLabel,
}: {
  text: string
  emptyLabel: string
}) {
  const t = useT()
  const [expanded, setExpanded] = useState(false)
  const [overflows, setOverflows] = useState(false)
  const ref = useRef<HTMLParagraphElement>(null)
  const value = text.trim()

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || expanded) {
      return
    }
    setOverflows(el.scrollHeight > el.clientHeight + 1)
  }, [expanded, value])

  if (!value) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>
  }

  return (
    <div className="flex flex-col gap-2">
      <p
        ref={ref}
        className={cn(
          "text-sm leading-6 whitespace-pre-wrap text-foreground/80",
          !expanded && "line-clamp-2"
        )}
      >
        {value}
      </p>
      {overflows ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-auto w-fit px-0 text-muted-foreground"
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? t("common.collapse") : t("common.expand")}
          {expanded ? (
            <ChevronUpIcon data-icon="inline-end" />
          ) : (
            <ChevronDownIcon data-icon="inline-end" />
          )}
        </Button>
      ) : null}
    </div>
  )
}
