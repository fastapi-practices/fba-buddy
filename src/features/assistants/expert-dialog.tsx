import { useQuery } from "@tanstack/react-query"
import {
  BookOpenIcon,
  FileTextIcon,
  MessageSquareQuoteIcon,
  PencilIcon,
  PlugIcon,
  QuoteIcon,
  RotateCcwIcon,
  SparklesIcon,
  Wand2Icon,
  XIcon,
} from "lucide-react"

import { getExpert } from "@/api"
import { apiErrorMessage } from "@/api/http"
import { queryKeys } from "@/api/query-keys"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { formatUsageCount } from "@/features/assistants/assistant"
import { expertOpenings } from "@/features/assistants/expert-apply"
import { ExpertAvatar } from "@/features/assistants/expert-avatar"
import { usePrefsStore } from "@/features/shell/prefs-store"
import { ExpandableText } from "@/features/workspace/expandable-text"
import { useT } from "@/hooks/use-t"
import { canEditOwnedResource } from "@/lib/ownership"
import type { ExpertDetail, ExpertItem } from "@/lib/types"

export function ExpertDialog({
  expert,
  applying,
  onClose,
  onApply,
  onEdit,
}: {
  expert: ExpertItem
  applying: boolean
  onClose: () => void
  onApply: (expert: ExpertDetail, opening?: string) => void
  onEdit: (expert: ExpertDetail) => void
}) {
  const t = useT()
  const locale = usePrefsStore((state) => state.locale)
  const detailQuery = useQuery({
    queryKey: queryKeys.expert(expert.id),
    queryFn: ({ signal }) => getExpert(expert.id, signal),
    refetchOnMount: "always",
    retry: false,
  })
  const loading = detailQuery.isFetching || detailQuery.isPending
  const detail = !loading && !detailQuery.isError ? detailQuery.data : undefined
  const summary = detail ?? expert
  const openings = detail ? expertOpenings(detail) : []

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        showCloseButton={false}
        overlayClassName="bg-black/50 supports-backdrop-filter:backdrop-blur-sm"
        className="gap-6 overflow-y-auto rounded-3xl p-6 sm:max-w-xl"
      >
        <DialogHeader className="gap-4">
          <div className="flex items-start gap-4">
            <ExpertAvatar expert={summary} className="size-16 shrink-0" />
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <DialogTitle className="min-w-0 flex-1 truncate text-lg font-semibold">
                  {summary.name}
                </DialogTitle>
                <p className="shrink-0 text-sm text-muted-foreground">
                  {formatUsageCount(summary.usage_count, locale)}
                </p>
                <DialogClose
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="shrink-0"
                    />
                  }
                >
                  <XIcon />
                  <span className="sr-only">{t("common.close")}</span>
                </DialogClose>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="lg"
                  className="w-fit"
                  disabled={!detail || applying}
                  onClick={() => {
                    if (detail) onApply(detail)
                  }}
                >
                  {applying ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <Wand2Icon data-icon="inline-start" />
                  )}
                  {applying ? t("common.applying") : t("common.summonExpert")}
                </Button>
                {canEditOwnedResource(summary.user_id) ? (
                  <Button
                    type="button"
                    size="lg"
                    variant="outline"
                    className="w-fit"
                    disabled={!detail || applying}
                    onClick={() => {
                      if (detail) onEdit(detail)
                    }}
                  >
                    <PencilIcon data-icon="inline-start" />
                    {t("common.edit")}
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
          <DialogDescription className="sr-only">
            {t("expert.detailDescription")}
          </DialogDescription>
          <ExpandableText
            text={detail?.description ?? summary.description ?? ""}
            emptyLabel={t("common.noDescription")}
          />
        </DialogHeader>
        <div className="flex flex-col gap-6" aria-busy={loading}>
          {loading ? (
            <div role="status" className="flex flex-col gap-5">
              <span className="sr-only">{t("common.loading")}</span>
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-20 w-full rounded-xl" />
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-28 w-full rounded-xl" />
            </div>
          ) : detailQuery.isError ? (
            <Empty role="alert">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <SparklesIcon />
                </EmptyMedia>
                <EmptyTitle>{t("expert.detailLoadFailed")}</EmptyTitle>
                <EmptyDescription>
                  {apiErrorMessage(
                    detailQuery.error,
                    t("common.pleaseTryAgainLater")
                  )}
                </EmptyDescription>
              </EmptyHeader>
              <Button
                variant="outline"
                onClick={() => void detailQuery.refetch()}
              >
                <RotateCcwIcon data-icon="inline-start" />
                {t("common.retry")}
              </Button>
            </Empty>
          ) : detail ? (
            <>
              {openings.length > 0 ? (
                <section
                  className="flex flex-col gap-3"
                  aria-label={t("common.letTheExpertHelp")}
                >
                  <p className="flex items-center gap-2 text-sm font-medium text-foreground [&_svg]:size-4 [&_svg]:text-muted-foreground">
                    <QuoteIcon />
                    {t("common.letTheExpertHelp")}
                  </p>
                  <div className="flex flex-col gap-2">
                    {openings.map((opening) => (
                      <Button
                        key={opening}
                        type="button"
                        variant="ghost"
                        disabled={applying}
                        className="h-auto w-full justify-between bg-foreground/4 px-4 py-3 text-left font-normal whitespace-normal hover:!bg-foreground/8 hover:text-foreground has-data-[icon=inline-end]:pr-4"
                        onClick={() => onApply(detail, opening)}
                      >
                        <span className="min-w-0 flex-1">{`“${opening}”`}</span>
                        <MessageSquareQuoteIcon data-icon="inline-end" />
                      </Button>
                    ))}
                  </div>
                </section>
              ) : null}
              <ExpertBindings expert={detail} />
              <section
                className="flex flex-col gap-3"
                aria-label={t("fields.prompt")}
              >
                <h3 className="flex items-center gap-2 text-sm font-medium text-foreground [&_svg]:size-4 [&_svg]:text-muted-foreground">
                  <FileTextIcon />
                  {t("fields.prompt")}
                </h3>
                <div className="rounded-xl bg-foreground/4 p-4 wrap-anywhere">
                  <ExpandableText
                    text={detail.prompt}
                    emptyLabel={t("common.noPrompt")}
                  />
                </div>
              </section>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ExpertBindings({ expert }: { expert: ExpertDetail }) {
  const t = useT()
  const groups: Array<{
    key: string
    icon: typeof PlugIcon
    label: string
    items: Array<{
      id: number
      name: string
      description: string | null
      version?: string
    }>
  }> = [
    { key: "mcp", icon: PlugIcon, label: t("common.mcp"), items: expert.mcps },
    {
      key: "skill",
      icon: SparklesIcon,
      label: t("common.skills"),
      items: expert.skills,
    },
    {
      key: "knowledge",
      icon: BookOpenIcon,
      label: t("knowledge.title"),
      items: expert.knowledge_bases,
    },
  ].filter((group) => group.items.length > 0)

  if (groups.length === 0) {
    return (
      <Empty className="border p-4">
        <EmptyHeader>
          <EmptyDescription>{t("expert.noBindings")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {groups.map(({ key, icon: Icon, label, items }) => (
        <section key={key} className="flex flex-col gap-3" aria-label={label}>
          <h3 className="flex items-center gap-2 text-sm font-medium text-foreground [&_svg]:size-4 [&_svg]:text-muted-foreground">
            <Icon />
            {label}
            <Badge variant="secondary">{items.length}</Badge>
          </h3>
          <ul className="flex flex-col divide-y rounded-xl border">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex min-w-0 flex-col gap-1.5 p-3 wrap-anywhere"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 font-medium">{item.name}</p>
                  {item.version?.trim() ? (
                    <Badge variant="outline">v{item.version}</Badge>
                  ) : null}
                </div>
                <ExpandableText
                  text={item.description ?? ""}
                  emptyLabel={t("common.noDescription")}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
