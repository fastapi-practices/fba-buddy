import { useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { ExternalLinkIcon, KeyRoundIcon, RefreshCwIcon } from "lucide-react"

import { ApiError, apiErrorMessage, isAbortError } from "@/api/http"
import {
  authorizeMcpOauth,
  disconnectMcpOauth,
  type McpOauthStatus,
} from "@/api/mcp-oauth"
import { queryKeys } from "@/api/query-keys"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import {
  isMcpOauthEligible,
  mcpOauthQueryKey,
  useMcpOauthStatus,
} from "@/features/mcp/use-mcp-oauth"
import { useT } from "@/hooks/use-t"
import { useAccountSourceStore } from "@/lib/account-source"
import { openExternal } from "@/lib/open-external"
import type { McpItem } from "@/lib/types"

type Authorization = { url: string; expiresAt: number }
type AuthorizationAttempt = { invalidated: boolean; disconnected: boolean }
type Action = "authorize" | "disconnect" | "open" | "refresh"

export function McpOauth({ mcp }: { mcp: McpItem }) {
  const epoch = useAccountSourceStore((state) => state.epoch)
  if (!isMcpOauthEligible(mcp)) return null
  return (
    <McpOauthConnection
      key={`${epoch}:${mcp.id}:${mcp.type}:${mcp.url}`}
      mcp={mcp}
    />
  )
}

function McpOauthConnection({ mcp }: { mcp: McpItem }) {
  const t = useT()
  const queryClient = useQueryClient()
  const epoch = useAccountSourceStore((state) => state.epoch)
  const status = useMcpOauthStatus(mcp)
  const [action, setAction] = useState<Action | null>(null)
  const [error, setError] = useState("")
  const [authorization, setAuthorization] = useState<Authorization | null>(null)
  const [expired, setExpired] = useState(false)
  const locked = useRef(false)
  const requests = useRef<AbortController | null>(null)
  const authorizationAttempt = useRef<AuthorizationAttempt | null>(null)
  const data = status.data
  const inaccessible =
    status.error instanceof ApiError && [403, 404].includes(status.error.code)

  if (
    authorization &&
    (inaccessible || (data && (!data.configured || data.connected)))
  )
    setAuthorization(null)

  useEffect(() => {
    const controller = new AbortController()
    requests.current = controller
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const cache = queryClient.getQueryCache()
    return cache.subscribe((event) => {
      const attempt = authorizationAttempt.current
      if (
        !attempt ||
        event.type !== "updated" ||
        event.query !==
          cache.find({ queryKey: mcpOauthQueryKey(mcp, epoch), exact: true })
      )
        return
      const current = event.query.state.data as McpOauthStatus | undefined
      const cause = event.query.state.error
      if (
        (cause instanceof ApiError && [403, 404].includes(cause.code)) ||
        current?.configured === false ||
        (current?.connected && attempt.disconnected)
      )
        attempt.invalidated = true
      if (current && !current.connected) attempt.disconnected = true
    })
  }, [epoch, mcp, queryClient])

  useEffect(() => {
    if (!authorization) return
    const timer = window.setTimeout(
      () => {
        setAuthorization(null)
        setExpired(true)
      },
      Math.max(0, authorization.expiresAt - Date.now())
    )
    return () => window.clearTimeout(timer)
  }, [authorization])

  async function perform(nextAction: Action) {
    const signal = requests.current?.signal
    if (locked.current || !signal || signal.aborted) return
    locked.current = true
    setAction(nextAction)
    setError("")
    try {
      if (nextAction === "authorize") {
        setAuthorization(null)
        setExpired(false)
        const reconnecting = data?.connected === true
        const attempt: AuthorizationAttempt = {
          invalidated: false,
          disconnected: !reconnecting,
        }
        authorizationAttempt.current = attempt
        const result = await authorizeMcpOauth(mcp.id, signal)
        signal.throwIfAborted()
        if (
          new URL(result.authorization_url).protocol !== "https:" ||
          !Number.isFinite(result.expires_seconds) ||
          result.expires_seconds <= 0
        )
          throw new Error(t("oauth.invalidUrl"))
        const expiresAt = Date.now() + result.expires_seconds * 1_000
        if (reconnecting) {
          await status.refetch({ throwOnError: true })
          signal.throwIfAborted()
        }
        const latest = queryClient.getQueryState<McpOauthStatus>(
          mcpOauthQueryKey(mcp, epoch)
        )
        if (
          attempt.invalidated ||
          !latest?.data?.configured ||
          latest.data.connected ||
          latest.error
        )
          return
        if (expiresAt <= Date.now()) {
          setExpired(true)
          return
        }
        setAuthorization({
          url: result.authorization_url,
          expiresAt,
        })
        try {
          await openExternal(result.authorization_url)
          signal.throwIfAborted()
        } catch (cause) {
          if (!signal.aborted) setError(apiErrorMessage(cause))
        }
      } else if (nextAction === "open") {
        if (!authorization || authorization.expiresAt <= Date.now()) {
          setAuthorization(null)
          setExpired(true)
          return
        }
        await openExternal(authorization.url)
      } else {
        if (nextAction === "disconnect") {
          await disconnectMcpOauth(mcp.id, signal)
          signal.throwIfAborted()
          setAuthorization(null)
          setExpired(false)
        }
        await status.refreshConnection({
          afterMutation: nextAction === "disconnect",
        })
        signal.throwIfAborted()
      }
    } catch (cause) {
      if (signal.aborted || isAbortError(cause)) return
      setError(apiErrorMessage(cause))
      if (nextAction !== "open" && nextAction !== "refresh") {
        setAuthorization(null)
        await status.refreshConnection().catch(() => {})
        if (cause instanceof ApiError && [403, 404].includes(cause.code))
          await queryClient.invalidateQueries({ queryKey: queryKeys.mcps() })
      }
    } finally {
      authorizationAttempt.current = null
      locked.current = false
      if (!signal.aborted) setAction(null)
    }
  }

  const busy = action !== null || status.isFetching
  const waiting =
    authorization && data?.configured && !data.connected && !inaccessible

  if (!data?.configured) return null

  return (
    <section className="flex flex-col gap-3" aria-label="OAuth">
      <Separator />
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">OAuth</h3>
        {data && !status.isError ? (
          <Badge variant={data.connected ? "secondary" : "outline"}>
            {t(data.connected ? "oauth.connected" : "oauth.notConnected")}
          </Badge>
        ) : null}
      </div>
      <p className="text-sm text-muted-foreground">{t("oauth.description")}</p>
      {status.isLoading ? <Spinner aria-label={t("common.loading")} /> : null}
      {error || status.isError ? (
        <Alert variant="destructive">
          <AlertDescription>
            {error || apiErrorMessage(status.error)}
          </AlertDescription>
        </Alert>
      ) : null}
      {data?.connected && data.expires_time && !status.isError ? (
        <p className="text-xs text-muted-foreground">
          {t("oauth.expires", { time: data.expires_time })}
        </p>
      ) : null}
      {expired && data?.configured && !data.connected ? (
        <p role="status" className="text-sm text-muted-foreground">
          {t("oauth.expired")}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {data?.configured && !status.isError ? (
          <>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void perform("authorize")}
            >
              {action === "authorize" ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <KeyRoundIcon data-icon="inline-start" />
              )}
              {t(data.connected ? "oauth.reconnect" : "oauth.connect")}
            </Button>
            {data.connected ? (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void perform("disconnect")}
              >
                {action === "disconnect" ? (
                  <Spinner data-icon="inline-start" />
                ) : null}
                {t("oauth.disconnect")}
              </Button>
            ) : null}
          </>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={() => void perform("refresh")}
        >
          {action === "refresh" ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <RefreshCwIcon data-icon="inline-start" />
          )}
          {t(
            status.isError
              ? "common.retry"
              : data?.configured && !data.connected
                ? "oauth.completed"
                : "oauth.refresh"
          )}
        </Button>
      </div>
      {waiting ? (
        <div className="flex flex-col items-start gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void perform("open")}
          >
            <ExternalLinkIcon data-icon="inline-start" />
            {t("oauth.openBrowser")}
          </Button>
          <p role="status" className="text-xs text-muted-foreground">
            {t("oauth.waiting")}
          </p>
        </div>
      ) : null}
    </section>
  )
}
