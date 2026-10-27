import { QueryClient, QueryObserver } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { McpOauthStatus } from "@/api/mcp-oauth"
import { queryKeys } from "@/api/query-keys"
import { useAccountSourceStore } from "@/lib/account-source"
import type { McpItem } from "@/lib/types"
import {
  isMcpOauthEligible,
  mcpOauthQueryKey,
  refreshMcpOauthConnection,
} from "./use-mcp-oauth"

const mcp: McpItem = {
  id: 7,
  name: "Remote MCP",
  description: null,
  type: 2,
  url: "https://mcp.example.com/mcp",
  user_id: 0,
}
const disconnected: McpOauthStatus = {
  configured: true,
  connected: false,
  expires_time: null,
}
const cleanup: (() => void)[] = []

function observe<T>(
  client: QueryClient,
  queryKey: readonly unknown[],
  initialData: T,
  queryFn: () => Promise<T>
) {
  const observer = new QueryObserver(client, {
    queryKey,
    queryFn,
    initialData,
    staleTime: Infinity,
    retry: false,
  })
  cleanup.push(observer.subscribe(() => {}))
}

function pending<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

beforeEach(() => {
  useAccountSourceStore.setState({ epoch: 12 })
})

afterEach(() => {
  for (const dispose of cleanup.splice(0)) dispose()
  vi.restoreAllMocks()
})

describe("refreshMcpOauthConnection", () => {
  it("shares OAuth and metadata requests between concurrent observers", async () => {
    const client = new QueryClient()
    const oauth = pending<McpOauthStatus>()
    const list = pending<McpItem[]>()
    const fetchStatus = vi.fn(() => oauth.promise)
    const fetchList = vi.fn(() => list.promise)
    observe(client, mcpOauthQueryKey(mcp, 12), disconnected, fetchStatus)
    observe(client, queryKeys.mcps(), [mcp], fetchList)

    const first = refreshMcpOauthConnection(client, mcp, 12)
    const second = refreshMcpOauthConnection(client, mcp, 12)
    expect(fetchStatus).toHaveBeenCalledTimes(1)
    expect(fetchList).toHaveBeenCalledTimes(1)
    oauth.resolve({ ...disconnected, connected: true })
    list.resolve([mcp])
    await Promise.all([first, second])
    expect(client.getQueryData(mcpOauthQueryKey(mcp, 12))).toMatchObject({
      connected: true,
    })
    client.clear()
  })

  it("refreshes OAuth even when refreshing metadata fails", async () => {
    const client = new QueryClient()
    const listError = new Error("metadata unavailable")
    const fetchStatus = vi.fn(async () => disconnected)
    observe(
      client,
      mcpOauthQueryKey(mcp, 12),
      { ...disconnected, connected: true },
      fetchStatus
    )
    observe(client, queryKeys.mcps(), [mcp], async () => {
      throw listError
    })

    await expect(refreshMcpOauthConnection(client, mcp, 12)).rejects.toBe(
      listError
    )
    expect(fetchStatus).toHaveBeenCalledTimes(1)
    expect(client.getQueryData(mcpOauthQueryKey(mcp, 12))).toEqual(disconnected)
    client.clear()
  })

  it("starts a fresh status GET after a mutation despite a pending older GET", async () => {
    const client = new QueryClient()
    const connected = { ...disconnected, connected: true }
    const oldStatus = pending<McpOauthStatus>()
    const fetchStatus = vi
      .fn<() => Promise<McpOauthStatus>>()
      .mockImplementationOnce(() => oldStatus.promise)
      .mockResolvedValue(disconnected)
    observe(client, mcpOauthQueryKey(mcp, 12), connected, fetchStatus)
    observe(client, queryKeys.mcps(), [mcp], async () => [mcp])

    const beforeMutation = client.refetchQueries(
      { queryKey: mcpOauthQueryKey(mcp, 12), exact: true, type: "active" },
      { cancelRefetch: false }
    )
    expect(fetchStatus).toHaveBeenCalledTimes(1)
    await refreshMcpOauthConnection(client, mcp, 12, { afterMutation: true })
    expect(fetchStatus).toHaveBeenCalledTimes(2)
    expect(client.getQueryData(mcpOauthQueryKey(mcp, 12))).toEqual(disconnected)

    oldStatus.resolve(connected)
    await beforeMutation
    expect(client.getQueryData(mcpOauthQueryKey(mcp, 12))).toEqual(disconnected)
    client.clear()
  })

  it("reports OAuth failure before a concurrent metadata failure", async () => {
    const client = new QueryClient()
    const oauthError = new Error("connection unavailable")
    observe(client, mcpOauthQueryKey(mcp, 12), disconnected, async () => {
      throw oauthError
    })
    observe(client, queryKeys.mcps(), [mcp], async () => {
      throw new Error("metadata unavailable")
    })

    await expect(refreshMcpOauthConnection(client, mcp, 12)).rejects.toBe(
      oauthError
    )
    client.clear()
  })

  it.each([
    { items: [] },
    { items: [{ ...mcp, url: "https://mcp.example.com/changed" }] },
    { items: [{ ...mcp, type: 1 }] },
    { items: [{ ...mcp, user_id: 8 }] },
  ])(
    "discards successful OAuth results when MCP identity changes: %j",
    async ({ items }) => {
      const client = new QueryClient()
      observe(client, mcpOauthQueryKey(mcp, 12), disconnected, async () => ({
        ...disconnected,
        connected: true,
      }))
      observe(client, queryKeys.mcps(), [mcp], async () => items)

      await expect(
        refreshMcpOauthConnection(client, mcp, 12)
      ).rejects.toMatchObject({
        name: "AbortError",
      })
      client.clear()
    }
  )

  it("discards results after an account change", async () => {
    const client = new QueryClient()
    const oauth = pending<McpOauthStatus>()
    observe(
      client,
      mcpOauthQueryKey(mcp, 12),
      disconnected,
      () => oauth.promise
    )
    observe(client, queryKeys.mcps(), [mcp], async () => [mcp])

    const refresh = refreshMcpOauthConnection(client, mcp, 12)
    useAccountSourceStore.setState({ epoch: 13 })
    oauth.resolve({ ...disconnected, connected: true })
    await expect(refresh).rejects.toMatchObject({ name: "AbortError" })
    client.clear()
  })

  it("does not start requests from an obsolete account epoch", async () => {
    const client = new QueryClient()
    const fetchStatus = vi.fn(async () => disconnected)
    const fetchList = vi.fn(async () => [mcp])
    observe(client, mcpOauthQueryKey(mcp, 12), disconnected, fetchStatus)
    observe(client, queryKeys.mcps(), [mcp], fetchList)
    useAccountSourceStore.setState({ epoch: 13 })

    await expect(
      refreshMcpOauthConnection(client, mcp, 12)
    ).rejects.toMatchObject({
      name: "AbortError",
    })
    expect(fetchStatus).not.toHaveBeenCalled()
    expect(fetchList).not.toHaveBeenCalled()
    client.clear()
  })
})

describe("isMcpOauthEligible", () => {
  it.each([
    [{ ...mcp, type: 1 }, true],
    [mcp, true],
    [{ ...mcp, type: 0 }, false],
    [{ ...mcp, user_id: 8 }, false],
    [{ ...mcp, user_id: undefined }, false],
    [{ ...mcp, url: "http://mcp.example.com/mcp" }, false],
    [{ ...mcp, url: "invalid URL" }, false],
    [null, false],
  ])(
    "applies the built-in HTTPS remote MCP requirement: %j",
    (item, eligible) => {
      expect(isMcpOauthEligible(item)).toBe(eligible)
    }
  )
})
