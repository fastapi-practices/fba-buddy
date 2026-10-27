import type { ComponentProps } from "react"

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

export { Select as SettingsSelect, SelectGroup as SettingsSelectGroup }

/** 设置页下拉共用尺寸，长名称在选项中完整显示 */
export function SettingsSelectTrigger({
  className,
  ...props
}: Omit<ComponentProps<typeof SelectTrigger>, "size">) {
  return (
    <SelectTrigger
      {...props}
      size="default"
      className={cn(
        "w-56 max-w-full min-w-0 shrink-0 *:data-[slot=select-value]:block *:data-[slot=select-value]:truncate",
        className
      )}
    />
  )
}

export function SettingsSelectValue({
  className,
  ...props
}: ComponentProps<typeof SelectValue>) {
  return (
    <SelectValue {...props} className={cn("min-w-0 truncate", className)} />
  )
}

/** 弹窗统一靠右展开，空间不足时交由定位组件避让 */
export function SettingsSelectContent({
  className,
  ...props
}: Omit<
  ComponentProps<typeof SelectContent>,
  "align" | "alignItemWithTrigger" | "side"
>) {
  return (
    <SelectContent
      {...props}
      side="bottom"
      align="end"
      alignItemWithTrigger={false}
      className={cn(
        "max-h-[min(24rem,var(--available-height))] w-max max-w-[min(32rem,var(--available-width))] min-w-(--anchor-width)",
        className
      )}
    />
  )
}

export function SettingsSelectItem({
  ...props
}: Omit<ComponentProps<typeof SelectItem>, "showIndicator" | "textClassName">) {
  return (
    <SelectItem
      {...props}
      textClassName="min-w-0 shrink items-center wrap-anywhere whitespace-normal"
    />
  )
}
