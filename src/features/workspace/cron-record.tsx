import { useQuery, useQueryClient } from "@tanstack/react-query"
import { PencilIcon, PlayIcon, Trash2Icon } from "lucide-react"
import { useEffect, useState } from "react"

import {
  defaultModelForKind,
  deleteCron,
  getModelOptions,
  runCronNow,
  updateCron,
} from "@/api"
import { apiErrorMessage } from "@/api/http"
import { queryKeys } from "@/api/query-keys"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/components/ui/toast"
import { ChatPane } from "@/features/chat/ChatPane"
import { useConversationActivityStore } from "@/features/chat/conversation-activity"
import { useComposerStore } from "@/features/chat/composer-store"
import {
  cronStatus,
  displayCronTrigger,
  isCronActive,
} from "@/features/chat/conversation-cron"
import { usePrefsStore } from "@/features/shell/prefs-store"
import { useSelectionStore } from "@/features/shell/selection-store"
import { useCronWorkspaceStore } from "@/features/workspace/cron-workspace-store"
import { formatWorkspaceTime } from "@/features/workspace/workspace-records"
import { useT } from "@/hooks/use-t"
import { notifyError } from "@/lib/notify"
import { canEditOwnedResource } from "@/lib/ownership"
import type { CronItem } from "@/lib/types"

export function CronRecord({ item }: { item: CronItem }) {
  const t = useT()
  const locale = usePrefsStore((state) => state.locale)
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [conversationOverride, setConversationOverride] = useState<
    string | null
  >(null)
  const conversationId = conversationOverride ?? item.conversation_id
  const owned = canEditOwnedResource(item.user_id)
  const models = useQuery({
    queryKey: queryKeys.modelOptions(),
    queryFn: getModelOptions,
  })

  useEffect(() => {
    const markRead = () => {
      const state = useSelectionStore.getState()
      if (
        document.hasFocus() &&
        state.unreadConversationIds.includes(conversationId)
      )
        state.markConversationRead(conversationId)
    }
    markRead()
    const unsubscribe = useSelectionStore.subscribe(markRead)
    window.addEventListener("focus", markRead)
    return () => {
      unsubscribe()
      window.removeEventListener("focus", markRead)
      const composer = useComposerStore.getState()
      if (composer.editingConversationId === conversationId)
        composer.clearInput()
    }
  }, [conversationId])

  function settled() {
    void queryClient.invalidateQueries({ queryKey: queryKeys.conversations() })
    void queryClient.invalidateQueries({ queryKey: queryKeys.crons() })
    void queryClient.invalidateQueries({ queryKey: queryKeys.artifacts() })
  }

  async function mutate(action: "run" | "delete" | "status", active?: boolean) {
    if (!owned || busy) return
    setBusy(true)
    try {
      if (action === "run") {
        await runCronNow(item.id)
        setConversationOverride(null)
        useConversationActivityStore
          .getState()
          .bumpMessages(item.conversation_id)
        toast.add({ title: t("common.scheduleTriggered"), type: "success" })
      } else if (action === "delete") {
        await deleteCron(item.id)
      } else {
        await updateCron(item.id, {
          name: item.name,
          conversation_id: item.conversation_id,
          trigger: item.trigger,
          prompt: item.prompt,
          fresh_thread: Boolean(item.fresh_thread),
          provider_id: item.provider_id ?? null,
          model_id: item.model_id ?? null,
          mcp_ids: item.mcp_ids ?? [],
          status: cronStatus(Boolean(active)),
        })
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.crons() })
    } catch (error) {
      const fallback =
        action === "run"
          ? "common.couldNotRunNow"
          : action === "delete"
            ? "common.couldNotDeleteTheSchedule"
            : "common.couldNotUpdateTheSchedule"
      notifyError(apiErrorMessage(error, t(fallback)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <header
        data-cron-detail={item.id}
        className="flex shrink-0 flex-col gap-3 border-b px-6 py-4"
      >
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-base font-medium">{item.name}</h1>
              {item.last_status === "error" ? (
                <Badge variant="destructive">{t("common.failed")}</Badge>
              ) : item.last_status === "ok" ? (
                <Badge variant="secondary">{t("common.runSucceeded")}</Badge>
              ) : null}
              {!owned ? (
                <Badge variant="outline">{t("common.builtIn")}</Badge>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {displayCronTrigger(item.trigger, locale)}
              {item.last_run_time ? (
                <>
                  {" "}
                  · {t("common.lastRun")}{" "}
                  {formatWorkspaceTime(item.last_run_time, locale)}
                </>
              ) : null}
            </p>
          </div>
          {owned ? (
            <div className="flex items-center gap-2">
              <Switch
                checked={isCronActive(item.status)}
                disabled={busy}
                onCheckedChange={(checked) => void mutate("status", checked)}
                aria-label={t("common.scheduleStatus")}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={busy || !isCronActive(item.status)}
                title={
                  isCronActive(item.status)
                    ? undefined
                    : t("hints.enableTheScheduleBeforeRunningIt")
                }
                onClick={() => void mutate("run")}
              >
                <PlayIcon data-icon="inline-start" />
                {t("common.runNow")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  useCronWorkspaceStore.getState().selectRecord(item.id)
                  useCronWorkspaceStore.getState().setView("edit")
                }}
              >
                <PencilIcon data-icon="inline-start" />
                {t("common.edit")}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={busy}
                onClick={() => void mutate("delete")}
              >
                <Trash2Icon data-icon="inline-start" />
                {t("common.delete")}
              </Button>
            </div>
          ) : null}
        </div>
        {item.last_status === "error" && item.last_error ? (
          <p role="alert" className="text-sm text-destructive">
            {item.last_error}
          </p>
        ) : null}
      </header>
      <ChatPane
        conversationId={conversationId}
        providers={models.data?.providers ?? []}
        defaultModel={defaultModelForKind(models.data, "chat")}
        searchFromUrl={false}
        onConversationId={setConversationOverride}
        onSettled={settled}
      />
    </>
  )
}
