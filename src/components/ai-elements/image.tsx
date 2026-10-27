"use client"

import {
  memo,
  useState,
  useEffect,
  useRef,
  type ComponentType,
  type PropsWithChildren,
} from "react"
import { ImageViewer } from "./image-viewer"
import { cva, type VariantProps } from "class-variance-authority"
import {
  CopyIcon,
  DownloadIcon,
  ImageIcon,
  ImageOffIcon,
  RefreshCwIcon,
  ShieldAlertIcon,
} from "lucide-react"
import type { ImageMessagePart } from "@/features/chat/thread-types"
import {
  base64ByteSize,
  formatAttachmentSize,
  formatMimeLabel,
} from "@/features/chat/attachments"
import { cn } from "@/lib/utils"
import { useT } from "@/hooks/use-t"
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment"
import { Spinner } from "@/components/ui/spinner"

const extensionForMimeType = (mimeType?: string): string => {
  switch (mimeType) {
    case "image/png":
      return "png"
    case "image/jpeg":
    case "image/jpg":
      return "jpg"
    case "image/webp":
      return "webp"
    case "image/gif":
      return "gif"
    case "image/svg+xml":
      return "svg"
    default:
      return "png"
  }
}

const dataUriToBlob = (dataUri: string): Blob => {
  const commaIndex = dataUri.indexOf(",")
  const meta = commaIndex >= 0 ? dataUri.slice(0, commaIndex) : dataUri
  const data = commaIndex >= 0 ? dataUri.slice(commaIndex + 1) : ""
  const mime =
    meta.match(/data:([^;]+)/i)?.[1]?.toLowerCase() ??
    "application/octet-stream"
  if (!/;base64/i.test(meta)) {
    const text = data.replace(/(?:%[0-9A-Fa-f]{2})+/g, (seq) => {
      try {
        return decodeURIComponent(seq)
      } catch {
        return seq
      }
    })
    return new Blob([text], { type: mime })
  }
  const bytes = atob(data)
  const arr = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
  return new Blob([arr], { type: mime })
}

const mimeFromImage = (image: string): string | undefined =>
  image.match(/^data:([^;,]+)/i)?.[1]?.toLowerCase()

const mimeFromExtension = (value?: string): string | undefined => {
  const extension = /\.([a-z0-9]+)(?:[?#]|$)/i.exec(value ?? "")?.[1]
  switch (extension?.toLowerCase()) {
    case "png":
      return "image/png"
    case "jpg":
    case "jpeg":
      return "image/jpeg"
    case "webp":
      return "image/webp"
    case "gif":
      return "image/gif"
    case "svg":
      return "image/svg+xml"
    case "avif":
      return "image/avif"
    case "bmp":
      return "image/bmp"
    case "heic":
    case "heif":
      return "image/heic"
    default:
      return undefined
  }
}

const imageMeta = (
  image: string,
  part: Pick<ImageMessagePart, "filename" | "mimeType" | "size">,
  fallback: string
): string => {
  const mime =
    part.mimeType ??
    mimeFromImage(image) ??
    mimeFromExtension(part.filename) ??
    mimeFromExtension(image)
  const size =
    part.size && part.size > 0
      ? part.size
      : /^data:/i.test(image)
        ? base64ByteSize(image)
        : undefined
  return [
    mime ? formatMimeLabel(mime) : fallback,
    size === undefined ? undefined : formatAttachmentSize(size),
  ]
    .filter(Boolean)
    .join(" · ")
}

const downloadImagePart = (
  part: Pick<ImageMessagePart, "image" | "filename">
): void => {
  if (typeof document === "undefined") return
  const ext = extensionForMimeType(mimeFromImage(part.image))
  const filename = part.filename ?? `image.${ext}`
  const isDataUri = /^data:/i.test(part.image)
  const objectUrl = isDataUri
    ? URL.createObjectURL(dataUriToBlob(part.image))
    : null
  const href = objectUrl ?? part.image
  const a = document.createElement("a")
  a.href = href
  a.download = filename
  a.rel = "noopener"
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl), 40_000)
}

const copyImagePart = async (
  part: Pick<ImageMessagePart, "image">
): Promise<void> => {
  if (
    typeof navigator === "undefined" ||
    !navigator.clipboard ||
    typeof ClipboardItem === "undefined"
  ) {
    throw new Error("Clipboard API is not available in this environment.")
  }
  const blob = /^data:/i.test(part.image)
    ? dataUriToBlob(part.image)
    : await fetch(part.image).then((r) => r.blob())
  const mime = mimeFromImage(part.image) ?? blob.type ?? "image/png"
  await navigator.clipboard.write([new ClipboardItem({ [mime]: blob })])
}

const imageVariants = cva(
  "image-root relative overflow-hidden rounded-lg",
  {
    variants: {
      variant: {
        outline: "border border-border",
        ghost: "",
        muted: "bg-muted/50",
      },
      size: {
        sm: "max-w-64",
        default: "max-w-96",
        lg: "max-w-[512px]",
        full: "w-full",
      },
    },
    defaultVariants: {
      variant: "outline",
      size: "default",
    },
  }
)

type ImageRootProps = React.ComponentProps<"div"> &
  VariantProps<typeof imageVariants>

function ImageRoot({
  className,
  variant,
  size,
  children,
  ...props
}: ImageRootProps) {
  return (
    <div
      data-slot="image-root"
      data-variant={variant}
      data-size={size}
      className={cn(imageVariants({ variant, size, className }))}
      {...props}
    >
      {children}
    </div>
  )
}

