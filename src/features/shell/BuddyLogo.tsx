import { cn } from "@/lib/utils"

const BRAND_GREEN = "#009485"
const BRAND_WHITE = "#FFFFFF"

export function BuddyLogo({
  className,
  title = "FbaBuddy",
}: {
  className?: string
  title?: string
}) {
  return (
    <svg
      viewBox="0 0 1024 1024"
      role="img"
      aria-label={title}
      className={cn("shrink-0", className)}
    >
      <title>{title}</title>
      <rect
        x="72"
        y="72"
        width="880"
        height="880"
        rx="220"
        fill={BRAND_WHITE}
      />
      <g
        transform="translate(232 232) scale(1.12)"
        fill={BRAND_GREEN}
        fillRule="evenodd"
      >
        <path d="M126.011 197.367H211.069L7.875 500 75.606 286.901H0L75.606 35.311h146.49L126.011 197.367Z" />
        <path d="M91.116 461.864H500L303.718 0l-95.893 161.692h84.888L91.116 461.864Z" />
      </g>
    </svg>
  )
}
