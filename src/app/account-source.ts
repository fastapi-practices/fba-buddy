import { appNavigate } from "@/app/navigation"
import { clearConversationLoads } from "@/api/conversations"
import { useComposerStore } from "@/features/chat/composer-store"
import { useConversationActivityStore } from "@/features/chat/conversation-activity"
import { useConversationTuningStore } from "@/features/chat/conversation-tuning"
import { useImageStore } from "@/features/image/image-store"
import { useSelectionStore } from "@/features/shell/selection-store"
import { useRightSidebarStore } from "@/features/shell/right-sidebar-store"
import { cancelComposerPolish } from "@/features/chat/composer-polish"
import { useSessionStore } from "@/lib/session"
import { useHistoryCacheStatusStore } from "@/lib/history-cache-status"
import {
  beginDataSourceChange,
  pauseSourcePersistence,
  useAccountSourceStore,
} from "@/lib/account-source"

export async function resetAccountState() {
  clearConversationLoads()
  useHistoryCacheStatusStore.setState({ offline: false, cachedAt: null })
  cancelComposerPolish()
  pauseSourcePersistence(true)
  try {
    useSelectionStore.setState(useSelectionStore.getInitialState(), true)
    useRightSidebarStore.setState(useRightSidebarStore.getInitialState(), true)
    useComposerStore.setState(useComposerStore.getInitialState(), true)
    useImageStore.setState(useImageStore.getInitialState(), true)
    useConversationTuningStore.setState(
      useConversationTuningStore.getInitialState(),
      true
    )
    useConversationActivityStore.setState(
      useConversationActivityStore.getInitialState(),
      true
    )
    await Promise.all([
      useSelectionStore.persist.rehydrate(),
      useRightSidebarStore.persist.rehydrate(),
      useComposerStore.persist.rehydrate(),
      useImageStore.persist.rehydrate(),
      useConversationTuningStore.persist.rehydrate(),
    ])
  } finally {
    pauseSourcePersistence(false)
  }
}

let initialization: Promise<void> | undefined
let sessionBound = false
let accountRevision = 0

export async function synchronizeAccount() {
  const account = String(useSessionStore.getState().user?.id ?? "anonymous")
  const current = useAccountSourceStore.getState()
  if (current.account === account) return
  if (!current.ready && !sessionBound) {
    useAccountSourceStore.setState({ account })
    return
  }
  const revision = ++accountRevision
  const selection = useSelectionStore.getState()
  const guestDraft =
    current.account === "anonymous" &&
    !selection.selectedConversationId &&
    !selection.sidebarConversationId &&
    useComposerStore.getState().attachments.length === 0
      ? useComposerStore.getState().draft
      : null
  beginDataSourceChange()
  useAccountSourceStore.setState({ account })
  if (typeof window !== "undefined") window.location.hash = "/chat"
  await resetAccountState()
  if (revision === accountRevision) {
    if (guestDraft !== null) useComposerStore.getState().setDraft(guestDraft)
    useAccountSourceStore.setState({ ready: true })
    appNavigate("/chat", { replace: true })
  }
}

export function initializeAccountSource() {
  if (initialization) return initialization
  initialization = (async () => {
    if (!useSessionStore.persist.hasHydrated())
      await new Promise<void>((resolve) => {
        const unsubscribe = useSessionStore.persist.onFinishHydration(() => {
          unsubscribe()
          resolve()
        })
        if (useSessionStore.persist.hasHydrated()) {
          unsubscribe()
          resolve()
        }
      })
    await synchronizeAccount()
    if (!sessionBound) {
      sessionBound = true
      useSessionStore.subscribe((next, previous) => {
        if (next.user?.id !== previous.user?.id)
          void synchronizeAccount().catch((error: unknown) => {
            useAccountSourceStore.setState({
              error: error instanceof Error ? error.message : "无法切换账号",
            })
          })
      })
    }
    await resetAccountState()
    useAccountSourceStore.setState({ ready: true, error: null })
  })().catch((error: unknown) => {
    initialization = undefined
    useAccountSourceStore.setState({
      error: error instanceof Error ? error.message : "无法读取账号状态",
    })
  })
  return initialization
}
