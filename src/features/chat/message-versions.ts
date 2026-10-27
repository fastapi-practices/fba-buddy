import { createContext } from "react"
import type {
  getMessageVersions,
  MessageVersion,
} from "@/api/chat-interactions"

export const MessageVersionsContext = createContext<{
  load?: typeof getMessageVersions
  navigate?: (version: MessageVersion) => void | Promise<void>
  description?: string
}>({})
