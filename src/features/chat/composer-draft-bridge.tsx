import { useEffect, useRef } from "react"
import { useChatRuntime } from "@/features/chat/chat-runtime"
import { useComposerStore } from "@/features/chat/composer-store"
import {
  nextComposerDraftEvent,
  stepComposerDraft,
} from "@/features/chat/composer-draft"

export function ComposerDraftBridge() {
  const draft = useComposerStore((state) => state.draft)
  const setDraft = useComposerStore((state) => state.setDraft)
  const runtime = useChatRuntime()
  const value = runtime.composer.text
  const setText = runtime.composer.setText
  const setTextRef = useRef(setText)
  const lastPushed = useRef<string | null>(null)
  const staleInput = useRef<string | null>(null)
  const prevDraft = useRef<string | null>(null)
  const prevValue = useRef<string | null>(null)

  useEffect(() => {
    setTextRef.current = setText
  }, [setText])

  useEffect(() => {
    const event = nextComposerDraftEvent({
      prevStoreDraft: prevDraft.current,
      prevInputValue: prevValue.current,
      storeDraft: draft,
      inputValue: value,
    })
    prevDraft.current = draft
    prevValue.current = value
    if (!event) return

    const next = stepComposerDraft(
      {
        storeDraft: draft,
        inputValue: value,
        lastPushed: lastPushed.current,
        staleInput: staleInput.current,
      },
      event
    )
    lastPushed.current = next.lastPushed
    staleInput.current = next.staleInput
    if (next.writeInput !== undefined) setTextRef.current(next.writeInput)
    if (next.writeStore !== undefined) setDraft(next.writeStore)
  }, [draft, value, setDraft])

  return null
}
