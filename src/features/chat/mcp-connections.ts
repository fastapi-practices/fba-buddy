import type { QueryClient } from "@tanstack/react-query"

import { listMcps } from "@/api"
import { apiErrorMessage, isAbortError } from "@/api/http"
import { getMcpOauth } from "@/api/mcp-oauth"
import { queryKeys } from "@/api/query-keys"
import { readSseEvents } from "@/api/stream"
import { openWorkspace } from "@/app/navigation"
import { toast } from "@/components/ui/toast"
import { toolOutcome } from "@/features/chat/tool-outcome"
import {
  isMcpOauthEligible,
  mcpOauthQueryKey,
} from "@/features/mcp/use-mcp-oauth"
import { translateCurrent } from "@/lib/i18n"
import type { McpItem } from "@/lib/types"

export type McpConnectionCheck = {
  allowed: boolean
  disconnected?: boolean
  error?: unknown
}

function selectedOauthMcps(mcps: McpItem[], ids: readonly number[]) {
  return mcps.filter((mcp) => ids.includes(mcp.id) && isMcpOauthEligible(mcp))
}

function fetchMcpConnection(
  queryClient: QueryClient,
  mcp: McpItem,
  epoch: number,
  requestSignal?: AbortSignal
) {
  return queryClient.fetchQuery({
    queryKey: mcpOauthQueryKey(mcp, epoch),
    queryFn: ({ signal }) =>
      getMcpOauth(
        mcp.id,
        requestSignal ? AbortSignal.any([signal, requestSignal]) : signal
      ),
    staleTime: 0,
    retry: false,
  })
}

export async function checkSelectedMcpConnections(
  queryClient: QueryClient,
  ids: readonly number[] | null | undefined,
  epoch: number,
  signal?: AbortSignal
): Promise<McpConnectionCheck> {
  if (!ids?.length) return { allowed: true }
  try {
    const mcps = await queryClient.fetchQuery({
      queryKey: queryKeys.mcps(),
      queryFn: listMcps,
      staleTime: 0,
      retry: false,
    })
    signal?.throwIfAborted()
    if (ids.some((id) => !mcps.some((mcp) => mcp.id === id)))
      return { allowed: false }
    const results = await Promise.allSettled(
      selectedOauthMcps(mcps, ids).map((mcp) =>
        fetchMcpConnection(queryClient, mcp, epoch, signal)
      )
    )
    signal?.throwIfAborted()
    const failed = results.find((result) => result.status === "rejected")
    if (failed?.status === "rejected") {
      void queryClient.invalidateQueries({ queryKey: queryKeys.mcps() })
      return { allowed: false, error: failed.reason }
    }
    const disconnected = results.some(
      (result) =>
        result.status === "fulfilled" &&
        result.value.configured &&
        !result.value.connected
    )
    return { allowed: !disconnected, disconnected }
  } catch (error) {
    return { allowed: false, error }
  }
}

export function notifyMcpConnectionCheck(check: McpConnectionCheck) {
  const message = translateCurrent(
    check.disconnected ? "oauth.connectionRequired" : "oauth.checkFailed"
  )
  toast.add({
    id: "mcp-connection-check",
    title: message,
    description: check.error ? apiErrorMessage(check.error) : undefined,
    type: "error",
    timeout: 8000,
    actionProps: {
      children: translateCurrent("oauth.checkConnection"),
      onClick: () => openWorkspace("mcp"),
    },
  })
  return message
}

export function isMcpRecoveryEvent(event: Record<string, unknown>) {
  if (event.type === "RUN_ERROR") return true
  if (event.type === "REASONING_ENCRYPTED_VALUE" && event.subtype === "message")
    return toolOutcome(event.encryptedValue).status === "error"
  if (event.type !== "TOOL_CALL_RESULT") return false
  if (
    event.isError === true ||
    event.is_error === true ||
    event.status === "failed" ||
    event.status === "error"
  )
    return true
  try {
    const content: unknown =
      typeof event.content === "string"
        ? JSON.parse(event.content)
        : event.content
    return Boolean(
      content &&
      typeof content === "object" &&
      (("isError" in content && content.isError === true) ||
        ("is_error" in content && content.is_error === true))
    )
  } catch {
    return false
  }
}

export async function* readMcpRunEvents(
  body: ReadableStream<Uint8Array>,
  onFailure: () => void,
  onEventId?: (id: string) => void
) {
  for await (const { id, event } of readSseEvents(body)) {
    if (id) onEventId?.(id)
    if (isMcpRecoveryEvent(event)) onFailure()
    yield event
    if (event.type === "RUN_FINISHED" || event.type === "RUN_ERROR") return
  }
}

export function createMcpFailureRecovery(
  queryClient: QueryClient,
  ids: readonly number[] | null | undefined,
  epoch: number,
  isCurrentSource: () => boolean
) {
  let recovered = false
  const selectedIds = [...(ids ?? [])]
  return () => {
    if (recovered || !selectedIds.length || !isCurrentSource()) return
    recovered = true
    void (async () => {
      try {
        const cached = queryClient.getQueryData<McpItem[]>(queryKeys.mcps())
        const mcps =
          cached ??
          (await queryClient.fetchQuery<McpItem[]>({
            queryKey: queryKeys.mcps(),
            queryFn: listMcps,
            staleTime: 0,
            retry: false,
          }))
        if (!isCurrentSource()) return
        const targets = selectedOauthMcps(mcps, selectedIds)
        if (!targets.length) return
        if (cached)
          void queryClient.invalidateQueries({ queryKey: queryKeys.mcps() })
        const results = await Promise.allSettled(
          targets.map(async (mcp) => {
            await queryClient.cancelQueries({
              queryKey: mcpOauthQueryKey(mcp, epoch),
              exact: true,
            })
            if (!isCurrentSource()) return
            return fetchMcpConnection(queryClient, mcp, epoch)
          })
        )
        if (!isCurrentSource()) return
        if (
          !results.some((result) =>
            result.status === "fulfilled"
              ? result.value?.configured
              : !isAbortError(result.reason)
          )
        )
          return
        toast.add({
          id: "mcp-runtime-connection-check",
          title: translateCurrent("oauth.runFailedHint"),
          type: "info",
          timeout: 8000,
          actionProps: {
            children: translateCurrent("oauth.checkConnection"),
            onClick: () => openWorkspace("mcp"),
          },
        })
      } catch {
        // 列表暂不可用时保留原运行错误，不推断 MCP 连接状态
      }
    })()
  }
}
