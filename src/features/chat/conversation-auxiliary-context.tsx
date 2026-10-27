/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, type ReactNode } from "react"

import type { ConversationPlan, InputRequest } from "@/api/chat-interactions"

type ConversationAuxiliaryValue = {
  plan: ConversationPlan | undefined
  pendingInputRequests: InputRequest[]
  removePendingInputRequest: (requestId: string) => void
}

const EMPTY_CONVERSATION_AUXILIARY: ConversationAuxiliaryValue = {
  plan: undefined,
  pendingInputRequests: [],
  removePendingInputRequest: () => {},
}

const ConversationAuxiliaryContext = createContext<ConversationAuxiliaryValue>(
  EMPTY_CONVERSATION_AUXILIARY
)

export function ConversationAuxiliaryProvider({
  value,
  children,
}: {
  value: ConversationAuxiliaryValue
  children: ReactNode
}) {
  return (
    <ConversationAuxiliaryContext value={value}>
      {children}
    </ConversationAuxiliaryContext>
  )
}

export function useConversationAuxiliary() {
  return useContext(ConversationAuxiliaryContext)
}
