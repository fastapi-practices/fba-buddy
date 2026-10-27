import { useCallback, useEffect } from "react"
import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query"

import { ApiError } from "@/api/http"
import { getMcpOauth } from "@/api/mcp-oauth"
import { queryKeys } from "@/api/query-keys"
import { useAccountSourceStore } from "@/lib/account-source"
import type { McpItem } from "@/lib/types"

export function isMcpOauthEligible(mcp: McpItem | null) {
  if (!mcp || mcp.user_id !== 0 || ![1, 2].includes(mcp.type) || !mcp.url)
    return false
  try {
    return new URL(mcp.url).protocol === "https:"
  } catch {
    return false
  }
}

export function mcpOauthQueryKey(mcp: McpItem | null, epoch: number) {
  return [
    "mcp-oauth",
    epoch,
    mcp?.id,
    mcp?.type,
    mcp?.url,
    mcp?.user_id,
  ] as const
}

export async function refreshMcpOauthConnection(
  queryClient: QueryClient,
  mcp: McpItem | null,
  epoch: number,
  options?: { afterMutation?: boolean }
) {
  if (
    !isMcpOauthEligible(mcp) ||
    useAccountSourceStore.getState().epoch !== epoch
  )
    throw new DOMException("Plugin connection changed", "AbortError")

  const results = await Promise.allSettled([
    queryClient.refetchQueries(
      {
        queryKey: mcpOauthQueryKey(mcp, epoch),
        exact: true,
        type: "active",
      },
      { cancelRefetch: options?.afterMutation ?? false, throwOnError: true }
    ),
    queryClient.refetchQueries(
      { queryKey: queryKeys.mcps(), type: "active" },
      { cancelRefetch: false, throwOnError: true }
    ),
  ])

  if (useAccountSourceStore.getState().epoch !== epoch)
    throw new DOMException("Plugin connection changed", "AbortError")

  const list = queryClient.getQueryState<McpItem[]>(queryKeys.mcps())
  if (list?.status === "success" && list.data) {
    const current = list.data.find((item) => item.id === mcp!.id)
    if (
      !current ||
      current.type !== mcp!.type ||
      current.url !== mcp!.url ||
      current.user_id !== mcp!.user_id
    )
      throw new DOMException("Plugin connection changed", "AbortError")
  }

  for (const result of results)
    if (result.status === "rejected") throw result.reason
}

export function useMcpOauthStatus(mcp: McpItem | null) {
  const epoch = useAccountSourceStore((state) => state.epoch)
  const queryClient = useQueryClient()
  const enabled = isMcpOauthEligible(mcp)
  const status = useQuery({
    queryKey: mcpOauthQueryKey(mcp, epoch),
    queryFn: ({ signal }) => getMcpOauth(mcp!.id, signal),
    enabled,
    retry: false,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  })
  const { error } = status
  const refreshConnection = useCallback(
    (options?: { afterMutation?: boolean }) =>
      refreshMcpOauthConnection(queryClient, mcp, epoch, options),
    [epoch, mcp, queryClient]
  )

  useEffect(() => {
    if (!enabled) return
    const refresh = () => {
      void refreshConnection().catch(() => {})
    }
    window.addEventListener("focus", refresh)
    return () => window.removeEventListener("focus", refresh)
  }, [enabled, refreshConnection])

  useEffect(() => {
    if (
      useAccountSourceStore.getState().epoch === epoch &&
      error instanceof ApiError &&
      [403, 404].includes(error.code)
    )
      void queryClient.invalidateQueries(
        { queryKey: queryKeys.mcps() },
        { cancelRefetch: false }
      )
  }, [epoch, error, queryClient])

  return { ...status, refreshConnection }
}
