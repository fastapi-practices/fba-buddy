import { useEffect, useRef, useState } from "react"
import { DownloadIcon, EyeIcon } from "lucide-react"

import { downloadArtifact } from "@/api/workspace"
import { apiErrorMessage } from "@/api/http"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { FilePreview } from "@/components/ai-elements/file-preview"
import { useT } from "@/hooks/use-t"
import { dataSourceSignal } from "@/lib/account-source"
import { artifactFileFormat } from "./artifact-format"
import type { WorkspaceArtifactListItem } from "@/lib/types"
import {
  artifactPreviewMetadata,
  loadArtifactPreview,
} from "./artifact-preview"

export function ArtifactDownload({
  artifact,
}: {
  artifact: WorkspaceArtifactListItem
}) {
  const t = useT()
  const [busy, setBusy] = useState<"download" | "preview" | null>(null)
  const [error, setError] = useState("")
  const [preview, setPreview] = useState<{
    url: string
    name: string
    mimeType: string
  } | null>(null)
  const previewUrl = useRef<string | null>(null)
  const pending = useRef<AbortController | null>(null)
  const closePreview = () => {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
    previewUrl.current = null
    setPreview(null)
  }
  useEffect(() => {
    const signal = dataSourceSignal()
    const clear = () => {
      pending.current?.abort()
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
      previewUrl.current = null
      setPreview(null)
    }
    signal.addEventListener("abort", clear, { once: true })
    return () => {
      signal.removeEventListener("abort", clear)
      pending.current?.abort()
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
      previewUrl.current = null
    }
  }, [artifact.id])

  const local =
    artifact.storage_backend === "local" ||
    artifact.storage_backend === "sandbox"
  const available =
    (!artifact.state ||
      artifact.state === "ready" ||
      artifact.state === "archived") &&
    !local

  const receiveFile = async (action: "download" | "preview") => {
    if (busy || !available) return
    const controller = new AbortController()
    pending.current = controller
    const signal = dataSourceSignal(controller.signal)
    setBusy(action)
    setError("")
    try {
      if (action === "preview") {
        const result = await loadArtifactPreview(artifact, signal)
        signal.throwIfAborted()
        closePreview()
        const url = URL.createObjectURL(result.blob)
        previewUrl.current = url
        setPreview({ url, name: result.name, mimeType: result.mimeType })
        return
      }
      const blob = await downloadArtifact(artifact.id, signal)
      signal.throwIfAborted()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = artifactFileFormat(artifact).name
      document.body.appendChild(anchor)
      try {
        anchor.click()
      } finally {
        anchor.remove()
        setTimeout(() => URL.revokeObjectURL(url), 40_000)
      }
    } catch (cause) {
      if (!signal.aborted)
        setError(
          apiErrorMessage(
            cause,
            t(
              action === "preview"
                ? "common.couldNotLoadPreview"
                : "common.downloadFailed"
            )
          )
        )
    } finally {
      if (pending.current === controller) {
        pending.current = null
        setBusy(null)
      }
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {artifact.relative_path ? (
        <p className="text-sm break-all text-muted-foreground">
          {artifact.relative_path}
        </p>
      ) : null}
      {local ? (
        <Alert>
          <AlertDescription>{t("common.artifactLocalFile")}</AlertDescription>
        </Alert>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {artifactPreviewMetadata(artifact) ? (
            <Button
              variant="outline"
              disabled={busy !== null || !available}
              onClick={() => void receiveFile("preview")}
            >
              {busy === "preview" ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <EyeIcon data-icon="inline-start" />
              )}
              {t("common.showPreview")}
            </Button>
          ) : null}
          <Button
            variant="outline"
            className="w-fit"
            disabled={busy !== null || !available}
            onClick={() => void receiveFile("download")}
          >
            {busy === "download" ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <DownloadIcon data-icon="inline-start" />
            )}
            {t("common.download")}
          </Button>
          {busy ? (
            <Button variant="ghost" onClick={() => pending.current?.abort()}>
              {t("common.cancel")}
            </Button>
          ) : null}
        </div>
      )}
      {available && !artifactPreviewMetadata(artifact) ? (
        <p className="text-sm text-muted-foreground">
          {t("common.artifactPreviewUnsupported")}
        </p>
      ) : null}
      {!available && !local ? (
        <p className="text-sm text-muted-foreground">
          {t("common.fileUnavailable")}
        </p>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {preview ? (
        <FilePreview
          name={preview.name}
          mimeType={preview.mimeType}
          src={preview.url}
          open
          onOpenChange={(open) => {
            if (!open) closePreview()
          }}
        />
      ) : null}
    </div>
  )
}
