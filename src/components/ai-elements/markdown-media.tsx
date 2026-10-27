"use client"

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  type ComponentProps,
  type ReactNode,
} from "react"
import { ImageOffIcon } from "lucide-react"
import { ImageViewer } from "./image-viewer"
import { MediaPreview } from "./media-preview"
import { WorkspaceActionsContext } from "@/features/chat/workspace-actions"
import {
  assetSource,
  loadWorkspaceAsset,
  workspaceImagePath,
} from "@/features/chat/workspace-preview"
import { mediaKind } from "@/shared/file-reference"
import { Button } from "@/components/ui/button"
import { useT } from "@/hooks/use-t"
import { cn } from "@/lib/utils"
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard"
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
} from "@/components/ui/context-menu"

export const MarkdownBaseDirContext = createContext<string | undefined>(
  undefined
)

export function MarkdownMedia({
  src = "",
  alt = "",
  standalone = false,
  ...props
}: Omit<ComponentProps<"img">, "src"> & {
  src?: string
  standalone?: boolean
}) {
  const { conversationId, backend } = useContext(WorkspaceActionsContext)
  const baseDir = useContext(MarkdownBaseDirContext)
  const localPath = workspaceImagePath(src, baseDir)
  const resourceKey = `${conversationId ?? ""}:${localPath ?? src}`
  const t = useT()
  const [state, setState] = useState<{
    source: string
    url?: string
    failed?: string
  }>({ source: resourceKey })
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!localPath || backend !== "local") return
    let active = true
    if (!conversationId) return
    void loadWorkspaceAsset(conversationId, localPath)
      .then((asset) => {
        if (active) setState({ source: resourceKey, url: assetSource(asset) })
      })
      .catch((error: unknown) => {
        if (active)
          setState({
            source: resourceKey,
            failed:
              error instanceof Error
                ? error.message
                : t("common.couldNotLoadPreview"),
          })
      })
    return () => {
      active = false
    }
  }, [resourceKey, localPath, conversationId, backend, revision, t])
  const current = state.source === resourceKey ? state : null
  const url = localPath
    ? current?.url
    : /^(?:https?:|data:image\/|blob:|\/\/)/i.test(src)
      ? src
      : undefined
  const failed =
    current?.failed ||
    (!!localPath && backend !== "local") ||
    (!url && !localPath)
  if (failed)
    return (
      <span
        role="alert"
        className="inline-flex max-w-full items-center gap-2 rounded border p-2 text-sm text-muted-foreground"
      >
        <ImageOffIcon className="size-4" />
        {current?.failed ||
          (localPath && backend !== "local"
            ? t(
                backend === "sandbox"
                  ? "common.sandboxFilePreviewUnavailable"
                  : "common.localWorkspaceRequired"
              )
            : alt || t("common.couldNotLoadPreview"))}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setState({ source: resourceKey })
            setRevision((value) => value + 1)
          }}
        >
          {t("common.retry")}
        </Button>
      </span>
    )
  if (!url)
    return (
      <span
        data-slot="skeleton"
        role="status"
        aria-label={t("common.loading")}
        className={cn(
          "animate-pulse rounded-md bg-muted",
          standalone
            ? "my-3 inline-block h-40 w-64 max-w-full"
            : "inline-block size-5"
        )}
      />
    )
  const kind = mediaKind(src)
  if (kind === "audio" || kind === "video")
    return (
      <MediaActions source={src} alt={alt}>
        <MediaPreview
          inline
          key={url}
          src={url}
          video={kind === "video"}
          className="my-3 max-h-96 max-w-full rounded-lg"
        />
      </MediaActions>
    )
  return (
    <MediaActions source={src} alt={alt} preview>
      <MarkdownImage
        key={`${url}:${revision}`}
        src={url}
        alt={alt}
        standalone={standalone}
        {...props}
      />
    </MediaActions>
  )
}

function MediaActions({
  source,
  alt,
  preview,
  children,
}: {
  source: string
  alt: string
  preview?: boolean
  children: ReactNode
}) {
  const t = useT()
  const root = useRef<HTMLSpanElement>(null)
  const { copyToClipboard } = useCopyToClipboard()
  const markdown = `![${alt.replace(/[\\[\]]/g, "\\$&")}](${source.replace(/ /g, "%20").replace(/\(/g, "%28").replace(/\)/g, "%29")})`
  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <span ref={root} className="inline-block max-w-full align-middle" />
        }
      >
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuGroup>
          {preview ? (
            <ContextMenuItem
              onClick={() =>
                root.current
                  ?.querySelector<HTMLElement>(
                    '[data-slot="image-viewer-trigger"]'
                  )
                  ?.click()
              }
            >
              {t("common.showPreview")}
            </ContextMenuItem>
          ) : null}
          <ContextMenuItem onClick={() => copyToClipboard(source)}>
            {t("common.copyLink")}
          </ContextMenuItem>
          <ContextMenuItem onClick={() => copyToClipboard(markdown)}>
            {t("common.copyMarkdown")}
          </ContextMenuItem>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  )
}

function MarkdownImage({
  src,
  alt,
  standalone,
  className,
  ...props
}: ComponentProps<"img"> & { src: string; standalone: boolean }) {
  const t = useT()
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  return (
    <ImageViewer src={src} alt={alt ?? ""} inline={!standalone}>
      <span
        className={cn(
          "relative inline-block max-w-full align-middle",
          standalone && !loaded && "my-3 h-40 w-64",
          failed && "rounded border p-2"
        )}
      >
        {!loaded && !failed ? (
          <span
            data-slot="skeleton"
            role="status"
            aria-label={t("common.loading")}
            className={cn(
              "animate-pulse rounded-md bg-muted",
              standalone ? "absolute inset-0" : "inline-block size-5"
            )}
          />
        ) : null}
        {failed ? (
          <span
            role="img"
            aria-label={t("common.couldNotLoadPreview")}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground"
          >
            <ImageOffIcon className="size-4" />
            {alt}
          </span>
        ) : (
          <img
            {...props}
            ref={(image) => {
              if (image?.complete && image.naturalWidth) setLoaded(true)
            }}
            data-media-image
            src={src}
            alt={alt}
            loading="lazy"
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
            className={cn(
              "max-h-96 max-w-full rounded-lg object-contain",
              standalone && "my-3",
              !loaded && "invisible absolute",
              className
            )}
          />
        )}
      </span>
    </ImageViewer>
  )
}
