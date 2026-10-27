import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { getArtifact } from "@/api/workspace"
import { queryKeys } from "@/api/query-keys"
import { apiErrorMessage } from "@/api/http"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { TestResults } from "./test-results"
import { ArtifactDownload } from "@/features/workspace/artifact-download"
import { testReportOutcome, type TestReport } from "@/features/chat/test-report"
import { useT } from "@/hooks/use-t"
import { dataSourceKey, useAccountSourceStore } from "@/lib/account-source"
import type { TranslationKey } from "@/lib/i18n"
import { ToolCall } from "./tool-call"
import { ToolValue } from "./tool-value"
import { SquareTerminalIcon } from "lucide-react"

const REASON_LABELS: Record<TestReport["execution"]["reason"], TranslationKey> =
  {
    completed: "common.testReasonCompleted",
    cancelled: "common.testReasonCancelled",
    deadline: "common.testReasonDeadline",
    "output-limit": "common.testReasonOutputLimit",
    "execution-error": "common.testReasonExecutionError",
    "connection-error": "common.testReasonConnectionError",
  }

export function TestRunTool({
  report,
  request,
  rawResult,
  query,
  running,
  open,
  onOpenChange,
}: {
  report: TestReport | null
  request: string
  rawResult: string
  query: string
  running: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useT()
  const currentSource = useAccountSourceStore(dataSourceKey)
  const [source] = useState(currentSource)
  if (currentSource !== source) return null
  const outcome = report ? testReportOutcome(report) : "unknown"
  return (
    <ToolCall
      icon={SquareTerminalIcon}
      label={t(
        outcome === "success"
          ? "common.testCommandSucceeded"
          : outcome === "failed"
            ? "common.testCommandFailed"
            : "common.testCommandUnknown"
      )}
      activeLabel={t("common.testCommandRunning")}
      query={query}
      request={request}
      result={rawResult}
      resultContent={
        report ? (
          <TestReportContent report={report} source={source} open={open} />
        ) : !running ? (
          <div className="flex flex-col gap-3">
            <Alert>
              <AlertDescription>
                {t("common.testReportInvalid")}
              </AlertDescription>
            </Alert>
            <ToolValue value={rawResult} />
          </div>
        ) : undefined
      }
      outcome={outcome === "success" ? undefined : outcome}
      running={running}
      open={open}
      onOpenChange={onOpenChange}
    />
  )
}

function TestReportContent({
  report,
  source,
  open,
}: {
  report: TestReport
  source: string
  open: boolean
}) {
  const t = useT()
  const { execution, archive } = report
  return (
    <div data-slot="test-report" className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">
          {t("common.testExitCode", {
            code: execution.exit_code ?? t("common.testUnknownValue"),
          })}
        </Badge>
        <Badge variant="outline">
          {execution.duration_ms === null
            ? t("common.testDurationUnknown")
            : t("common.testDuration", { ms: execution.duration_ms })}
        </Badge>
        <Badge variant="secondary">{t(REASON_LABELS[execution.reason])}</Badge>
      </div>
      {report.suites && report.suites.length > 0 ? (
        <TestResults suites={report.suites} />
      ) : null}
      {archive.artifact_id !== null && open && (
        <TestReportArtifact
          key={`${source}:${archive.artifact_id}:${archive.status}`}
          id={archive.artifact_id}
          source={source}
        />
      )}
    </div>
  )
}

function TestReportArtifact({
  id,
  source,
}: {
  id: number | string
  source: string
}) {
  const t = useT()
  const currentSource = useAccountSourceStore(dataSourceKey)
  const ready = useAccountSourceStore((state) => state.ready)
  const query = useQuery({
    queryKey: [...queryKeys.artifact(id), source],
    queryFn: () => getArtifact(id),
    enabled: ready && currentSource === source,
    retry: false,
  })
  if (currentSource !== source) return null
  if (query.isPending) return <p role="status">{t("common.loading")}</p>
  if (query.isError)
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {apiErrorMessage(query.error, t("common.testReportLoadFailed"))}
          <Button
            size="sm"
            variant="outline"
            onClick={() => void query.refetch()}
          >
            {t("common.retry")}
          </Button>
        </AlertDescription>
      </Alert>
    )
  return (
    <div className="flex flex-col gap-2">
      <p>{query.data.title}</p>
      <ArtifactDownload artifact={query.data} />
    </div>
  )
}
