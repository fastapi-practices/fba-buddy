import { create } from "zustand"

import { polishChat } from "@/api"
import { isAbortError } from "@/api/http"
import { parseSlashInvocation } from "@/features/chat/slash-commands"
import { useComposerStore } from "@/features/chat/composer-store"
import { useSelectionStore } from "@/features/shell/selection-store"
import { ensureAuthenticatedSession } from "@/features/auth/require-session"

export const usePolishStore = create<{ pending: boolean }>(() => ({
  pending: false,
}))

let activeRequest: AbortController | null = null

export function cancelComposerPolish() {
  const request = activeRequest
  activeRequest = null
  request?.abort()
  usePolishStore.setState({ pending: false })
}

export async function polishComposerDraft(
  text: string,
  { allowCommandRemoval = false } = {}
): Promise<string | null> {
  if (!ensureAuthenticatedSession()) return null
  if (activeRequest) return null

  const request = new AbortController()
  const composer = useComposerStore.getState()
  const draft = composer.draft
  const route = window.location.hash
  const paneKey = useSelectionStore.getState().chatPaneKey
  const conversationId = useSelectionStore.getState().selectedConversationId
  activeRequest = request
  usePolishStore.setState({ pending: true })

  try {
    const result = await polishChat(
      {
        text,
        provider_id: composer.provider_id || undefined,
        model_id: composer.model_id || undefined,
      },
      request.signal
    )
    const current = useComposerStore.getState()
    if (
      activeRequest !== request ||
      request.signal.aborted ||
      window.location.hash !== route ||
      useSelectionStore.getState().chatPaneKey !== paneKey ||
      useSelectionStore.getState().selectedConversationId !== conversationId ||
      (current.draft !== draft &&
        !(allowCommandRemoval && current.draft.trim() === text))
    ) {
      return null
    }
    const polished = result.text.trim()
    current.setDraft(polished)
    return polished
  } catch (error) {
    if (
      activeRequest !== request ||
      request.signal.aborted ||
      isAbortError(error)
    ) {
      return null
    }
    throw error
  } finally {
    if (activeRequest === request) {
      activeRequest = null
      usePolishStore.setState({ pending: false })
    }
  }
}

export function polishTextFromDraft(draft: string) {
  const text = draft.replace(/(?:^|\s)\/\s*$/, "").trim()
  const parsed = parseSlashInvocation(text, "polish")
  return parsed.draftWithoutCommand || parsed.args || text
}
