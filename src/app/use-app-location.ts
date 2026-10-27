import { useLocation } from "react-router"
import { useEffect, useRef } from "react"

import { parseAppPath, type AppLocation } from "@/app/location"
import { useSelectionStore } from "@/features/shell/selection-store"

export function useAppLocation(): AppLocation {
  const location = useLocation()
  return parseAppPath(location.pathname)
}

export function useSyncLocationToSelection() {
  const appLocation = useAppLocation()
  const location = useLocation()
  const syncedLocationKey = useRef<string | null>(null)
  useEffect(() => {
    if (appLocation.route !== "chat") {
      return
    }
    const { chatPaneKey, selectedConversationId } = useSelectionStore.getState()
    const skipStaleDraftRestore =
      syncedLocationKey.current === location.key &&
      chatPaneKey.startsWith("draft-") &&
      selectedConversationId === null &&
      Boolean(appLocation.conversationId)
    if (!skipStaleDraftRestore) {
      // 新的历史记录或书签打开已有对话，保留首条消息创建时的草稿实例
      if (
        appLocation.conversationId &&
        selectedConversationId !== appLocation.conversationId
      )
        useSelectionStore.getState().setChatPaneKey(appLocation.conversationId)
      useSelectionStore
        .getState()
        .setSelectedConversationId(appLocation.conversationId)
    }
    syncedLocationKey.current = location.key
  }, [appLocation.conversationId, appLocation.route, location.key])
}
