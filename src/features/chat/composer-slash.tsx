import { translateCurrent } from "@/lib/i18n"
import { useMemo } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { TerminalIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/toast"
import { executeSlash, listSlashCommands } from "@/api"
import { apiErrorMessage } from "@/api/http"
import { queryKeys } from "@/api/query-keys"
import { adoptCreatedConversation } from "@/app/navigation"
import {
  polishComposerDraft,
  polishTextFromDraft,
  usePolishStore,
} from "@/features/chat/composer-polish"
import { useComposerStore } from "@/features/chat/composer-store"
import {
  slashApplyAction,
  slashExecuteBody,
} from "@/features/chat/slash-commands"
import { useConversationActivityStore } from "@/features/chat/conversation-activity"
import { useChatRuntime } from "@/features/chat/chat-runtime"
import { useSelectionStore } from "@/features/shell/selection-store"
import { useT } from "@/hooks/use-t"
import { translate } from "@/lib/i18n"
import { getLocale } from "@/lib/runtime"

export function ComposerSlash() {
  const t = useT()
  const runtime = useChatRuntime()
  const queryClient = useQueryClient()
  const catalogQuery = useQuery({
    queryKey: queryKeys.slashCommands(),
    queryFn: () => listSlashCommands("web"),
  })
  const commands = useMemo(() => catalogQuery.data ?? [], [catalogQuery.data])
  const match = runtime.composer.text.match(/(?:^|\s)\/([^\s]*)$/)
  const query = match?.[1] ?? ""
  const filtered = commands.filter(
    (command) =>
      !query ||
      command.name.toLowerCase().includes(query.toLowerCase()) ||
      command.description?.toLowerCase().includes(query.toLowerCase())
  )
  if (!match) return null
  return (
    <div
      data-slot="composer-trigger-popover"
      className="composer-trigger-popover absolute -inset-x-px bottom-full z-50 mb-2 overflow-hidden rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg"
    >
      <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
        <TerminalIcon className="size-3.5" />
        Slash commands
      </div>
      <div className="max-h-64 overflow-y-auto">
        {catalogQuery.isLoading ? (
          <p className="px-2 py-2 text-sm text-muted-foreground">
            {t("common.loading")}
          </p>
        ) : filtered.length === 0 ? (
          <p className="px-2 py-2 text-sm text-muted-foreground">
            {commands.length === 0
              ? t("common.noSlashCommands")
              : t("common.noMatchingSlashCommands")}
          </p>
        ) : (
          filtered.map((command) => (
            <Button
              key={command.name}
              type="button"
              variant="ghost"
              className="h-auto w-full justify-start gap-2 rounded-lg px-2 py-1.5 text-start"
              onClick={() => {
                const text = runtime.composer.text
                const start = match.index ?? 0
                const prefix = text.slice(0, start).trimEnd()
                runtime.composer.setText(prefix)
                void runSlashCommand(command.name, queryClient, text)
              }}
            >
              <TerminalIcon className="size-3.5" />
              <span className="font-mono">/{command.name}</span>
              {command.description ? (
                <span className="truncate text-xs text-muted-foreground">
                  {command.description}
                </span>
              ) : null}
            </Button>
          ))
        )}
      </div>
    </div>
  )
}

async function runSlashCommand(
  command: string,
  queryClient: ReturnType<typeof useQueryClient>,
  originalDraft: string
) {
  const conversationId = useSelectionStore.getState().selectedConversationId
  if (command === "polish") {
    if (usePolishStore.getState().pending) return
    const locale = getLocale()
    const text = polishTextFromDraft(originalDraft)
    if (!text) {
      toast.add({
        title: translate(locale, "common.enterTextToPolishFirst"),
        type: "error",
      })
      return
    }
    try {
      const result = await polishComposerDraft(text, {
        allowCommandRemoval: true,
      })
      if (result !== null) {
        toast.add({
          title: translate(locale, "common.draftPolishedNotSavedToHistory"),
          type: "success",
        })
      }
    } catch (error) {
      toast.add({
        title: apiErrorMessage(
          error,
          translateCurrent("common.couldNotPolish")
        ),
        type: "error",
      })
    }
    return
  }
  const result = await executeSlash(
    slashExecuteBody(command, originalDraft, conversationId)
  )
  const action = slashApplyAction(result, conversationId)
  if (action.type === "polish") {
    useComposerStore.getState().setDraft(action.draft)
    toast.add({ title: action.message, type: "success" })
    return
  }
  if (action.type === "navigate") {
    adoptCreatedConversation(action.conversationId)
    void queryClient.invalidateQueries({ queryKey: queryKeys.conversations() })
    toast.add({ title: action.message, type: "success" })
    return
  }
  if (action.type === "title" && conversationId) {
    useConversationActivityStore.getState().bumpMessages(conversationId)
    void queryClient.invalidateQueries({ queryKey: queryKeys.conversations() })
    toast.add({ title: action.message, type: "success" })
    return
  }
  if (action.type === "reload") {
    useConversationActivityStore.getState().bumpMessages(action.conversationId)
    void queryClient.invalidateQueries({ queryKey: queryKeys.conversations() })
  }
  toast.add({ title: action.message, type: "success" })
}
