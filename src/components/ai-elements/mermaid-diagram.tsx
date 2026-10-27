"use client"

import { renderMermaidSVG } from "beautiful-mermaid"
import { Maximize2, Minus, Plus, RotateCcw, X } from "lucide-react"
import {
  type FC,
  type ReactNode,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"
import { Diagram } from "./diagram"
import { useT } from "@/hooks/use-t"

type MermaidDiagramProps = {
  code: string
  className?: string
  /** Renders a skeleton instead of the diagram while `true`. */
  streaming?: boolean
}

const MIN_SCALE = 0.5
const MAX_SCALE = 4

type MermaidZoomProps = {
  svg: string
  children: ReactNode
  /** 行内是否保留悬停展开按钮，全屏视图始终提供 */
  showTrigger?: boolean
  /** 变化时打开全屏视图，用于把控制交给外部工具栏 */
  openRequest?: number
}

function MermaidZoom({
  svg,
  children,
  showTrigger = true,
  openRequest = 0,
}: MermaidZoomProps) {
  const [isMounted, setIsMounted] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{
    startX: number
    startY: number
    originX: number
    originY: number
  } | null>(null)
  const transformRef = useRef(transform)
  transformRef.current = transform

  const zoomSvg = useMemo(
    () =>
      svg
        .replace(/id="([^"]+)"/g, 'id="$1-zoom"')
        .replace(/url\(#([^)]+)\)/g, "url(#$1-zoom)")
        .replace(/(href|xlink:href)="#([^"]+)"/g, '$1="#$2-zoom"'),
    [svg]
  )

  useEffect(() => {
    setIsMounted(true)
  }, [])

  const handleClose = useCallback(() => {
    setIsOpen(false)
    setTransform({ x: 0, y: 0, scale: 1 })
    triggerRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose()
        return
      }
      if (e.key !== "Tab") return
      const focusables = overlayRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
      const first = focusables?.[0]
      const last = focusables?.[focusables.length - 1]
      if (!first || !last) return
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, handleClose])

  useEffect(() => {
    if (!isOpen) return
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen) closeRef.current?.focus()
  }, [isOpen])

  useEffect(() => {
    if (openRequest > 0) setIsOpen(true)
  }, [openRequest])

  const zoomBy = useCallback((factor: number, cx?: number, cy?: number) => {
    setTransform((t) => {
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, t.scale * factor))
      const ratio = scale / t.scale
      if (cx === undefined || cy === undefined) {
        const viewport = viewportRef.current
        cx = (viewport?.clientWidth ?? 0) / 2
        cy = (viewport?.clientHeight ?? 0) / 2
      }
      return {
        scale,
        x: cx - (cx - t.x) * ratio,
        y: cy - (cy - t.y) * ratio,
      }
    })
  }, [])

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      const viewport = viewportRef.current
      if (!viewport) return
      const rect = viewport.getBoundingClientRect()
      zoomBy(
        Math.exp(-e.deltaY * 0.0015),
        e.clientX - rect.left,
        e.clientY - rect.top
      )
    },
    [zoomBy]
  )

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    const t = transformRef.current
    drag.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: t.x,
      originY: t.y,
    }
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    setTransform((t) => ({
      ...t,
      x: d.originX + e.clientX - d.startX,
      y: d.originY + e.clientY - d.startY,
    }))
  }, [])

  const onPointerUp = useCallback(() => {
    drag.current = null
  }, [])

  return (
    <div
      data-slot="mermaid-zoom-wrap"
      className="mermaid-zoom-wrap group/mermaid relative"
    >
      {children}
      {showTrigger ? (
        <button
          ref={triggerRef}
          type="button"
          data-slot="mermaid-zoom-trigger"
          aria-label="Expand diagram"
          onClick={() => setIsOpen(true)}
          className="mermaid-zoom-trigger absolute top-2 right-2 cursor-pointer rounded-md border border-border bg-background p-1.5 text-muted-foreground opacity-0 transition group-hover/mermaid:opacity-100 hover:border-muted-foreground/70 hover:text-foreground focus-visible:opacity-100"
        >
          <Maximize2 className="size-3.5" />
        </button>
      ) : null}
      {isMounted &&
        isOpen &&
        createPortal(
          <div
            ref={overlayRef}
            data-slot="mermaid-zoom-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="Diagram"
            className="mermaid-zoom-overlay fixed inset-0 z-50 animate-in bg-background duration-200 fade-in"
          >
            <div
              ref={viewportRef}
              className="mermaid-zoom-viewport h-full w-full cursor-grab touch-none overflow-hidden active:cursor-grabbing"
              onWheel={onWheel}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              <div
                data-slot="mermaid-zoom-content"
                className="mermaid-zoom-content flex h-full w-full items-center justify-center [&_svg]:max-h-[80vh] [&_svg]:max-w-[90vw]"
                style={{
                  transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
                  transformOrigin: "0 0",
                }}
                dangerouslySetInnerHTML={{ __html: zoomSvg }}
              />
            </div>
            <div
              data-slot="mermaid-zoom-toolbar"
              className="mermaid-zoom-toolbar absolute top-4 right-4 flex items-center gap-1 rounded-lg border border-border bg-background p-1"
            >
              <button
                type="button"
                aria-label="Zoom in"
                onClick={() => zoomBy(1.25)}
                className="cursor-pointer rounded-sm p-1.5 text-muted-foreground hover:text-foreground"
              >
                <Plus className="size-4" />
              </button>
              <button
                type="button"
                aria-label="Zoom out"
                onClick={() => zoomBy(0.8)}
                className="cursor-pointer rounded-sm p-1.5 text-muted-foreground hover:text-foreground"
              >
                <Minus className="size-4" />
              </button>
              <button
                type="button"
                aria-label="Reset zoom"
                onClick={() => setTransform({ x: 0, y: 0, scale: 1 })}
                className="cursor-pointer rounded-sm p-1.5 text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="size-4" />
              </button>
              <button
                ref={closeRef}
                type="button"
                aria-label="Close"
                onClick={handleClose}
                className="cursor-pointer rounded-sm p-1.5 text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}

const ZOOM_STEP = 0.25
const MIN_ZOOM = 0.5
const MAX_ZOOM = 2

const clampZoom = (value: number) =>
  Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(value.toFixed(2))))

const MermaidRendering: FC<MermaidDiagramProps> = ({
  code,
  className,
  streaming = false,
}) => {
  const t = useT()
  const [zoom, setZoom] = useState(1)
  const [expandRequest, setExpandRequest] = useState(0)
  const result = useMemo(() => {
    if (streaming) return null
    try {
      return {
        svg: renderMermaidSVG(code, {
          bg: "var(--background)",
          fg: "var(--foreground)",
          muted: "var(--muted-foreground)",
          border: "var(--border)",
          accent: "var(--foreground)",
          transparent: true,
        }),
        error: null,
      }
    } catch (err) {
      return {
        svg: null,
        error: err instanceof Error ? err : new Error(String(err)),
      }
    }
  }, [streaming, code])

  useEffect(() => {
    setZoom(1)
  }, [code])

  const controls = {
    zoom,
    onZoomIn:
      zoom < MAX_ZOOM
        ? () => setZoom((current) => clampZoom(current + ZOOM_STEP))
        : undefined,
    onZoomOut:
      zoom > MIN_ZOOM
        ? () => setZoom((current) => clampZoom(current - ZOOM_STEP))
        : undefined,
    onReset: () => setZoom(1),
  }

  if (!result) {
    return (
      <Diagram
        data-slot="mermaid-skeleton"
        aria-label={t("common.diagram")}
        title={t("common.diagram")}
        zoom={1}
        className={cn("mermaid-skeleton animate-pulse", className)}
      >
        <div className="flex items-center justify-center gap-3 p-4">
          <div className="h-8 w-20 rounded-md bg-muted-foreground/20" />
          <div className="h-px w-10 bg-muted-foreground/20" />
          <div className="h-8 w-20 rounded-md bg-muted-foreground/20" />
          <div className="h-px w-10 bg-muted-foreground/20" />
          <div className="h-8 w-20 rounded-md bg-muted-foreground/20" />
        </div>
      </Diagram>
    )
  }

  if (result.error) {
    return (
      <Diagram
        data-slot="mermaid-fallback"
        title={t("common.diagram")}
        zoom={1}
        className={cn("mermaid-fallback", className)}
      >
        <div className="max-h-64 w-full overflow-auto p-4">
          <pre className="text-xs leading-5">{code.trim()}</pre>
          <p className="mt-3 text-xs text-muted-foreground">
            {t("common.diagramRenderFailed")}
          </p>
        </div>
      </Diagram>
    )
  }

  return (
    <MermaidZoom
      svg={result.svg}
      showTrigger={false}
      openRequest={expandRequest}
    >
      <Diagram
        title={t("common.diagram")}
        {...controls}
        onExpand={() => setExpandRequest((current) => current + 1)}
        className={cn("mermaid-diagram", className)}
      >
        <div
          data-slot="mermaid-figure"
          className="[&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-h-[18rem] [&_svg]:max-w-full"
          dangerouslySetInnerHTML={{ __html: result.svg }}
        />
      </Diagram>
    </MermaidZoom>
  )
}

const MermaidDiagramImpl: FC<MermaidDiagramProps> = (props) => {
  return <MermaidRendering {...props} />
}

const MermaidDiagram = memo(
  MermaidDiagramImpl
) as unknown as FC<MermaidDiagramProps> & {
  Zoom: typeof MermaidZoom
}

MermaidDiagram.displayName = "MermaidDiagram"
MermaidDiagram.Zoom = MermaidZoom

export { MermaidDiagram, MermaidZoom }
