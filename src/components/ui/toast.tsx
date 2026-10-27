"use client"

import * as React from "react"
import { Toast as ToastPrimitive } from "@base-ui/react/toast"
import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { useT } from "@/hooks/use-t"
import { cn } from "@/lib/utils"

const toast = ToastPrimitive.createToastManager()

function ToastProvider({ ...props }: ToastPrimitive.Provider.Props) {
  return <ToastPrimitive.Provider {...props} />
}

function ToastPortal({ ...props }: ToastPrimitive.Portal.Props) {
  return <ToastPrimitive.Portal data-slot="toast-portal" {...props} />
}

function ToastViewport({ className, ...props }: ToastPrimitive.Viewport.Props) {
  const t = useT()

  return (
    <ToastPrimitive.Viewport
      data-slot="toast-viewport"
      aria-label={t("common.notifications")}
      className={cn(
        "electron-no-drag pointer-events-none fixed inset-x-4 top-[max(1rem,env(safe-area-inset-top))] z-50 mx-auto w-auto max-w-[26rem] outline-none",
        className
      )}
      {...props}
    />
  )
}

function Toast({ className, ...props }: ToastPrimitive.Root.Props) {
  return (
    <ToastPrimitive.Root
      data-slot="toast"
      swipeDirection="up"
      className={cn(
        "group/toast pointer-events-auto absolute top-0 left-0 z-[calc(1000-var(--toast-index))] w-full origin-top rounded-2xl border bg-popover text-popover-foreground shadow-lg will-change-transform outline-none select-none focus-visible:ring-3 focus-visible:ring-current/20",
        "data-[type=success]:border-toast-success-border data-[type=success]:bg-toast-success data-[type=success]:text-toast-success-foreground",
        "data-[type=error]:border-toast-error-border data-[type=error]:bg-toast-error data-[type=error]:text-toast-error-foreground",
        "data-[type=warning]:border-toast-warning-border data-[type=warning]:bg-toast-warning data-[type=warning]:text-toast-warning-foreground",
        "data-[type=info]:border-toast-info-border data-[type=info]:bg-toast-info data-[type=info]:text-toast-info-foreground",
        "[--gap:0.5rem] [--height:var(--toast-frontmost-height,var(--toast-height))] [--offset-y:calc(var(--toast-offset-y)+calc(var(--toast-index)*var(--gap))+var(--toast-swipe-movement-y))] [--peek:0.5rem] [--scale:calc(max(0,1-(var(--toast-index)*0.1)))] [--shrink:calc(1-var(--scale))]",
        "h-(--height) [transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)+(var(--toast-index)*var(--peek))+(var(--shrink)*var(--height))))_scale(var(--scale))] [transition:transform_350ms_cubic-bezier(0.22,1,0.36,1),opacity_350ms,height_150ms] motion-reduce:transition-none",
        "after:absolute after:top-full after:left-0 after:h-[calc(var(--gap)+1px)] after:w-full after:content-['']",
        "data-expanded:h-(--toast-height) data-expanded:[transform:translateX(var(--toast-swipe-movement-x))_translateY(var(--offset-y))]",
        "data-limited:opacity-0 data-starting-style:[transform:translateY(-150%)]",
        "[&[data-ending-style]:not([data-limited]):not([data-swipe-direction])]:[transform:translateY(-150%)]",
        "data-ending-style:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+150%))]",
        "data-ending-style:data-[swipe-direction=left]:[transform:translateX(calc(var(--toast-swipe-movement-x)-150%))_translateY(var(--offset-y))]",
        "data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))]",
        "data-ending-style:data-[swipe-direction=up]:[transform:translateY(calc(var(--toast-swipe-movement-y)-150%))]",
        "data-expanded:data-ending-style:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+150%))]",
        "data-expanded:data-ending-style:data-[swipe-direction=left]:[transform:translateX(calc(var(--toast-swipe-movement-x)-150%))_translateY(var(--offset-y))]",
        "data-expanded:data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))]",
        "data-expanded:data-ending-style:data-[swipe-direction=up]:[transform:translateY(calc(var(--toast-swipe-movement-y)-150%))]",
        className
      )}
      {...props}
    />
  )
}

