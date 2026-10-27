import { beforeEach, describe, expect, it } from "vitest"

import {
  DRAFT_CHECKPOINT_KEY,
  modelCheckpointKey,
  placeModelCheckpoints,
  recordModelSwitch,
  useModelCheckpointsStore,
  type ModelCheckpoint,
} from "./model-checkpoints"

function checkpoint(id: string, afterUserCount: number): ModelCheckpoint {
  return {
    id,
    fromProviderId: 1,
    fromModelId: "gpt-5",
    fromLabel: "GPT-5",
    toProviderId: 2,
    toModelId: "claude-sonnet-4-5",
    toLabel: "Claude Sonnet 4.5",
    afterUserCount,
    createdAt: 0,
  }
}

describe("模型切换检查点", () => {
  beforeEach(() => {
    useModelCheckpointsStore.setState(
      useModelCheckpointsStore.getInitialState(),
      true
    )
  })

  it("把检查点放在对应用户回合之后", () => {
    const placement = placeModelCheckpoints(
      [checkpoint("a", 1), checkpoint("b", 2)],
      [1, 2]
    )
    expect(placement.afterTurn.get(1)?.map((item) => item.id)).toEqual(["a"])
    expect(placement.afterTurn.get(2)?.map((item) => item.id)).toEqual(["b"])
    expect(placement.trailing).toEqual([])
  })

  it("锚点回合被删掉时把检查点退到末尾", () => {
    const placement = placeModelCheckpoints([checkpoint("a", 3)], [1])
    expect(placement.afterTurn.size).toBe(0)
    expect(placement.trailing.map((item) => item.id)).toEqual(["a"])
  })

  it("没有发过消息时不留检查点", () => {
    recordModelSwitch({
      conversationId: "conversation-1",
      from: { providerId: 1, modelId: "gpt-5", label: "GPT-5" },
      to: { providerId: 2, modelId: "claude-sonnet-4-5", label: "Claude" },
      userMessageCount: 0,
    })
    expect(
      useModelCheckpointsStore.getState().byConversation["conversation-1"]
    ).toBeUndefined()
  })

  it("对话中途换模型按会话记下检查点", () => {
    recordModelSwitch({
      conversationId: "conversation-1",
      from: { providerId: 1, modelId: "gpt-5", label: "GPT-5" },
      to: { providerId: 2, modelId: "claude-sonnet-4-5", label: "Claude" },
      userMessageCount: 2,
    })
    const items =
      useModelCheckpointsStore.getState().byConversation["conversation-1"] ?? []
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      fromLabel: "GPT-5",
      toLabel: "Claude",
      afterUserCount: 2,
    })
  })

  it("会话还没拿到 id 时先记在草稿键上", () => {
    expect(modelCheckpointKey(null, "pane-1")).toBe(
      `${DRAFT_CHECKPOINT_KEY}:pane-1`
    )
    expect(modelCheckpointKey("conversation-1", "pane-1")).toBe(
      "conversation-1"
    )
  })
})
