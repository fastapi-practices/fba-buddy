import type { ChatMessage } from "@/lib/types"
import { isPersistedMessagePk } from "./message-pk"

export type BranchPlan = {
  /** 被点击的那条消息 */
  source: ChatMessage
  /** 重生成时要在新分支里重跑的那条提问 */
  user: ChatMessage | null
  /** 传给 /conversations/{id}/fork 的 message_id */
  boundaryPk: number
}

/**
 * 后端重生成只接受最后一条用户消息，历史回复不能直接重生成。
 * 历史回复必须先分叉出新分支，让那条历史提问成为新分支里的最后一条用户消息，
 * 再对新分支里的它重生成，这样后端约束才成立。
 */
export function planBranch(
  messages: ChatMessage[],
  pk: number,
  options: { regenerate?: boolean } = {}
): BranchPlan | null {
  const index = messages.findIndex((item) => item.pk === pk)
  const source = index >= 0 ? messages[index] : undefined
  if (!source || !isPersistedMessagePk(source.pk)) return null
  if (!options.regenerate || source.role !== "assistant") {
    // 只新建分支时直接从这条消息分叉
    return { source, user: null, boundaryPk: source.pk }
  }
  const user = [...messages.slice(0, index)]
    .reverse()
    .find((item) => item.role === "user")
  if (!user || !isPersistedMessagePk(user.pk)) return null
  return { source, user, boundaryPk: user.pk }
}
