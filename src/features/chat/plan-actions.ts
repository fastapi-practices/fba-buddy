import { createContext } from "react"

export const PlanActionsContext = createContext<{
  execute: (markdown: string, newConversation: boolean) => Promise<void>
} | null>(null)
