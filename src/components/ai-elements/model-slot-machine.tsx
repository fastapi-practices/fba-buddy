"use client"

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react"
import { ChevronDownIcon } from "lucide-react"

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  DEFAULT_EFFORT_OPTIONS,
  modelToneSurface,
  type ModelOption,
  type ModelSelectorEffortOption,
  type ModelTone,
} from "@/features/chat/model-option"
import { useT } from "@/hooks/use-t"
import { cn } from "@/lib/utils"

export type ModelSlotProvider = {
  id: string
  name: string
  tone?: ModelTone
  models: readonly ModelOption[]
}

/** 单格高度与可视高度，中奖线永远落在正中那一格 */
const REEL_ITEM_HEIGHT = 46
const REEL_VISIBLE_ITEMS = 3
const REEL_VIEW_HEIGHT = REEL_ITEM_HEIGHT * REEL_VISIBLE_ITEMS
const REEL_PADDING = (REEL_VIEW_HEIGHT - REEL_ITEM_HEIGHT) / 2
const REEL_OVERSCROLL = 14
const WHEEL_STEP = 34
type ReelItem = {
  key: string
  node: ReactNode
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function reelTransform(offset: number) {
  return `translate3d(0, ${REEL_PADDING - offset}px, 0)`
}

/** 读取动画中的实际位移，保证重新抓住滚筒时不会跳 */
function readDrumOffset(drum: HTMLDivElement | null) {
  if (!drum) return null
  const transform = window.getComputedStyle(drum).transform
  if (!transform || transform === "none") return null
  try {
    return REEL_PADDING - new DOMMatrixReadOnly(transform).m42
  } catch {
    return null
  }
}

/** 模型自带的思考档位，没有就按默认三档处理 */
function effortsForModel(
  model: ModelOption | undefined
): readonly ModelSelectorEffortOption[] {
  const efforts = model?.efforts
  if (!efforts) return []
  return efforts === true ? DEFAULT_EFFORT_OPTIONS : efforts
}

/** 单列滚筒：指针位移只改 transform，松手后再吸附并提交选中项 */
function SlotReel({
  items,
  index,
  label,
  disabled = false,
  onIndexChange,
}: {
  items: ReelItem[]
  index: number
  label: string
  disabled?: boolean
  onIndexChange: (index: number) => void
}) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const drumRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    pointerId: number
    startY: number
    startOffset: number
  } | null>(null)
  const clickGuardRef = useRef<(() => void) | null>(null)
  const clickGuardTimerRef = useRef<number | null>(null)
  const wheelDeltaRef = useRef(0)
  const indexRef = useRef(0)
  const targetIndexRef = useRef(0)
  const offsetRef = useRef(0)
  const lengthRef = useRef(items.length)
  const disabledRef = useRef(disabled)
  const onIndexChangeRef = useRef(onIndexChange)
  const listboxId = useId()
  const len = items.length
  const safeIndex = clamp(index, 0, Math.max(0, len - 1))
  indexRef.current = safeIndex
  lengthRef.current = len
  disabledRef.current = disabled
  onIndexChangeRef.current = onIndexChange

  const paintOffset = useCallback((offset: number) => {
    const drum = drumRef.current
    if (drum) drum.style.transform = reelTransform(offset)
  }, [])

  const releaseClickGuard = useCallback(() => {
    if (clickGuardTimerRef.current !== null) {
      window.clearTimeout(clickGuardTimerRef.current)
      clickGuardTimerRef.current = null
    }
    clickGuardRef.current?.()
    clickGuardRef.current = null
  }, [])

  const finishDrag = useCallback(
    (pointerId: number) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== pointerId) return
      dragRef.current = null

      const itemCount = lengthRef.current
      const maxOffset = Math.max(0, (itemCount - 1) * REEL_ITEM_HEIGHT)
      const boundedOffset = clamp(offsetRef.current, 0, maxOffset)
      const nextIndex = clamp(
        Math.round(boundedOffset / REEL_ITEM_HEIGHT),
        0,
        Math.max(0, itemCount - 1)
      )
      const snappedOffset = nextIndex * REEL_ITEM_HEIGHT

      offsetRef.current = snappedOffset
      targetIndexRef.current = nextIndex
      viewportRef.current?.classList.remove("is-dragging")
      document.documentElement.classList.remove("is-slot-reel-dragging")

      const drum = drumRef.current
      if (drum) {
        void drum.offsetWidth
        paintOffset(snappedOffset)
      }
      if (nextIndex !== indexRef.current) {
        onIndexChangeRef.current(nextIndex)
      }

      // 弹窗外松手会补发一次 click，拦截后再恢复
      clickGuardTimerRef.current = window.setTimeout(() => {
        releaseClickGuard()
      }, 0)
    },
    [paintOffset, releaseClickGuard]
  )

  // 选中项变化时把对应一格送到中奖线，拖动期间绝不覆盖当前位移
  useEffect(() => {
    if (dragRef.current) return
    const itemCount = lengthRef.current
    const nextIndex = clamp(index, 0, Math.max(0, itemCount - 1))
    const nextOffset = nextIndex * REEL_ITEM_HEIGHT
    targetIndexRef.current = nextIndex
    offsetRef.current = nextOffset
    paintOffset(nextOffset)
  }, [index, items.length, paintOffset])

  useEffect(() => {
    return () => {
      releaseClickGuard()
      document.documentElement.classList.remove("is-slot-reel-dragging")
    }
  }, [releaseClickGuard])

  // 指针一旦按下就监听 window，拖出弹窗甚至拖出列都不会丢事件
  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      if (event.buttons === 0) {
        finishDrag(event.pointerId)
        return
      }
      event.preventDefault()

      const itemCount = lengthRef.current
      if (itemCount === 0) return
      const maxOffset = (itemCount - 1) * REEL_ITEM_HEIGHT
      const rawOffset = drag.startOffset - (event.clientY - drag.startY)
      let nextOffset = rawOffset
      if (nextOffset < 0) {
        nextOffset = -Math.min(REEL_OVERSCROLL, Math.abs(nextOffset) * 0.3)
      } else if (nextOffset > maxOffset) {
        nextOffset =
          maxOffset + Math.min(REEL_OVERSCROLL, (nextOffset - maxOffset) * 0.3)
      }

      offsetRef.current = nextOffset
      paintOffset(nextOffset)
    }

    const handlePointerUp = (event: PointerEvent) => {
      finishDrag(event.pointerId)
    }

    const handleWindowBlur = () => {
      const drag = dragRef.current
      if (drag) finishDrag(drag.pointerId)
    }

    window.addEventListener("pointermove", handlePointerMove, {
      passive: false,
    })
    window.addEventListener("pointerup", handlePointerUp)
    window.addEventListener("pointercancel", handlePointerUp)
    window.addEventListener("blur", handleWindowBlur)
    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
      window.removeEventListener("pointercancel", handlePointerUp)
      window.removeEventListener("blur", handleWindowBlur)
    }
  }, [finishDrag, paintOffset])

  // 滚轮直接阻止页面滚动，按方向逐格切换
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      if (disabledRef.current || dragRef.current) return
      const itemCount = lengthRef.current
      if (itemCount === 0) return

      const scale =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? 16
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? REEL_VIEW_HEIGHT
            : 1
      wheelDeltaRef.current += event.deltaY * scale
      if (Math.abs(wheelDeltaRef.current) < WHEEL_STEP) return

      const direction = Math.sign(wheelDeltaRef.current)
      wheelDeltaRef.current = 0
      const current = targetIndexRef.current
      const next = clamp(current + direction, 0, itemCount - 1)
      if (next === current) return
      targetIndexRef.current = next
      onIndexChangeRef.current(next)
    }

    viewport.addEventListener("wheel", handleWheel, { passive: false })
    return () => viewport.removeEventListener("wheel", handleWheel)
  }, [])

  const moveBy = useCallback((delta: number) => {
    if (disabledRef.current) return
    const itemCount = lengthRef.current
    if (itemCount === 0) return
    const next = clamp(targetIndexRef.current + delta, 0, itemCount - 1)
    if (next === targetIndexRef.current) return
    targetIndexRef.current = next
    onIndexChangeRef.current(next)
  }, [])

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (disabledRef.current || event.button !== 0 || dragRef.current) return
    event.preventDefault()
    event.currentTarget.focus({ preventScroll: true })

    const currentOffset = readDrumOffset(drumRef.current) ?? offsetRef.current
    const itemCount = lengthRef.current
    const maxOffset = Math.max(0, (itemCount - 1) * REEL_ITEM_HEIGHT)
    const boundedOffset = clamp(currentOffset, 0, maxOffset)

    offsetRef.current = boundedOffset
    targetIndexRef.current = clamp(
      Math.round(boundedOffset / REEL_ITEM_HEIGHT),
      0,
      Math.max(0, itemCount - 1)
    )
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startOffset: boundedOffset,
    }
    event.currentTarget.classList.add("is-dragging")
    document.documentElement.classList.add("is-slot-reel-dragging")
    paintOffset(boundedOffset)

    releaseClickGuard()
    const suppressClick = (clickEvent: MouseEvent) => {
      clickEvent.preventDefault()
      clickEvent.stopPropagation()
    }
    window.addEventListener("click", suppressClick, true)
    clickGuardRef.current = () =>
      window.removeEventListener("click", suppressClick, true)
  }

  return (
    <div
      ref={viewportRef}
      data-slot="model-slot-reel"
      role="listbox"
      id={listboxId}
      tabIndex={0}
      aria-label={label}
      aria-disabled={disabled}
      aria-activedescendant={len > 0 ? `${listboxId}-${safeIndex}` : undefined}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown") {
          event.preventDefault()
          moveBy(1)
        } else if (event.key === "ArrowUp") {
          event.preventDefault()
          moveBy(-1)
        } else if (event.key === "Home" || event.key === "End") {
          event.preventDefault()
          const itemCount = lengthRef.current
          if (itemCount === 0) return
          const next = event.key === "Home" ? 0 : itemCount - 1
          if (next === targetIndexRef.current) return
          targetIndexRef.current = next
          onIndexChangeRef.current(next)
        }
      }}
      onPointerDown={handlePointerDown}
      className={cn("model-slot-reel", disabled && "is-disabled")}
    >
      <div
        ref={drumRef}
        data-slot="model-slot-drum"
        className="model-slot-drum"
        style={{ transform: reelTransform(safeIndex * REEL_ITEM_HEIGHT) }}
      >
        {items.map((item, itemIndex) => (
          <div
            id={`${listboxId}-${itemIndex}`}
            key={item.key}
            role="option"
            aria-selected={itemIndex === safeIndex}
            data-slot="model-slot-item"
            className="model-slot-item"
          >
            {item.node}
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * 拉杆：默认立在上方，点击后绕底部铰链向下前方拉动再回弹
 */
function SlotLever({
  label,
  disabled,
  onPull,
}: {
  label: string
  disabled?: boolean
  onPull: () => void
}) {
  const [pulled, setPulled] = useState(false)
  const resetTimerRef = useRef<number | null>(null)

  const pull = useCallback(() => {
    if (disabled) return
    if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current)
    setPulled(true)
    onPull()
    resetTimerRef.current = window.setTimeout(() => {
      setPulled(false)
      resetTimerRef.current = null
    }, 360)
  }, [disabled, onPull])

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current)
    }
  }, [])

  return (
    <div
      className={cn(
        "model-slot-lever",
        pulled && "is-pulled",
        disabled && "is-disabled"
      )}
    >
      <div className="model-slot-lever-track">
        <span className="model-slot-lever-lamp" aria-hidden="true" />
        <button
          type="button"
          aria-label={label}
          aria-disabled={disabled}
          title={label}
          onClick={pull}
          className="model-slot-lever-handle"
        >
          <span className="model-slot-lever-arm" aria-hidden="true">
            <span className="model-slot-lever-knob" />
            <span className="model-slot-lever-collar" />
            <span className="model-slot-lever-rod" />
          </span>
        </button>
        <span className="model-slot-lever-pivot" aria-hidden="true">
          <span className="model-slot-lever-pivot-hub" />
        </span>
      </div>
    </div>
  )
}

