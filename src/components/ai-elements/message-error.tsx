"use client"

import type { FC } from "react"
import { DownloadIcon, RefreshCwIcon } from "lucide-react"

import { openSettings } from "@/app/navigation"
import { ErrorState } from "@/components/ai-elements/error-state"
import {
  errorMessageFromStatus,
  formatErrorDetail,
  hasErrorDetail,
} from "@/features/chat/message-error"
import {
  useChatMessageState,
  useChatRuntime,
  useChatRuntimeState,
} from "@/features/chat/chat-runtime"
import { canRegenerateReply } from "@/features/chat/use-chat"
import { useT } from "@/hooks/use-t"
import { codingRuntimeFromMessage } from "@/lib/execution-runtime"

export const MessageError: FC = () => {
  const t = useT()
  const chatRuntime = useChatRuntime()
  const rawError = useChatMessageState((s) => {
    const status = s.message.status
    if (status?.type !== "incomplete" || status.reason !== "error")
      return undefined
    return status.error
  })
  const messageId = useChatMessageState((s) => s.message.id)
  // 只有当前回合的最新回复可以直接重试，历史回合请在新分支中重生成
  // 只读会话（例如离线或绘画对话）不能重新生成，就不摆一个按不动的重试
  const retryable = useChatRuntimeState(
    (s) =>
      !s.thread.isDisabled &&
      canRegenerateReply(s.thread.rawMessages, messageId)
  )
  if (rawError === undefined) return null
  const message = errorMessageFromStatus(rawError)
  const runtimeToInstall = codingRuntimeFromMessage(message)
  return (
    <div className="message-error-root mt-2 w-full">
      <ErrorState
        title={message}
        detail={
          hasErrorDetail(rawError)
            ? (formatErrorDetail(rawError) ?? undefined)
            : undefined
        }
        action={
          runtimeToInstall ? (
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-full border border-red-500/20 px-3 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-500/10 dark:border-red-400/20 dark:text-red-400"
              onClick={() => openSettings("environment")}
            >
              <DownloadIcon className="size-3" />
              {t("common.goToInstallRuntime", {
                name: runtimeToInstall === "node" ? "Node.js" : "Python",
              })}
            </button>
          ) : null
        }
        retry={
          retryable ? (
            <button
              type="button"
              className="ms-auto flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-500/10 dark:text-red-400"
              onClick={() => void chatRuntime.actions.reload(messageId)}
            >
              <RefreshCwIcon className="size-3" />
              {t("common.retry")}
            </button>
          ) : null
        }
      />
    </div>
  )
}
