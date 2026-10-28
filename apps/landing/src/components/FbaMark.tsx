import { cn } from "../lib/utils"

export function FbaMark(props: { className?: string; title?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 500 500"
      fill="none"
      className={cn("size-8 shrink-0", props.className)}
      role="img"
      aria-label={props.title ?? "FbaBuddy"}
    >
      <title>{props.title ?? "FbaBuddy"}</title>
      <rect width="500" height="500" rx="112" fill="#10201E" />
      <rect
        x="1"
        y="1"
        width="498"
        height="498"
        rx="111"
        stroke="#57E6CB"
        strokeOpacity=".28"
        strokeWidth="2"
      />
      <g fill="#51E3C6" transform="translate(64 44) scale(.744)">
        <path
          fillRule="evenodd"
          d="M126.011 197.367H211.069L7.875 500 75.606 286.901H0L75.606 35.311h146.49L126.011 197.367Z"
          clipRule="evenodd"
        />
        <path
          fillRule="evenodd"
          d="M91.116 461.864H500L303.718 0l-95.893 161.692h84.888L91.116 461.864Z"
          clipRule="evenodd"
        />
      </g>
    </svg>
  )
}
