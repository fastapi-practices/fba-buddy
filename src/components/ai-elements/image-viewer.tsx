"use client"

import { useEffect, useRef, useState, type PropsWithChildren } from "react"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  MinusIcon,
  PlusIcon,
  RotateCcwIcon,
  RotateCwIcon,
  Loader2Icon,
  RefreshCwIcon,
  CopyIcon,
  CheckIcon,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { TooltipIconButton } from "./tooltip-icon-button"
import { useT } from "@/hooks/use-t"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useTranscriptScope } from "./transcript-scope"
import {
  copyImageSource,
  downloadMediaSource,
} from "@/features/chat/media-transfer"

type GalleryImage = { src: string; alt: string }
const galleryScope =
  "[data-image-gallery], [data-message-id], [data-work-message-id], .composer-root"

export function ImageViewer({
  src,
  alt = "",
  inline = false,
  className,
  children,
}: PropsWithChildren<
  GalleryImage & { inline?: boolean; className?: string }
>) {
  const t = useT()
  const scope = useTranscriptScope()
  const trigger = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)
  const [images, setImages] = useState<GalleryImage[]>([])
  const [index, setIndex] = useState(0)
  const { beginNavigation, finishNavigation } = scope
  useEffect(() => {
    if (!open) return
    beginNavigation()
    return finishNavigation
  }, [open, beginNavigation, finishNavigation])
  const selected = images[index] ?? { src, alt }
  const change = (delta: number) =>
    setIndex((current) =>
      images.length ? (current + delta + images.length) % images.length : 0
    )
  const toggle = (next: boolean) => {
    setOpen(next)
  }
  const show = (target: HTMLElement) => {
    const group = target.closest(galleryScope) ?? target.parentElement
    const triggers = Array.from(
      group?.querySelectorAll<HTMLElement>(
        '[data-slot="image-viewer-trigger"][data-image-src]'
      ) ?? []
    ).filter(
      (item) => (item.closest(galleryScope) ?? item.parentElement) === group
    )
    const items = triggers.map((item) => ({
      src: item.dataset.imageSrc!,
      alt: item.dataset.imageAlt ?? "",
    }))
    let selectedIndex = triggers.indexOf(target)
    if (selectedIndex < 0) {
      selectedIndex = items.length
      items.push({ src, alt })
    }
    setImages(items)
    setIndex(selectedIndex)
    toggle(true)
  }
  if (!src) return children
  return (
    <>
      <span
        ref={trigger}
        data-slot="image-viewer-trigger"
        data-image-src={src}
        data-image-alt={alt}
        role="button"
        tabIndex={0}
        aria-label={t("common.previewImage")}
        className={cn(
          inline ? "inline-block align-middle" : "block",
          "cursor-zoom-in rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className
        )}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          show(event.currentTarget)
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault()
            event.stopPropagation()
            show(event.currentTarget)
          }
        }}
      >
        {children}
      </span>
      <Dialog open={open} onOpenChange={toggle}>
        <DialogContent
          finalFocus={() => {
            if (trigger.current?.isConnected)
              trigger.current.focus({ preventScroll: true })
            return false
          }}
          className="flex h-[90dvh] max-w-[calc(100vw-2rem)] flex-col sm:max-w-[calc(100vw-4rem)]"
          onKeyDown={(event) => {
            if (images.length < 2) return
            if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
              event.preventDefault()
              event.stopPropagation()
              change(event.key === "ArrowRight" ? 1 : -1)
            }
          }}
        >
          <DialogHeader className="shrink-0 pr-8">
            <DialogTitle className="truncate">
              {selected.alt || t("common.previewImage")}{" "}
              {images.length > 1 ? `(${index + 1}/${images.length})` : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 items-center gap-2">
            {images.length > 1 ? (
              <TooltipIconButton
                tooltip={t("common.previousImage")}
                onClick={() => change(-1)}
              >
                <ChevronLeftIcon />
              </TooltipIconButton>
            ) : null}
            <ZoomableImage key={`${index}:${selected.src}`} image={selected} />
            {images.length > 1 ? (
              <TooltipIconButton
                tooltip={t("common.nextImage")}
                onClick={() => change(1)}
              >
                <ChevronRightIcon />
              </TooltipIconButton>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function ZoomableImage({ image }: { image: GalleryImage }) {
  const t = useT()
  const [scale, setScale] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 })
  const [loaded, setLoaded] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [error, setError] = useState(false)
  const [revision, setRevision] = useState(0)
  const [actionError, setActionError] = useState("")
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const viewport = useRef<HTMLDivElement>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ distance: number; scale: number } | null>(null)
  const drag = useRef<{
    x: number
    y: number
    originX: number
    originY: number
  } | null>(null)
  const zoom = (delta: number) =>
    setScale((current) => Math.max(1, Math.min(8, current + delta)))
  const reset = () => {
    setScale(1)
    setRotation(0)
    setPosition({ x: 0, y: 0 })
  }
  const rotate = () => {
    setRotation((current) => (current + 90) % 360)
    setPosition({ x: 0, y: 0 })
  }
  const rotated = rotation % 180 !== 0
  const fit =
    naturalSize.width && dimensions.width
      ? Math.min(
          1,
          dimensions.width / (rotated ? naturalSize.height : naturalSize.width),
          dimensions.height / (rotated ? naturalSize.width : naturalSize.height)
        )
      : 0
  useEffect(() => {
    const element = viewport.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry)
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const element = viewport.current
    if (!element) return
    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      event.stopPropagation()
      if (!loaded || error) return
      setScale((current) =>
        Math.max(
          1,
          Math.min(
            8,
            event.ctrlKey
              ? current * Math.exp(-event.deltaY * 0.01)
              : current + (event.deltaY < 0 ? 0.25 : -0.25)
          )
        )
      )
    }
    element.addEventListener("wheel", wheel, { passive: false })
    return () => element.removeEventListener("wheel", wheel)
  }, [loaded, error])
  return (
    <div
      className="flex h-full min-w-0 flex-1 flex-col gap-2"
      onKeyDown={(event) => {
        if (!loaded || error || event.altKey || event.ctrlKey || event.metaKey)
          return
        if (event.key === "+" || event.key === "=") zoom(0.25)
        else if (event.key === "-") zoom(-0.25)
        else if (event.key === "0") reset()
        else if (event.key.toLowerCase() === "r") rotate()
        else return
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      <div
        ref={viewport}
        data-slot="image-viewer-canvas"
        className="relative flex min-h-0 flex-1 touch-none items-center justify-center overflow-hidden rounded-lg bg-muted"
        onPointerDown={(event) => {
          if (!loaded || error || event.button !== 0) return
          if (event.target instanceof Element && event.target.closest("button"))
            return
          pointers.current.set(event.pointerId, {
            x: event.clientX,
            y: event.clientY,
          })
          event.currentTarget.setPointerCapture(event.pointerId)
          const points = Array.from(pointers.current.values())
          if (points.length === 2) {
            pinch.current = {
              distance: Math.hypot(
                points[1]!.x - points[0]!.x,
                points[1]!.y - points[0]!.y
              ),
              scale,
            }
            drag.current = null
            return
          }
          if (scale <= 1) return
          drag.current = {
            x: event.clientX,
            y: event.clientY,
            originX: position.x,
            originY: position.y,
          }
        }}
        onPointerMove={(event) => {
          if (!pointers.current.has(event.pointerId)) return
          pointers.current.set(event.pointerId, {
            x: event.clientX,
            y: event.clientY,
          })
          const points = Array.from(pointers.current.values())
          if (points.length >= 2 && pinch.current) {
            const distance = Math.hypot(
              points[1]!.x - points[0]!.x,
              points[1]!.y - points[0]!.y
            )
            setScale(
              Math.max(
                1,
                Math.min(
                  8,
                  (pinch.current.scale * distance) /
                    Math.max(1, pinch.current.distance)
                )
              )
            )
            return
          }
          const point = drag.current
          if (point)
            setPosition({
              x: point.originX + event.clientX - point.x,
              y: point.originY + event.clientY - point.y,
            })
        }}
        onPointerUp={(event) => {
          pointers.current.delete(event.pointerId)
          pinch.current = null
          drag.current = null
        }}
        onPointerCancel={(event) => {
          pointers.current.delete(event.pointerId)
          pinch.current = null
          drag.current = null
        }}
        onLostPointerCapture={(event) => {
          pointers.current.delete(event.pointerId)
          pinch.current = null
          drag.current = null
        }}
      >
        {!loaded && !error ? (
          <div
            role="status"
            className="absolute inset-0 flex items-center justify-center"
          >
            <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
            <span className="sr-only">{t("common.loading")}</span>
          </div>
        ) : null}
        {error ? (
          <div className="flex flex-col items-center gap-3">
            <p role="alert" className="text-sm text-muted-foreground">
              {t("common.couldNotLoadPreview")}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setError(false)
                setLoaded(false)
                setActionError("")
                setRevision(revision + 1)
              }}
            >
              <RefreshCwIcon data-icon="inline-start" />
              {t("common.retry")}
            </Button>
          </div>
        ) : (
          <img
            key={revision}
            src={image.src}
            alt={image.alt}
            draggable={false}
            onLoad={(event) => {
              setNaturalSize({
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              })
              setLoaded(true)
            }}
            onError={() => {
              setError(true)
              setLoaded(false)
            }}
            className="max-h-full max-w-full touch-none object-contain select-none"
            style={{
              width: fit ? naturalSize.width * fit : undefined,
              height: fit ? naturalSize.height * fit : undefined,
              maxWidth: fit ? "none" : undefined,
              maxHeight: fit ? "none" : undefined,
              visibility: loaded ? "visible" : "hidden",
              transform: `translate(${scale > 1 ? position.x : 0}px, ${scale > 1 ? position.y : 0}px) rotate(${rotation}deg) scale(${scale})`,
              cursor: scale > 1 ? "grab" : "zoom-in",
            }}
            onDoubleClick={() => {
              setScale(scale === 1 ? 2 : 1)
              setPosition({ x: 0, y: 0 })
            }}
          />
        )}
      </div>
      {actionError ? (
        <p role="alert" className="text-center text-sm text-destructive">
          {actionError}
        </p>
      ) : null}
      <div className="flex shrink-0 flex-wrap items-center justify-center gap-1">
        <TooltipIconButton
          tooltip={t("common.zoomOut")}
          disabled={!loaded || error || scale <= 1}
          onClick={() => zoom(-0.25)}
        >
          <MinusIcon />
        </TooltipIconButton>
        <span className="text-xs text-muted-foreground tabular-nums">
          {Math.round(scale * 100)}%
        </span>
        <TooltipIconButton
          tooltip={t("common.zoomIn")}
          disabled={!loaded || error || scale >= 8}
          onClick={() => zoom(0.25)}
        >
          <PlusIcon />
        </TooltipIconButton>
        <TooltipIconButton
          tooltip={t("common.resetZoom")}
          disabled={!loaded || error}
          onClick={reset}
        >
          <RotateCcwIcon />
        </TooltipIconButton>
        <TooltipIconButton
          tooltip={t("common.rotateImage")}
          disabled={!loaded || error}
          onClick={rotate}
        >
          <RotateCwIcon />
        </TooltipIconButton>
        <TooltipIconButton
          tooltip={t("common.copyImage")}
          disabled={busy || !loaded || error}
          onClick={async () => {
            setBusy(true)
            setActionError("")
            setCopied(false)
            try {
              await copyImageSource(image.src)
              setCopied(true)
            } catch {
              setActionError(t("common.copyFailed"))
            } finally {
              setBusy(false)
            }
          }}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </TooltipIconButton>
        <TooltipIconButton
          tooltip={t("common.download")}
          disabled={busy || !loaded || error}
          onClick={async () => {
            setBusy(true)
            setActionError("")
            try {
              await downloadMediaSource(image.src, image.alt || "image")
            } catch {
              setActionError(t("common.downloadFailed"))
            } finally {
              setBusy(false)
            }
          }}
        >
          <DownloadIcon />
        </TooltipIconButton>
      </div>
    </div>
  )
}
