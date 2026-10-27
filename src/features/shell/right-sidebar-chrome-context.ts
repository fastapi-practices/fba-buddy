import { createContext, type Dispatch, type SetStateAction } from "react"
import type { ChatPaneSide } from "./right-sidebar-store"

export type RightSidebarDiffAvailability = Record<
  string,
  Partial<Record<ChatPaneSide, boolean>>
>

export type RightSidebarHeaderBounds = {
  hostKey: string
  left: number
  width: number
  maximized: boolean
}

type RightSidebarChrome = {
  target: HTMLDivElement | null
  setTarget: Dispatch<SetStateAction<HTMLDivElement | null>>
  bounds: RightSidebarHeaderBounds | null
  setBounds: Dispatch<SetStateAction<RightSidebarHeaderBounds | null>>
  diffAvailability: RightSidebarDiffAvailability
  setDiffAvailability: Dispatch<SetStateAction<RightSidebarDiffAvailability>>
}

export const RightSidebarChromeContext =
  createContext<RightSidebarChrome | null>(null)
