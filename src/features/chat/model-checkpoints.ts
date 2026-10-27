import { create } from "zustand"
import { sourceStorage } from "@/lib/account-source"
import { createJSONStorage, persist } from "zustand/middleware"
import type { ProviderOption } from "@/lib/types"

/**
 * 模型切换检查点：对话中途换模型时留下的标记，
 * 标出换模型的位置，提醒上下文缓存会失效
 */
export type ModelCheckpoint = {
  id: string
  fromProviderId: number
  fromModelId: string
  fromLabel: string
  toProviderId: number
  toModelId: string
  toLabel: string
  /** 标记落在第几条用户消息开启的回合之后 */
  afterUserCount: number
  createdAt: number
}

type ModelCheckpointState = {
  byConversation: Record<string, ModelCheckpoint[]>
  record: (key: string, checkpoint: ModelCheckpoint) => void
  adopt: (conversationId: string, draftKey: string) => void
  clear: (key: string) => void
}

/** 会话还没拿到 id 时，先记在草稿键上，会话建立后并入正式会话 */
export const DRAFT_CHECKPOINT_KEY = "draft"

export function modelCheckpointKey(
  conversationId: string | null | undefined,
  draftKey?: string | null
): string {
  const id = conversationId?.trim()
  if (id) return id
  return draftKey?.trim()
    ? `${DRAFT_CHECKPOINT_KEY}:${draftKey.trim()}`
    : DRAFT_CHECKPOINT_KEY
}

export const useModelCheckpointsStore = create<ModelCheckpointState>()(
  persist(
    (set) => ({
      byConversation: {},
      record: (key, checkpoint) =>
        set((state) => ({
          byConversation: {
            ...state.byConversation,
            [key]: [...(state.byConversation[key] ?? []), checkpoint],
          },
        })),
      adopt: (conversationId, draftKey) =>
        set((state) => {
          const draft = state.byConversation[draftKey]
          if (!draft?.length) return state
          const next = { ...state.byConversation }
          next[conversationId] = [...(next[conversationId] ?? []), ...draft]
          delete next[draftKey]
          return { byConversation: next }
        }),
      clear: (key) =>
        set((state) => {
          if (!state.byConversation[key]) return state
          const next = { ...state.byConversation }
          delete next[key]
          return { byConversation: next }
        }),
    }),
    {
      name: "fba-buddy.model-checkpoints",
      storage: createJSONStorage(() => sourceStorage),
      partialize: (state) => ({ byConversation: state.byConversation }),
    }
  )
)

const EMPTY: ModelCheckpoint[] = []

export function useModelCheckpoints(
  conversationId: string | null | undefined
): ModelCheckpoint[] {
  return useModelCheckpointsStore((state) =>
    conversationId ? (state.byConversation[conversationId] ?? EMPTY) : EMPTY
  )
}

/** 会话 id 落定后，把草稿期间记下的检查点并入这个会话 */
export function adoptModelCheckpoints(
  conversationId: string,
  draftKey: string
) {
  useModelCheckpointsStore.getState().adopt(conversationId, draftKey)
}

export function clearModelCheckpoints(key: string) {
  useModelCheckpointsStore.getState().clear(key)
}

/**
 * 记一次模型切换：还没有发过消息不算对话中途切换，不留标记
 */
export function recordModelSwitch(input: {
  conversationId: string | null | undefined
  draftKey?: string | null
  from: { providerId: number; modelId: string; label: string }
  to: { providerId: number; modelId: string; label: string }
  userMessageCount: number
}) {
  if (input.userMessageCount <= 0) return
  const key = modelCheckpointKey(input.conversationId, input.draftKey)
  useModelCheckpointsStore.getState().record(key, {
    id: crypto.randomUUID(),
    fromProviderId: input.from.providerId,
    fromModelId: input.from.modelId,
    fromLabel: input.from.label,
    toProviderId: input.to.providerId,
    toModelId: input.to.modelId,
    toLabel: input.to.label,
    afterUserCount: input.userMessageCount,
    createdAt: Date.now(),
  })
}

/**
 * 检查点的落位：按第几条用户消息的回合分组，
 * 锚点回合不存在时退到末尾，标记不会凭空消失
 */
export function placeModelCheckpoints(
  checkpoints: readonly ModelCheckpoint[],
  turnOrdinals: readonly number[]
): { afterTurn: Map<number, ModelCheckpoint[]>; trailing: ModelCheckpoint[] } {
  const userCount = turnOrdinals.length
    ? Math.max(...turnOrdinals)
    : 0
  const afterTurn = new Map<number, ModelCheckpoint[]>()
  const trailing: ModelCheckpoint[] = []
  for (const checkpoint of checkpoints) {
    if (
      checkpoint.afterUserCount > 0 &&
      checkpoint.afterUserCount <= userCount
    ) {
      const items = afterTurn.get(checkpoint.afterUserCount) ?? []
      items.push(checkpoint)
      afterTurn.set(checkpoint.afterUserCount, items)
      continue
    }
    trailing.push(checkpoint)
  }
  return { afterTurn, trailing }
}

/** 模型在选择器里的显示名，供应商与模型都找不到时退回模型 id */
export function modelCheckpointLabel(
  providers: readonly ProviderOption[],
  providerId: number,
  modelId: string
): string {
  const provider = providers.find((item) => item.id === providerId)
  const model = provider?.models.find((item) => item.model_id === modelId)
  return model?.name?.trim() || modelId
}
