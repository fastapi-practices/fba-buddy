export type ComposerDraftEvent = "store" | "input"

export type ComposerDraftSnapshot = {
  storeDraft: string
  inputValue: string
  lastPushed: string | null
  staleInput: string | null
}

export type ComposerDraftStep = ComposerDraftSnapshot & {
  writeStore?: string
  writeInput?: string
}

export function nextComposerDraftEvent(input: {
  prevStoreDraft: string | null
  prevInputValue: string | null
  storeDraft: string
  inputValue: string
}): ComposerDraftEvent | null {
  const firstTick =
    input.prevStoreDraft === null && input.prevInputValue === null
  if (firstTick) {
    return input.storeDraft === input.inputValue ? null : "store"
  }
  const storeChanged = input.storeDraft !== input.prevStoreDraft
  const inputChanged = input.inputValue !== input.prevInputValue
  if (!storeChanged && !inputChanged) {
    return null
  }
  return storeChanged ? "store" : "input"
}

export function stepComposerDraft(
  snapshot: ComposerDraftSnapshot,
  event: ComposerDraftEvent
): ComposerDraftStep {
  const { storeDraft, inputValue, lastPushed, staleInput } = snapshot

  if (event === "store") {
    if (storeDraft === lastPushed) {
      return snapshot
    }
    if (storeDraft === inputValue) {
      return {
        storeDraft,
        inputValue,
        lastPushed: storeDraft,
        staleInput: null,
      }
    }
    return {
      storeDraft,
      inputValue: storeDraft,
      lastPushed: storeDraft,
      staleInput: inputValue,
      writeInput: storeDraft,
    }
  }

  if (inputValue === lastPushed) {
    return { storeDraft, inputValue, lastPushed, staleInput: null }
  }
  if (
    staleInput !== null &&
    inputValue === staleInput &&
    storeDraft === lastPushed
  ) {
    return snapshot
  }
  if (inputValue === storeDraft) {
    return { storeDraft, inputValue, lastPushed, staleInput: null }
  }
  return {
    storeDraft: inputValue,
    inputValue,
    lastPushed,
    staleInput: null,
    writeStore: inputValue,
  }
}
