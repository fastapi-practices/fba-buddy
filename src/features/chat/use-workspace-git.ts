import { useCallback, useEffect, useRef, useState } from "react"
import { getConversation } from "@/api/conversations"
import { useT } from "@/hooks/use-t"
import { currentAccountSource, dataSourceKey } from "@/lib/account-source"
import { conversationProjectId } from "@/lib/conversation-workspace"
import { bindProjectConversation } from "@/lib/project-workspace"
import type { AccountSource } from "@/shared/account-source"
import type {
  WorkspaceGitDiff,
  WorkspaceGitStatus,
  WorkspaceTarget,
  WorkspaceRequest,
} from "@/shared/workspace"
import type { GitScope } from "./workspace-git-state"

export type WorkspaceGitDiffScope = "working-tree" | GitScope

export function useWorkspaceGit(
  conversationId: string | null,
  source: AccountSource | null,
  projectId?: number | null,
  chatRunning = false,
  enabled = true,
  panelOpen = enabled
) {
  const t = useT()
  const [status, setStatus] = useState<WorkspaceGitStatus | null>(null)
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState("")
  const [diffScope, setScope] = useState<WorkspaceGitDiffScope>("working-tree")
  const [aggregate, setAggregate] = useState<WorkspaceGitDiff | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [diffError, setDiffError] = useState("")
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState("")
  const statusSnapshot = useRef<WorkspaceGitStatus | null>(null)
  const scope = useRef<WorkspaceGitDiffScope>("working-tree")
  const mutationLock = useRef(false)
  const lifecycle = useRef(0)
  const statusRequest = useRef(0)
  const statusReadPending = useRef(false)
  const readingEnabled = useRef(enabled)
  const diffEnabled = useRef(panelOpen)
  const diffRequest = useRef(0)
  const previousChatRunning = useRef(chatRunning)
  const pendingChatRefresh = useRef(false)
  const backendUrl = source?.backendUrl
  const accountId = source?.accountId

  const workspaceTarget = useCallback((): WorkspaceTarget => {
    if (conversationId) return { conversationId }
    if (projectId != null) return { projectId }
    throw new Error(t("common.localWorkspaceRequired"))
  }, [conversationId, projectId, t])

  const matchesSource = useCallback(
    (sourceKey: string) => {
      const current = currentAccountSource()
      return (
        sourceKey === dataSourceKey() &&
        current?.backendUrl === backendUrl &&
        current?.accountId === accountId
      )
    },
    [backendUrl, accountId]
  )

  const reloadDiff = useCallback(async () => {
    if (
      !diffEnabled.current ||
      !statusSnapshot.current?.repository ||
      statusReadPending.current
    )
      return null
    const ticket = ++diffRequest.current
    const generation = lifecycle.current
    const sourceKey = dataSourceKey()
    const requestedScope = scope.current
    const isCurrentRequest = () =>
      ticket === diffRequest.current &&
      generation === lifecycle.current &&
      diffEnabled.current &&
      requestedScope === scope.current &&
      matchesSource(sourceKey)
    setAggregate(null)
    setDiffLoading(true)
    setDiffError("")
    try {
      if (!window.buddyDesktop?.workspace)
        throw new Error(t("common.localWorkspaceRequired"))
      if (!isCurrentRequest()) return null
      const result = await window.buddyDesktop.workspace({
        source: backendUrl && accountId ? { backendUrl, accountId } : undefined,
        action: "git-diff",
        ...workspaceTarget(),
        ...(requestedScope === "working-tree" ? {} : { scope: requestedScope }),
      })
      if (!result || !("diff" in result))
        throw new Error(t("common.gitResponseInvalid"))
      if (!isCurrentRequest()) return null
      setAggregate(result)
      return result
    } catch (cause) {
      if (isCurrentRequest())
        setDiffError(cause instanceof Error ? cause.message : String(cause))
      return null
    } finally {
      if (isCurrentRequest()) setDiffLoading(false)
    }
  }, [workspaceTarget, backendUrl, accountId, matchesSource, t])

  const setDiffScope = useCallback(
    (next: WorkspaceGitDiffScope) => {
      if (next === scope.current) return
      scope.current = next
      diffRequest.current++
      setScope(next)
      setAggregate(null)
      setDiffError("")
      setDiffLoading(false)
      void reloadDiff()
    },
    [reloadDiff]
  )

  const loadStatus = useCallback(async () => {
    const ticket = ++statusRequest.current
    const generation = lifecycle.current
    const sourceKey = dataSourceKey()
    const isCurrentRequest = () =>
      ticket === statusRequest.current &&
      generation === lifecycle.current &&
      matchesSource(sourceKey)
    statusReadPending.current = true
    setError("")
    try {
      if (!window.buddyDesktop?.workspace)
        throw new Error(t("common.localWorkspaceRequired"))
      if (!isCurrentRequest()) return
      if (conversationId) {
        const resolvedProjectId =
          projectId !== undefined
            ? projectId
            : conversationProjectId(
                await getConversation(conversationId, {
                  messageLimit: 1,
                  silent: true,
                })
              )
        if (!isCurrentRequest()) return
        await bindProjectConversation(conversationId, resolvedProjectId)
      }
      if (!isCurrentRequest()) return
      const result = await window.buddyDesktop.workspace({
        source: backendUrl && accountId ? { backendUrl, accountId } : undefined,
        action: "git-status",
        ...workspaceTarget(),
      })
      if (!result || !("entries" in result))
        throw new Error(t("common.gitResponseInvalid"))
      if (!isCurrentRequest()) return
      statusSnapshot.current = result
      setStatus(result)
      statusReadPending.current = false
      setLoading(false)
      await reloadDiff()
    } catch (cause) {
      if (isCurrentRequest())
        setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      if (isCurrentRequest()) {
        statusReadPending.current = false
        setLoading(false)
      }
    }
  }, [
    conversationId,
    projectId,
    workspaceTarget,
    backendUrl,
    accountId,
    matchesSource,
    reloadDiff,
    t,
  ])

  const refresh = useCallback(() => {
    pendingChatRefresh.current = false
    statusSnapshot.current = null
    diffRequest.current++
    setLoading(true)
    setAggregate(null)
    setDiffError("")
    setDiffLoading(false)
    return loadStatus()
  }, [loadStatus])

  const refreshIfOpen = useCallback(() => {
    if (!readingEnabled.current) return
    return refresh()
  }, [refresh])

  const mutate = useCallback(
    async (
      request: Extract<
        WorkspaceRequest,
        { action: "git-stage" | "git-unstage" | "git-commit" }
      >
    ) => {
      if (mutationLock.current) return null
      mutationLock.current = true
      const generation = lifecycle.current
      const sourceKey = dataSourceKey()
      const isCurrentRequest = () =>
        generation === lifecycle.current && matchesSource(sourceKey)
      setBusy(true)
      setActionError("")
      try {
        if (!window.buddyDesktop?.workspace)
          throw new Error(t("common.localWorkspaceRequired"))
        if (!isCurrentRequest()) return null
        const result = await window.buddyDesktop.workspace({
          ...request,
          source:
            backendUrl && accountId ? { backendUrl, accountId } : undefined,
        })
        if (
          !result ||
          (request.action === "git-commit"
            ? !("commit" in result)
            : !("entries" in result))
        )
          throw new Error(t("common.gitResponseInvalid"))
        if (!isCurrentRequest()) return null
        if (readingEnabled.current) await refresh()
        return result
      } catch (cause) {
        if (isCurrentRequest())
          setActionError(cause instanceof Error ? cause.message : String(cause))
        return null
      } finally {
        mutationLock.current = false
        if (isCurrentRequest()) setBusy(false)
      }
    },
    [backendUrl, accountId, matchesSource, refresh, t]
  )

  const changeStage = (paths: string[], targetScope: GitScope) =>
    mutate({
      action: targetScope === "unstaged" ? "git-stage" : "git-unstage",
      ...workspaceTarget(),
      paths,
    })
  const commit = (message: string) =>
    mutate({ action: "git-commit", ...workspaceTarget(), message })

  useEffect(() => {
    readingEnabled.current = enabled
    if (!enabled) return
    const statuses = statusRequest
    const diffs = diffRequest
    const pending = statusReadPending
    let active = true
    queueMicrotask(() => {
      if (active && !pending.current) void refresh()
    })
    return () => {
      active = false
      statuses.current++
      diffs.current++
      pending.current = false
    }
  }, [enabled, refresh])

  const previousPanelOpen = useRef(panelOpen)
  useEffect(() => {
    const opening = panelOpen && !previousPanelOpen.current
    previousPanelOpen.current = panelOpen
    diffEnabled.current = panelOpen
    const diffs = diffRequest
    let active = true
    if (opening && enabled)
      queueMicrotask(() => {
        if (active && !statusReadPending.current) void refresh()
      })
    return () => {
      active = false
      diffs.current++
    }
  }, [panelOpen, enabled, refresh])

  useEffect(() => {
    const generation = lifecycle
    const statuses = statusRequest
    const diffs = diffRequest
    const pending = statusReadPending
    return () => {
      generation.current++
      statuses.current++
      diffs.current++
      pending.current = false
    }
  }, [conversationId, projectId, backendUrl, accountId])

  useEffect(() => {
    if (previousChatRunning.current && !chatRunning)
      pendingChatRefresh.current = true
    previousChatRunning.current = chatRunning
    if (!enabled || !pendingChatRefresh.current || busy) return
    let active = true
    queueMicrotask(() => {
      if (!active || mutationLock.current || !pendingChatRefresh.current) return
      void refresh()
    })
    return () => {
      active = false
    }
  }, [chatRunning, busy, enabled, refresh])

  return {
    target: workspaceTarget(),
    status,
    loading,
    error,
    diffScope,
    setDiffScope,
    aggregate,
    diffLoading,
    diffError,
    reloadDiff,
    busy,
    actionError,
    refresh,
    refreshIfOpen,
    changeStage,
    commit,
    clearActionError: () => setActionError(""),
  }
}
