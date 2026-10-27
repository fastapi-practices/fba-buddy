import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { quotaReset } from "@/features/chat/quota-recovery"
import {
  useChatRuntime,
  useChatRuntimeState,
} from "@/features/chat/chat-runtime"
import type { ThreadMessage } from "@/features/chat/thread-types"
import { sourceStorageKey } from "@/lib/account-source"
import { useT } from "@/hooks/use-t"

export function QuotaRecovery() {
  const last = useChatRuntimeState((state) => state.thread.messages.at(-1))
  if (
    !last ||
    last.role !== "assistant" ||
    last.status?.type !== "incomplete" ||
    last.status.reason !== "error"
  )
    return null
  return <QuotaRecoveryMessage key={last.id} message={last} />
}

function QuotaRecoveryMessage({ message }: { message: ThreadMessage }) {
  const t = useT()
  const runtime = useChatRuntime()
  const running = useChatRuntimeState((state) => state.thread.isRunning)
  const [observed] = useState(Date.now)
  const [now, setNow] = useState(Date.now)
  const storageKey = sourceStorageKey(`quota-resume:${message.id}`)
  const [restoredAt] = useState<number | null>(() => {
    try {
      const saved = sessionStorage.getItem(storageKey)
      return saved && Number.isFinite(Number(saved)) ? Number(saved) : null
    } catch {
      return null
    }
  })
  const [scheduled, setScheduled] = useState(restoredAt !== null)
  const retry = useRef<HTMLButtonElement>(null)
  const status = message.status
  const quota = quotaReset(
    status?.type === "incomplete" && status.reason === "error"
      ? status.error
      : null,
    observed
  )
  const deadline = restoredAt ?? quota?.resetAt
  const limited = Boolean(quota)
  useEffect(() => {
    if (!limited || deadline == null) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [limited, deadline])
  useEffect(() => {
    if (!scheduled || deadline == null || running) return
    const timer = window.setInterval(() => {
      if (Date.now() < deadline) return
      window.clearInterval(timer)
      setScheduled(false)
      try {
        sessionStorage.removeItem(storageKey)
      } catch {
        /* 内存状态已取消 */
      }
      retry.current?.click()
    }, 1000)
    return () => window.clearInterval(timer)
  }, [scheduled, deadline, running, storageKey])
  if (!quota) return null
  const seconds =
    deadline == null ? null : Math.max(0, Math.ceil((deadline - now) / 1000))
  return (
    <div
      data-slot="quota-recovery"
      className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm"
      role="status"
    >
      <span className="flex-1">
        {seconds === null
          ? t("common.quotaResetUnknown")
          : t("common.quotaResetCountdown", {
              n: seconds,
              time: new Date(deadline!).toLocaleString(),
            })}
      </span>
      {deadline != null && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            const next = !scheduled
            setScheduled(next)
            try {
              if (next) sessionStorage.setItem(storageKey, String(deadline))
              else sessionStorage.removeItem(storageKey)
            } catch {
              /* 当前窗口继续使用内存状态 */
            }
          }}
        >
          {t(scheduled ? "common.cancelAutoResume" : "common.autoResumeQuota")}
        </Button>
      )}
      <Button
        ref={retry}
        size="sm"
        variant="ghost"
        disabled={running}
        onClick={() => void runtime.actions.reload(message.id)}
      >
        {t("common.retry")}
      </Button>
    </div>
  )
}
