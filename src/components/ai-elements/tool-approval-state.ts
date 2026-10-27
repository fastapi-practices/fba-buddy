import { createContext } from "react"
import type { ToolCallMessagePart } from "@/features/chat/thread-types"

export type ToolApprovalDecision = {
  approved: boolean
  always?: boolean
  optionId?: string
}

export type ApproveTool = (
  toolCallId: string,
  approved: boolean,
  always?: boolean
) => Promise<boolean>

export const ToolApprovalResponderContext = createContext<
  ApproveTool | undefined
>(undefined)

export const toolNeedsApproval = (
  part: Pick<ToolCallMessagePart, "status" | "interrupt" | "approval">
) =>
  part.status?.type === "requires-action" ||
  part.interrupt != null ||
  (part.approval != null &&
    part.approval.approved === undefined &&
    part.approval.resolution === undefined)
