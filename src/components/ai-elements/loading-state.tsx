"use client";

import { useEffect, useState, type ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { ShimmerLabel } from "./surfaces";

type GenerationLoaderVariant = "dots" | "squares" | "rounded";

interface GenerationLoaderProps extends Omit<
  ComponentProps<"div">,
  "children"
> {
  label: string;
  tick: number;
  variant?: GenerationLoaderVariant;
}

const CELL_SHAPES: Record<GenerationLoaderVariant, string> = {
  dots: "rounded-full",
  squares: "rounded-[1px]",
  rounded: "rounded-[3px]",
};

function GenerationLoader({
  label,
  tick,
  variant = "dots",
  className,
  ...props
}: GenerationLoaderProps) {
  const pixelOffset = Math.floor(tick / 3);

  return (
    <div
      data-slot="generation-loader"
      className={cn("flex flex-col items-center gap-4", className)}

      {...props}
    >
      <div aria-hidden className="grid grid-cols-3 gap-1">
        {Array.from({ length: 9 }, (_, index) => {
          const active = (index * 2 + pixelOffset) % 9 < 3;

          return (
            <span
              key={index}
              className={cn(
                "bg-foreground size-2 transition-opacity duration-300 motion-reduce:transition-none",
                CELL_SHAPES[variant],
                active ? "opacity-90" : "opacity-15",
              )}
            />
          );
        })}
      </div>
      <ShimmerLabel className="text-foreground/55 relative inline-block text-sm">
        {label}
      </ShimmerLabel>
    </div>
  );
}

function ChatLoading({ label }: { label: string }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 120);
    return () => window.clearInterval(id);
  }, []);
  return <GenerationLoader label={label} tick={tick} />;
}

export function DelayedChatLoading({
  label,
  delayMs = 200,
}: {
  label: string;
  delayMs?: number;
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs]);
  if (!visible) {
    return null;
  }
  return <ChatLoading label={label} />;
}