function ToastContent({ className, ...props }: ToastPrimitive.Content.Props) {
  return (
    <ToastPrimitive.Content
      data-slot="toast-content"
      className={cn(
        "flex min-h-14 items-center gap-3 px-4 py-3 transition-opacity duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] has-data-[slot=toast-description]:items-start data-behind:pointer-events-none data-behind:opacity-0 data-expanded:pointer-events-auto data-expanded:opacity-100 motion-reduce:transition-none",
        className
      )}
      {...props}
    />
  )
}

function ToastTitle({ className, ...props }: ToastPrimitive.Title.Props) {
  return (
    <ToastPrimitive.Title
      data-slot="toast-title"
      className={cn("text-sm leading-5 font-medium wrap-anywhere", className)}
      {...props}
    />
  )
}

function ToastDescription({
  className,
  ...props
}: ToastPrimitive.Description.Props) {
  return (
    <ToastPrimitive.Description
      data-slot="toast-description"
      className={cn(
        "text-xs leading-5 wrap-anywhere whitespace-pre-line text-inherit opacity-90",
        className
      )}
      {...props}
    />
  )
}

function ToastAction({
  className,
  render = <Button variant={null} size="sm" />,
  ...props
}: ToastPrimitive.Action.Props) {
  return (
    <ToastPrimitive.Action
      data-slot="toast-action"
      render={render}
      className={cn(
        "-my-1 h-auto min-h-7 max-w-[40%] shrink-0 rounded-lg border-current/20 bg-transparent px-2 py-1 text-xs wrap-anywhere whitespace-normal text-inherit hover:bg-toast-hover hover:text-inherit",
        className
      )}
      {...props}
    />
  )
}

function ToastClose({
  className,
  children,
  render = <Button variant={null} size="icon-sm" />,
  ...props
}: ToastPrimitive.Close.Props) {
  const t = useT()

  return (
    <ToastPrimitive.Close
      data-slot="toast-close"
      aria-label={t("common.dismissNotification")}
      render={render}
      className={cn(
        "relative -my-1 size-7 shrink-0 rounded-lg text-inherit opacity-80 after:absolute after:-inset-1.5 after:content-[''] hover:bg-toast-hover hover:text-inherit hover:opacity-100",
        className
      )}
      {...props}
    >
      {children ?? <XIcon aria-hidden="true" />}
    </ToastPrimitive.Close>
  )
}

function ToastIcon({ type }: { type: string | undefined }) {
  let icon: React.ReactNode = null

  if (type === "success") {
    icon = <CircleCheckIcon aria-hidden="true" />
  }
  if (type === "info") {
    icon = <InfoIcon aria-hidden="true" />
  }
  if (type === "warning") {
    icon = <TriangleAlertIcon aria-hidden="true" />
  }
  if (type === "error") {
    icon = <OctagonXIcon aria-hidden="true" />
  }
  if (type === "loading") {
    icon = (
      <Loader2Icon
        aria-hidden="true"
        className="animate-spin motion-reduce:animate-none"
      />
    )
  }
  if (!icon) {
    return null
  }

  return (
    <span
      data-slot="toast-icon"
      className="shrink-0 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-5"
    >
      {icon}
    </span>
  )
}

function ToastList() {
  const { toasts } = ToastPrimitive.useToastManager()

  return toasts.map((toastItem) => (
    <Toast key={toastItem.id} toast={toastItem}>
      <ToastContent>
        <ToastIcon type={toastItem.type} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <ToastTitle />
          {toastItem.description ? <ToastDescription /> : null}
        </div>
        <ToastAction />
        <ToastClose />
      </ToastContent>
    </Toast>
  ))
}

function Toaster({
  children,
  toastManager = toast,
  timeout = 3000,
  limit = 3,
  ...props
}: ToastPrimitive.Provider.Props) {
  return (
    <ToastProvider
      toastManager={toastManager}
      timeout={timeout}
      limit={limit}
      {...props}
    >
      {children}
      <ToastPortal>
        <ToastViewport>
          <ToastList />
        </ToastViewport>
      </ToastPortal>
    </ToastProvider>
  )
}

export { Toaster, toast }
