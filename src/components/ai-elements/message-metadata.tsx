import { useChatMessageState } from "@/features/chat/chat-runtime"
import { useT } from "@/hooks/use-t"
import { cn } from "@/lib/utils"

function label(value: unknown): string | null {
  if (typeof value === "string") return value
  if (!value || typeof value !== "object") return null
  const fields = value as Record<string, unknown>
  for (const key of ["name", "label", "type", "id"])
    if (typeof fields[key] === "string") return fields[key]
  return null
}

export function MessageMetadata({ className }: { className?: string }) {
  const t = useT()
  const metadata = useChatMessageState((state) => state.message.metadata?.custom ?? {})
  const rawDate = metadata.createdAt
  const date = typeof rawDate === "string" ? new Date(rawDate) : null
  const origin = label(metadata.origin)
  const author = label(metadata.createdBy)
  const intent =
    typeof metadata.inputIntent === "string" ? metadata.inputIntent : null
  const source = [
    origin &&
      (origin === "cron"
        ? t("common.messageFromSchedule")
        : origin === "im"
          ? t("common.messageFromIM")
          : origin === "web"
            ? null
            : origin),
    author,
    intent,
  ]
    .filter(Boolean)
    .join(" · ")
  if (!source && (!date || !Number.isFinite(date.getTime()))) return null
  return (
    <span
      data-slot="message-metadata"
      data-find-ignore
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-1 text-xs text-muted-foreground",
        className
      )}
    >
      {source && (
        <span className="max-w-60 truncate" title={source}>
          {source}
        </span>
      )}
      {date && Number.isFinite(date.getTime()) && (
        <time
          dateTime={date.toISOString()}
          title={date.toLocaleString()}
          className="opacity-0 transition-opacity group-focus-within/message:opacity-100 group-hover/message:opacity-100 [@media(hover:none)]:opacity-100"
        >
          {date.toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </time>
      )}
    </span>
  )
}
