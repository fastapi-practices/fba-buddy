import type { KeyboardEvent } from "react"

import {
  eventMatchesCombo,
  resolveShortcut,
} from "@/features/shell/keyboard-shortcuts"
import { useShortcutStore } from "@/features/shell/shortcut-store"

export function handleComposerShortcutKeyDown(
  event: KeyboardEvent<HTMLTextAreaElement>
) {
  const overrides = useShortcutStore.getState().overrides
  const sendCombo = resolveShortcut("send-message", overrides)
  const isDefaultEnter =
    sendCombo != null &&
    sendCombo.key === "Enter" &&
    sendCombo.modifiers.length === 0
  if (sendCombo && eventMatchesCombo(event, sendCombo) && !isDefaultEnter) {
    event.preventDefault()
    event.currentTarget.form?.requestSubmit()
    return
  }
  const isPlainEnter =
    event.key === "Enter" &&
    !event.shiftKey &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey
  if (isPlainEnter && (!sendCombo || !isDefaultEnter)) {
    event.preventDefault()
    event.stopPropagation()
  }
}
