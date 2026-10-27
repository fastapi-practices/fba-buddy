import { useCallback, useEffect, useRef, useState } from "react"
import { useT } from "@/hooks/use-t"
import { currentAccountSource } from "@/lib/account-source"
import type {
  WorkspaceCheckpoint,
  WorkspaceCheckpointSummary,
  WorkspaceGitDiff,
} from "@/shared/workspace"
import { checkpointGitDiff } from "./workspace-git-turns-state"

export function useWorkspaceGitTurns(conversationId?: string | null) {
  const t = useT()
  const [summaries, setSummaries] = useState<WorkspaceCheckpointSummary[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [checkpoint, setCheckpoint] = useState<WorkspaceCheckpoint | null>(null)
  const [diff, setDiff] = useState<WorkspaceGitDiff | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const listRequest = useRef(0)
  const detailRequest = useRef(0)
  useEffect(() => {
    const lists = listRequest
    const details = detailRequest
    return () => {
      lists.current++
      details.current++
    }
  }, [conversationId])

  const loadList = useCallback(async () => {
    if (!conversationId || !window.buddyDesktop?.workspace) return
    const ticket = ++listRequest.current
    setListLoading(true)
    setListError("")
    try {
      const result = await window.buddyDesktop.workspace({
        source: currentAccountSource() ?? undefined,
        action: "list-checkpoints",
        conversationId,
      })
      if (!result || !("checkpointSummaries" in result))
        throw new Error(t("common.gitResponseInvalid"))
      if (ticket === listRequest.current)
        setSummaries(
          result.checkpointSummaries
            .filter((item) => item.kind === "turn")
            .sort((left, right) =>
              right.createdAt.localeCompare(left.createdAt)
            )
        )
    } catch (cause) {
      if (ticket === listRequest.current)
        setListError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      if (ticket === listRequest.current) setListLoading(false)
    }
  }, [conversationId, t])

  const select = useCallback(
    async (id: string | null) => {
      const ticket = ++detailRequest.current
      setSelectedId(id)
      setCheckpoint(null)
      setDiff(null)
      setError("")
      setLoading(id !== null)
      if (!id || !conversationId || !window.buddyDesktop?.workspace) return
      try {
        const result = await window.buddyDesktop.workspace({
          source: currentAccountSource() ?? undefined,
          action: "checkpoint",
          conversationId,
          checkpointId: id,
        })
        if (!result || !("id" in result) || !("before" in result))
          throw new Error(t("common.gitResponseInvalid"))
        if (ticket === detailRequest.current) {
          setCheckpoint(result)
          setDiff(checkpointGitDiff(result))
        }
      } catch (cause) {
        if (ticket === detailRequest.current)
          setError(cause instanceof Error ? cause.message : String(cause))
      } finally {
        if (ticket === detailRequest.current) setLoading(false)
      }
    },
    [conversationId, t]
  )

  return {
    summaries,
    listLoading,
    listError,
    loadList,
    selectedId,
    select,
    checkpoint,
    diff,
    loading,
    error,
  }
}
