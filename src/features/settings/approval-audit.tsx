import { useState } from "react"
import { useInfiniteQuery } from "@tanstack/react-query"
import { HistoryIcon, RefreshCwIcon } from "lucide-react"

import { listApprovalAudits } from "@/api/approval-audits"
import { apiErrorMessage } from "@/api/http"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Spinner } from "@/components/ui/spinner"
import { useT } from "@/hooks/use-t"
import { useAccountSourceStore } from "@/lib/account-source"

export function ApprovalAuditHistory() {
  const t = useT()
  const [open, setOpen] = useState(false)
  const epoch = useAccountSourceStore((state) => state.epoch)
  const records = useInfiniteQuery({
    queryKey: ["approval-audits", epoch],
    queryFn: ({ pageParam, signal }) => listApprovalAudits(pageParam, signal),
    initialPageParam: undefined as number | string | undefined,
    getNextPageParam: (page) =>
      page.length === 50 ? page.at(-1)?.id : undefined,
    enabled: open,
    staleTime: 0,
  })
  const rows = records.data?.pages.flat() ?? []
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="outline" />}>
        <HistoryIcon data-icon="inline-start" />
        {t("audit.title")}
      </DialogTrigger>
      <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-center justify-between gap-4 pr-8">
            <DialogTitle>{t("audit.title")}</DialogTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={records.isFetching}
              onClick={() => void records.refetch()}
            >
              <RefreshCwIcon data-icon="inline-start" />
              {t("common.clickToRefresh")}
            </Button>
          </div>
        </DialogHeader>
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
          {records.isLoading ? <Spinner /> : null}
          {records.isError ? (
            <Alert variant="destructive">
              <AlertDescription>
                {apiErrorMessage(records.error)}
              </AlertDescription>
            </Alert>
          ) : null}
          {!records.isLoading && !records.isError && rows.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>{t("audit.empty")}</EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : null}
          {rows.map((record) => (
            <article
              key={record.request_id}
              className="flex flex-col gap-2 rounded-xl border p-4 text-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="min-w-0 font-medium break-all">
                  {record.tool_name}
                </span>
                <Badge variant="outline">{t(`audit.${record.status}`)}</Badge>
              </div>
              <time className="text-muted-foreground">
                {record.created_time}
              </time>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs break-all">
                <dt>{t("audit.conversation")}</dt>
                <dd>{record.conversation_id}</dd>
                <dt>{t("audit.run")}</dt>
                <dd>{record.run_id}</dd>
                <dt>{t("audit.call")}</dt>
                <dd>{record.tool_call_id}</dd>
                <dt>SHA-256</dt>
                <dd>{record.arguments_sha256}</dd>
                {record.resolved_time ? (
                  <>
                    <dt>{t("audit.resolved")}</dt>
                    <dd>{record.resolved_time}</dd>
                  </>
                ) : null}
              </dl>
            </article>
          ))}
          {records.hasNextPage ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={records.isFetchingNextPage}
              onClick={() => void records.fetchNextPage()}
            >
              {t("audit.older")}
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
