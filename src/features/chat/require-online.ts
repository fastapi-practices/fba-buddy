import { useHistoryCacheStatusStore } from "@/lib/history-cache-status"
import { translateCurrent } from "@/lib/i18n"
import { notifyError } from "@/lib/notify"

export function ensureConversationOnline() {
  if (!useHistoryCacheStatusStore.getState().offline) return true
  notifyError(translateCurrent("common.historyOfflineReadOnly"))
  return false
}