/**
 * 老虎机模型选择器：供应商 / 模型 / 思考强度三列滚筒，
 * 滚筒可以拨、可以按住拖，点击拉杆随机，停在中间那格就选哪格
 */
export function ModelSlotMachine({
  providers,
  value,
  efforts,
  effort,
  onSelect,
  onEffortChange,
  onOpenChange,
  trigger,
  className,
}: {
  providers: readonly ModelSlotProvider[]
  value: string | undefined
  efforts: readonly ModelSelectorEffortOption[] | undefined
  effort: string | undefined
  onSelect: (modelId: string) => void
  onEffortChange: (effort: string) => void
  onOpenChange?: (open: boolean) => void
  trigger: ReactNode
  className?: string
}) {
  const t = useT()
  const [providerIndex, setProviderIndex] = useState(0)
  const [modelIndex, setModelIndex] = useState(0)
  const [effortIndex, setEffortIndex] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const spinTimerRef = useRef<number | null>(null)

  // 外部改了模型就同步滚轮位置
  useEffect(() => {
    if (providers.length === 0) return
    const nextProvider = providers.findIndex((provider) =>
      provider.models.some((model) => model.id === value)
    )
    if (nextProvider < 0) return
    setProviderIndex(nextProvider)
    const nextModel = providers[nextProvider].models.findIndex(
      (model) => model.id === value
    )
    if (nextModel >= 0) setModelIndex(nextModel)
  }, [value, providers])

  useEffect(() => {
    return () => {
      if (spinTimerRef.current) window.clearTimeout(spinTimerRef.current)
    }
  }, [])

  const provider = providers[providerIndex]
  const providerModels = provider?.models ?? []
  const model = providerModels[modelIndex]
  const modelEfforts = effortsForModel(model)
  const effortOptions = modelEfforts.length ? modelEfforts : (efforts ?? [])
  const effortList: readonly ModelSelectorEffortOption[] = effortOptions.length
    ? effortOptions
    : [{ id: "off", name: t("common.noThinking") }]
  const hasThinking = providers.some((item) =>
    item.models.some((model) => effortsForModel(model).length > 0)
  )

  const providerItems = useMemo<ReelItem[]>(
    () =>
      providers.map((item) => ({
        key: item.id,
        node: (
          <>
            <span
              className={cn(
                modelToneSurface(item.tone),
                "size-5 rounded-md text-[9px]"
              )}
            >
              {item.models[0]?.icon}
            </span>
            <span className="min-w-0 truncate font-medium">{item.name}</span>
          </>
        ),
      })),
    [providers]
  )

  const modelItems = useMemo<ReelItem[]>(
    () =>
      providerModels.map((item) => ({
        key: item.id,
        node: (
          <>
            {item.icon ? (
              <span
                className={cn(
                  modelToneSurface(item.tone),
                  "size-5 rounded-md text-[9px]"
                )}
              >
                {item.icon}
              </span>
            ) : null}
            <span className="min-w-0 truncate font-medium">{item.name}</span>
          </>
        ),
      })),
    [providerModels]
  )

  const effortItems = useMemo<ReelItem[]>(
    () =>
      effortList.map((item, index) => ({
        key: item.id,
        node: (
          <>
            <span className="flex h-3 items-end gap-[3px]">
              {[0, 1, 2, 3, 4].map((step) => (
                <span
                  key={step}
                  className={cn(
                    "w-1 rounded-full",
                    step < index + 1
                      ? "h-3 bg-foreground/75"
                      : "h-1.5 bg-foreground/20"
                  )}
                />
              ))}
            </span>
            <span className="min-w-0 truncate font-medium">{item.name}</span>
          </>
        ),
      })),
    [effortList]
  )

  // 换模型时思考档位跟着走，模型不支持思考就交给上层关掉
  const syncEffortForModel = useCallback(
    (nextModel: ModelOption | undefined) => {
      const nextEfforts = effortsForModel(nextModel)
      if (!nextEfforts.length) {
        setEffortIndex(0)
        return
      }
      const keep = nextEfforts.findIndex((item) => item.id === effort)
      if (keep >= 0) {
        setEffortIndex(keep)
        onEffortChange(nextEfforts[keep].id)
        return
      }
      // 档位不通用时由上层按模型默认纠正，这里先回到第一格
      setEffortIndex(0)
    },
    [effort, onEffortChange]
  )

  // 上层把档位纠正到别的值时，滚轮跟着挪
  useEffect(() => {
    if (!effort) return
    const next = effortList.findIndex((item) => item.id === effort)
    if (next >= 0 && next !== effortIndex) setEffortIndex(next)
  }, [effort, effortIndex, effortList])

  const handleProviderIndex = useCallback(
    (next: number) => {
      if (spinning) return
      const nextProvider = providers[next]
      if (!nextProvider) return
      setProviderIndex(next)
      const keep = nextProvider.models.findIndex((item) => item.id === value)
      const nextModelIndex = keep >= 0 ? keep : 0
      setModelIndex(nextModelIndex)
      const nextModel = nextProvider.models[nextModelIndex]
      if (!nextModel) return
      onSelect(nextModel.id)
      syncEffortForModel(nextModel)
    },
    [onSelect, providers, spinning, syncEffortForModel, value]
  )

  const handleModelIndex = useCallback(
    (next: number) => {
      if (spinning) return
      const nextModel = providerModels[next]
      if (!nextModel) return
      setModelIndex(next)
      onSelect(nextModel.id)
      syncEffortForModel(nextModel)
    },
    [onSelect, providerModels, spinning, syncEffortForModel]
  )

  const handleEffortIndex = useCallback(
    (next: number) => {
      if (spinning) return
      const item = effortList[next]
      if (!item) return
      setEffortIndex(next)
      onEffortChange(item.id)
    },
    [effortList, onEffortChange, spinning]
  )

  const handlePull = useCallback(() => {
    if (spinning || providers.length === 0) return
    const candidates = providers.flatMap((item, providerIndex) =>
      item.models.map((model, modelIndex) => ({
        providerIndex,
        modelIndex,
        model,
      }))
    )
    if (candidates.length === 0) return
    const fresh = candidates.filter((item) => item.model.id !== value)
    const pool = fresh.length > 0 ? fresh : candidates
    const picked = pool[Math.floor(Math.random() * pool.length)]
    if (!picked) return
    const nextModel = picked.model
    if (!nextModel) return
    const nextEfforts = effortsForModel(nextModel)
    const nextEffortIndex = nextEfforts.length
      ? Math.floor(Math.random() * nextEfforts.length)
      : 0

    setSpinning(true)
    setProviderIndex(picked.providerIndex)
    setModelIndex(picked.modelIndex)
    setEffortIndex(nextEffortIndex)
    onSelect(nextModel.id)
    onEffortChange(nextEfforts[nextEffortIndex]?.id ?? "off")
    if (spinTimerRef.current) window.clearTimeout(spinTimerRef.current)
    spinTimerRef.current = window.setTimeout(() => {
      setSpinning(false)
      spinTimerRef.current = null
    }, 760)
  }, [onEffortChange, onSelect, providers, spinning, value])

  const columns = [
    {
      key: "provider",
      label: t("common.modelProvider"),
      reel: (
        <SlotReel
          items={providerItems}
          index={providerIndex}
          label={t("common.modelProvider")}
          disabled={spinning}
          onIndexChange={handleProviderIndex}
        />
      ),
    },
    {
      key: "model",
      label: t("common.model"),
      reel: (
        <SlotReel
          items={modelItems}
          index={modelIndex}
          label={t("common.model")}
          disabled={spinning}
          onIndexChange={handleModelIndex}
        />
      ),
    },
    ...(hasThinking
      ? [
          {
            key: "effort",
            label: t("common.thinking"),
            reel: (
              <SlotReel
                items={effortItems}
                index={effortIndex}
                label={t("common.thinking")}
                disabled={spinning}
                onIndexChange={handleEffortIndex}
              />
            ),
          },
        ]
      : []),
  ]

  return (
    <Popover onOpenChange={onOpenChange}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={t("common.selectAModel")}
            className={cn(
              "inline-flex h-7 max-w-56 min-w-0 items-center gap-1.5 rounded-full border border-input bg-transparent pr-1.5 pl-2 text-[0.8rem] transition-colors hover:bg-accent hover:text-accent-foreground",
              className
            )}
          />
        }
      >
        {trigger}
        <ChevronDownIcon className="size-3.5 shrink-0 opacity-55" />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="top"
        sideOffset={12}
        className="model-slot-panel"
      >
        <div className="model-slot-marquee" aria-hidden="true">
          <span className="model-slot-bulb" />
          <span className="model-slot-marquee-title">
            {t("common.selectAModel")}
          </span>
          <span className="model-slot-bulb" />
        </div>
        <div className={cn("model-slot-window", spinning && "is-spinning")}>
          <div className="model-slot-reels">
            {columns.map((column) => (
              <div key={column.key} className="model-slot-column">
                <span className="model-slot-column-head">{column.label}</span>
                {column.reel}
              </div>
            ))}
            <div className="model-slot-drum-shade" />
            <div className="model-slot-glass" />
            <div className="model-slot-payline" />
          </div>
          <SlotLever
            label={t("common.slotLeverHint")}
            disabled={spinning || providers.length === 0}
            onPull={handlePull}
          />
        </div>
        <div className="model-slot-foot">
          <span
            className={cn(
              modelToneSurface(model?.tone),
              "size-5 rounded-md text-[9px]"
            )}
          >
            {model?.icon}
          </span>
          <span className="min-w-0 truncate font-medium">
            {model?.name ?? t("common.selectAModel")}
          </span>
          <span className="ml-auto min-w-0 truncate text-muted-foreground">
            {[model?.context, model?.price].filter(Boolean).join(" · ")}
          </span>
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** 触发器里的模型图标、名称与思考档位 */
export function ModelSlotTrigger({
  model,
  effortName,
  placeholder,
  className,
}: {
  model: ModelOption | undefined
  effortName?: string | undefined
  placeholder: string
  className?: string
}) {
  return (
    <>
      {model?.icon ? (
        <span className="flex size-4 shrink-0 items-center justify-center">
          {model.icon}
        </span>
      ) : null}
      <span className={cn("min-w-0 truncate font-medium", className)}>
        {model?.name ?? placeholder}
      </span>
      {effortName ? (
        <span className="shrink-0 rounded-full bg-muted px-1.5 py-px text-[11px] text-muted-foreground">
          {effortName}
        </span>
      ) : null}
    </>
  )
}
