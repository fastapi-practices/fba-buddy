"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import {
  readTranscriptView,
  writeTranscriptView,
  type TranscriptQuoteAnchor,
  type TranscriptLocation,
  type TranscriptViewState,
} from "@/features/chat/transcript-state"

type TranscriptScope = {
  conversationId?: string | null
  view: React.RefObject<TranscriptViewState>
  persist: () => void
  seeking: boolean
  beginNavigation: () => void
  finishNavigation: () => void
  onNavigateQuote?: (anchor: TranscriptQuoteAnchor) => void | Promise<void>
}

const fallbackView = { current: { expanded: {} } }
const ScopeContext = createContext<TranscriptScope>({
  view: fallbackView,
  persist: () => {},
  seeking: false,
  beginNavigation: () => {},
  finishNavigation: () => {},
})
export const TranscriptRevealContext = createContext<
  TranscriptLocation | undefined
>(undefined)

export function TranscriptScopeProvider({
  conversationId,
  children,
  onNavigateQuote,
}: {
  conversationId?: string | null
  children: ReactNode
  onNavigateQuote?: TranscriptScope["onNavigateQuote"]
}) {
  return (
    <ScopedTranscript
      key={conversationId ?? "draft"}
      conversationId={conversationId}
      onNavigateQuote={onNavigateQuote}
    >
      {children}
    </ScopedTranscript>
  )
}

function ScopedTranscript({
  conversationId,
  children,
  onNavigateQuote,
}: {
  conversationId?: string | null
  children: ReactNode
  onNavigateQuote?: TranscriptScope["onNavigateQuote"]
}) {
  const view = useRef(readTranscriptView(conversationId))
  const [seeking, setSeeking] = useState(false)
  const seekTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const beginNavigation = useCallback(() => {
    clearTimeout(seekTimer.current)
    setSeeking(true)
  }, [])
  const finishNavigation = useCallback(() => {
    clearTimeout(seekTimer.current)
    seekTimer.current = setTimeout(() => setSeeking(false), 250)
  }, [])
  useEffect(() => () => clearTimeout(seekTimer.current), [])
  const value = useMemo(
    () => ({
      conversationId,
      view,
      persist: () => writeTranscriptView(conversationId, view.current),
      seeking,
      beginNavigation,
      finishNavigation,
      onNavigateQuote,
    }),
    [
      conversationId,
      onNavigateQuote,
      seeking,
      beginNavigation,
      finishNavigation,
    ]
  )
  return <ScopeContext value={value}>{children}</ScopeContext>
}

export function useTranscriptScope() {
  return useContext(ScopeContext)
}
