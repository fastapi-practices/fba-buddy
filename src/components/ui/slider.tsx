import { Slider as SliderPrimitive } from "@base-ui/react/slider"

import { cn } from "@/lib/utils"

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  variant = "default",
  thumbProps,
  ...props
}: SliderPrimitive.Root.Props & {
  variant?: "default" | "stepped"
  thumbProps?: SliderPrimitive.Thumb.Props
}) {
  const _values = Array.isArray(value)
    ? value
    : typeof value === "number"
      ? [value]
      : Array.isArray(defaultValue)
        ? defaultValue
        : typeof defaultValue === "number"
          ? [defaultValue]
          : [min]

  return (
    <SliderPrimitive.Root
      className={cn("data-horizontal:w-full data-vertical:h-full", className)}
      data-slot="slider"
      data-variant={variant}
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      thumbAlignment={variant === "stepped" ? "center" : "edge"}
      {...props}
    >
      <SliderPrimitive.Control
        className={cn(
          "relative flex w-full touch-none items-center select-none data-disabled:opacity-50 data-vertical:h-full data-vertical:min-h-40 data-vertical:w-auto data-vertical:flex-col",
          variant === "stepped" && "data-horizontal:h-4"
        )}
      >
        <SliderPrimitive.Track
          data-slot="slider-track"
          className={cn(
            "relative grow overflow-hidden rounded-full select-none data-horizontal:w-full data-vertical:h-full",
            variant === "stepped"
              ? "bg-muted-foreground/35 data-horizontal:h-px data-vertical:w-px"
              : "bg-muted data-horizontal:h-1 data-vertical:w-1"
          )}
        >
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className={cn(
              "select-none data-horizontal:h-full data-vertical:w-full",
              variant === "stepped" ? "bg-foreground/80" : "bg-primary"
            )}
          />
        </SliderPrimitive.Track>
        {Array.from({ length: _values.length }, (_, index) => (
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            key={index}
            {...thumbProps}
            className={cn(
              "relative block shrink-0 rounded-full border ring-ring/50 transition-[color,box-shadow] select-none after:absolute after:-inset-2 focus-visible:ring-3 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50",
              variant === "stepped"
                ? "h-4 w-2 border-foreground/15 bg-popover shadow-sm hover:ring-2 active:ring-2"
                : "size-3 border-ring bg-background hover:ring-3 active:ring-3",
              thumbProps?.className
            )}
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

export { Slider }