type ImagePreviewProps = Omit<React.ComponentProps<"img">, "children"> & {
  containerClassName?: string
}

function ImagePreview(props: ImagePreviewProps) {
  return <ImagePreviewContent key={props.src ?? ""} {...props} />
}

function ImagePreviewContent({
  className,
  containerClassName,
  onLoad,
  onError,
  alt,
  src,
  ...props
}: ImagePreviewProps) {
  const t = useT()
  const imgRef = useRef<HTMLImageElement>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(!src)

  useEffect(() => {
    if (
      typeof src === "string" &&
      imgRef.current?.complete &&
      imgRef.current.naturalWidth > 0
    ) {
      setLoaded(true)
    }
  }, [src])

  return (
    <div
      data-slot="image-preview"
      className={cn("relative min-h-32", containerClassName)}
    >
      {!loaded && !error && (
        <div
          data-slot="image-preview-loading"
          role="status"
          aria-label={t("common.loading")}
          className="absolute inset-0 flex items-center justify-center bg-muted/50"
        >
          <ImageIcon className="size-8 animate-pulse text-muted-foreground" />
        </div>
      )}
      {error ? (
        <div
          data-slot="image-preview-error"
          role="img"
          aria-label={t("common.couldNotLoadPreview")}
          title={t("common.couldNotLoadPreview")}
          className="absolute inset-0 flex items-center justify-center bg-muted/50 p-2"
        >
          <ImageOffIcon className="size-8 text-muted-foreground" />
        </div>
      ) : (
        <img
          data-media-image
          ref={imgRef}
          src={src}
          alt={alt ?? t("common.previewImage")}
          className={cn(
            "block h-auto w-full object-contain",
            !loaded && "invisible",
            className
          )}
          onLoad={(e) => {
            setLoaded(true)
            onLoad?.(e)
          }}
          onError={(e) => {
            setError(true)
            onError?.(e)
          }}
          {...props}
        />
      )}
    </div>
  )
}

type ImageZoomProps = PropsWithChildren<{
  src: string
  alt?: string
  className?: string
}>

function ImageZoom({
  src,
  alt = "Image preview",
  className,
  children,
}: ImageZoomProps) {
  return (
    <ImageViewer src={src} alt={alt} className={className}>
      {children}
    </ImageViewer>
  )
}

type ImageProps = ImageMessagePart & {
  onRegenerate?: () => void | Promise<void>
  className?: string
}

const ImageImpl = ({
  image,
  filename,
  mimeType,
  size,
  status,
  onRegenerate,
  className,
}: ImageProps) => {
  const t = useT()
  const [regenerating, setRegenerating] = useState(false)
  const running = status?.type === "running"
  const failed = !running && (status?.type === "incomplete" || !image)
  const title = filename || t("common.image")
  const description = running
    ? t("common.generating")
    : failed
      ? t("common.generationFailed")
      : imageMeta(image, { filename, mimeType, size }, "IMG")

  return (
    <Attachment
      data-slot="image-attachment"
      orientation="vertical"
      state={running ? "uploading" : failed ? "error" : "done"}
      className={cn(
        "max-w-full has-data-[slot=attachment-content]:w-64",
        className
      )}
    >
      {running || failed ? (
        <AttachmentMedia>
          {running ? <Spinner /> : <ShieldAlertIcon />}
        </AttachmentMedia>
      ) : (
        <AttachmentMedia variant="image">
          <ImageZoom src={image} alt={title} className="size-full">
            <ImagePreview
              src={image}
              alt={title}
              loading="lazy"
              containerClassName="size-full min-h-0"
              className="size-full object-cover"
            />
          </ImageZoom>
        </AttachmentMedia>
      )}
      <AttachmentContent>
        <AttachmentTitle title={title}>{title}</AttachmentTitle>
        <AttachmentDescription>{description}</AttachmentDescription>
      </AttachmentContent>
      {!running && !failed ? (
        <AttachmentActions>
          <AttachmentAction
            type="button"
            aria-label={t("common.download")}
            onClick={() => downloadImagePart({ image, filename })}
          >
            <DownloadIcon />
          </AttachmentAction>
          <AttachmentAction
            type="button"
            aria-label={t("common.copy")}
            onClick={() => {
              void copyImagePart({ image }).catch(() => {})
            }}
          >
            <CopyIcon />
          </AttachmentAction>
          {onRegenerate ? (
            <AttachmentAction
              type="button"
              aria-label={t("common.regenerate")}
              disabled={regenerating}
              onClick={async () => {
                setRegenerating(true)
                try {
                  await onRegenerate()
                } catch {
                  return
                } finally {
                  setRegenerating(false)
                }
              }}
            >
              <RefreshCwIcon
                className={cn(regenerating && "animate-spin")}
              />
            </AttachmentAction>
          ) : null}
        </AttachmentActions>
      ) : null}
    </Attachment>
  )
}

const Image = memo(ImageImpl) as unknown as ComponentType<ImageProps> & {
  Root: typeof ImageRoot
  Preview: typeof ImagePreview
  Zoom: typeof ImageZoom
}

Image.displayName = "Image"
Image.Root = ImageRoot
Image.Preview = ImagePreview
Image.Zoom = ImageZoom

export { Image,     }
