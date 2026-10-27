import { useCallback, useEffect, useRef, useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useT } from "@/hooks/use-t"
import { currentAccountSource, dataSourceKey } from "@/lib/account-source"
import type {
  WorkspaceEngineeringCheck,
  WorkspaceTarget,
} from "@/shared/workspace"

export function WorkspaceEngineering({ target }: { target: WorkspaceTarget }) {
  const t = useT()
  const [source] = useState(currentAccountSource)
  const [sourceKey] = useState(dataSourceKey)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [check, setCheck] = useState<WorkspaceEngineeringCheck | null>(null)
  const ticket = useRef(0)
  const refresh = useCallback(async () => {
    const id = ++ticket.current
    setLoading(true)
    setError("")
    try {
      const result = await window.buddyDesktop!.workspace({
        action: "engineering-check",
        ...target,
        source: source ?? undefined,
      })
      if (id !== ticket.current || sourceKey !== dataSourceKey()) return
      if (result && "whitespace" in result) setCheck(result)
      else throw new Error(t("common.gitResponseInvalid"))
    } catch (cause) {
      if (id === ticket.current && sourceKey === dataSourceKey())
        setError(String(cause))
    } finally {
      if (id === ticket.current) setLoading(false)
    }
  }, [target, source, sourceKey, t])
  useEffect(() => {
    const request = ticket
    let active = true
    queueMicrotask(() => {
      if (active) void refresh()
    })
    return () => {
      active = false
      request.current++
    }
  }, [refresh])
  return (
    <div className="flex min-h-0 flex-col gap-3 overflow-auto">
      <p className="text-sm text-muted-foreground">
        {t("common.engineeringCheckHint")}
      </p>
      <Button
        className="self-start"
        variant="outline"
        size="sm"
        disabled={loading}
        onClick={() => void refresh()}
      >
        {t("common.gitRefresh")}
      </Button>
      {loading && <p role="status">{t("common.loading")}</p>}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {check && (
        <>
          <p>{new Date(check.checkedAt).toLocaleString()}</p>
          {!check.repository ? (
            <p>{t("common.gitNotRepository")}</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">
                  {t("common.gitStaged")}: {check.staged}
                </Badge>
                <Badge variant="outline">
                  {t("common.gitUnstaged")}: {check.unstaged}
                </Badge>
                <Badge variant="outline">
                  {t("common.gitUntracked")}: {check.untracked}
                </Badge>
              </div>
              <Alert
                variant={check.conflicts.length ? "destructive" : "default"}
              >
                <AlertDescription>
                  {check.conflicts.length
                    ? t("common.engineeringConflicts", {
                        paths: check.conflicts.join(", "),
                      })
                    : t("common.engineeringNoConflicts")}
                </AlertDescription>
              </Alert>
              {check.whitespace.map((item) => (
                <div key={item.scope} className="flex flex-col gap-2">
                  <p>
                    {t(
                      item.scope === "staged"
                        ? "common.gitStaged"
                        : "common.gitUnstaged"
                    )}
                    :{" "}
                    {t(
                      item.ok
                        ? "common.engineeringWhitespacePassed"
                        : "common.engineeringWhitespaceFailed"
                    )}
                  </p>
                  {item.truncated && <p>{t("common.gitDiffTruncated")}</p>}
                  {item.output && (
                    <pre className="max-h-60 overflow-auto rounded border p-3 text-xs">
                      {item.output}
                    </pre>
                  )}
                </div>
              ))}
            </>
          )}
        </>
      )}
    </div>
  )
}
