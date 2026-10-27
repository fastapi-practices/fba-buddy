"use client"

import { currentAccountSource } from "@/lib/account-source"
import { ensureConversationOnline } from "@/features/chat/require-online"

import { useContext, useMemo, useState } from "react"
import { TurnContentContext } from "./transcript"
import {
  useChatMessageState,
  useChatRuntimeState,
} from "@/features/chat/chat-runtime"
import { FilesIcon, ChevronUpIcon } from "lucide-react"

import { FileChangeSummary } from "./file-change-summary"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { turnFileChanges } from "@/features/chat/file-changes"
import { ChatPaneHostContext } from "@/features/chat/chat-pane-host-context"
import { RightSidebarChromeContext } from "@/features/shell/right-sidebar-chrome-context"
import { useRightSidebarStore } from "@/features/shell/right-sidebar-store"
import { useT } from "@/hooks/use-t"
import { checkpointId } from "@/features/chat/checkpoint-result"
import { WorkspaceActionsContext } from "@/features/chat/workspace-actions"
import { toast } from "@/components/ui/toast"

type Changes = ReturnType<typeof turnFileChanges>

/** 打开客户端右侧边栏的 Diff 面板，客户端不可用时给出提示 */
function useOpenDiffPanel() {
  const t = useT()
  const host = useContext(ChatPaneHostContext)
  const chrome = useContext(RightSidebarChromeContext)
  return () => {
    if (host && chrome?.diffAvailability[host.hostKey]?.[host.pane]) {
      useRightSidebarStore.getState().addPanel(host.hostKey, "diff", host.pane)
      return
    }
    toast.add({ title: t("common.viewChangesClientOnly"), type: "info" })
  }
}

function ChangeDetails({ changes }: { changes: Changes }) {
  const { conversationId, backend } = useContext(WorkspaceActionsContext)
  const running = useChatRuntimeState((state) => state.thread.isRunning)
  const readOnly = useChatRuntimeState((state) => state.thread.isDisabled)
  const [undoing, setUndoing] = useState(false)
  const [undone, setUndone] = useState(false)
  const checkpoints = changes.checkpointId
    ? [changes.checkpointId]
    : [
        ...new Set(
          changes.files
            .flatMap((file) =>
              file.calls.map((call) => checkpointId(call.result))
            )
            .filter((id): id is string => !!id)
        ),
      ]
  const fullyCheckpointed =
    !!changes.checkpointId ||
    changes.files.every((file) =>
      file.calls.every((call) => checkpointId(call.result) !== null)
    )
  const undo = async () => {
    if (!ensureConversationOnline()) return
    if (
      backend !== "local" ||
      !conversationId ||
      !window.buddyDesktop?.workspace
    )
      return
    setUndoing(true)
    try {
      await window.buddyDesktop.workspace({
        source: currentAccountSource() ?? undefined,
        action: "restore-batch",
        conversationId,
        checkpointIds: checkpoints,
      })
      setUndone(true)
    } catch (cause) {
      toast.add({ title: String(cause), type: "error" })
    } finally {
      setUndoing(false)
    }
  }
  const openDiff = useOpenDiffPanel()
  return (
    <>
      <FileChangeSummary
        files={changes.files}
        totalAdditions={changes.totalAdditions}
        totalDeletions={changes.totalDeletions}
        onView={() => openDiff()}
        onUndo={
          fullyCheckpointed &&
          !readOnly &&
          checkpoints.length > 0 &&
          conversationId &&
          backend === "local" &&
          window.buddyDesktop?.workspace
            ? () => void undo()
            : undefined
        }
        undoing={undoing || running}
        undone={undone}
      />
    </>
  )
}

export function ComposerFileChanges() {
  const t = useT()
  const messages = useChatRuntimeState((state) => state.thread.messages)
  const running = useChatRuntimeState((state) => state.thread.isRunning)
  const changes = useMemo(() => turnFileChanges(messages), [messages])
  if ((!running && !changes.pending) || changes.fileCount === 0) return null

  return (
    <div data-slot="composer-file-changes" className="mb-3 flex justify-center">
      <Popover key={changes.messageId}>
        <PopoverTrigger
          openOnHover
          delay={150}
          closeDelay={200}
          render={
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="rounded-full"
            />
          }
        >
          <FilesIcon data-icon="inline-start" />
          <span>
            {changes.fileCount} {t("common.filesChanged")}
          </span>
          <span className="font-mono tabular-nums">
            <span className="text-[var(--diff-added)]">
              +{changes.totalAdditions}
            </span>{" "}
            <span className="text-[var(--diff-removed)]">
              -{changes.totalDeletions}
            </span>
          </span>
          <ChevronUpIcon data-icon="inline-end" />
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="center"
          className="max-h-80 w-80 max-w-[calc(100vw-2rem)] overflow-y-auto p-0"
        >
          <ChangeDetails key={changes.messageId} changes={changes} />
        </PopoverContent>
      </Popover>
    </div>
  )
}

export function AssistantFileChanges() {
  const messages = useChatRuntimeState((state) => state.thread.messages)
  const ownId = useChatMessageState((state) => state.message.id)
  const messageId = useContext(TurnContentContext).summaryId ?? ownId
  const running = useChatRuntimeState((state) => state.thread.isRunning)
  const changes = useMemo(
    () => turnFileChanges(messages, messageId),
    [messages, messageId]
  )
  if (
    changes.fileCount === 0 ||
    changes.messageId !== messageId ||
    changes.pending ||
    (running && messages.at(-1)?.id === messageId)
  )
    return null

  return (
    <div data-slot="assistant-file-changes" className="mt-3">
      <ChangeDetails key={changes.messageId} changes={changes} />
    </div>
  )
}
