"use client"

import type { FC, SVGProps } from "react"

type IconComponent = FC<SVGProps<SVGSVGElement>>

export type DirectiveTextChipProps = {
  type: string
  id: string
  label: string
  iconMap?: Record<string, IconComponent>
  fallbackIcon?: IconComponent
}

/** Inline chip used by both message Directive text and the composer editor. */
export function DirectiveTextChip({
  type,
  id,
  label,
  iconMap,
  fallbackIcon,
}: DirectiveTextChipProps) {
  const Icon = iconMap?.[type] ?? fallbackIcon
  return (
    <span
      data-slot="directive-text-chip"
      data-directive-type={type}
      data-directive-id={id}
      aria-label={`${type}: ${label}`}
      className="directive-chip"
    >
      {Icon ? <Icon aria-hidden className="directive-chip-icon" /> : null}
      {label}
    </span>
  )
}
