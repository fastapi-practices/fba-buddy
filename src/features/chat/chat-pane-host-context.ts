import { createContext } from "react"

import type { ChatPaneSide } from "@/features/shell/right-sidebar-store"

export type ChatPaneHost = {
  /** 右侧边栏布局的主键 */
  hostKey: string
  /** 当前对话所在的一侧 */
  pane: ChatPaneSide
}

export const ChatPaneHostContext = createContext<ChatPaneHost | null>(null)
