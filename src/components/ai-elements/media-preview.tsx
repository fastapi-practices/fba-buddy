"use client"

import { useState } from "react"
import { RefreshCwIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useT } from "@/hooks/use-t"

export function MediaPreview({
  src,
  video,
  className,
  inline = false,
}: {
  src: string
  video?: boolean
  className?: string
  inline?: boolean
}) {
  const t = useT()
  const [failed, setFailed] = useState(false)
  const [revision, setRevision] = useState(0)
  const Tag = video ? "video" : "audio"
  const Container = inline ? "span" : "div"
  return (
    <Container className="inline-flex max-w-full min-w-0 flex-col gap-2">
      <Tag
        key={`${src}:${revision}`}
        src={src}
        controls
        preload="metadata"
        className={className}
        onError={() => setFailed(true)}
        onLoadedMetadata={() => setFailed(false)}
      />
      {failed ? (
        <span className="flex flex-wrap items-center gap-2">
          <span role="alert" className="text-sm text-destructive">
            {t("common.couldNotLoadPreview")}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setFailed(false)
              setRevision(revision + 1)
            }}
          >
            <RefreshCwIcon data-icon="inline-start" />
            {t("common.retry")}
          </Button>
        </span>
      ) : null}
    </Container>
  )
}
