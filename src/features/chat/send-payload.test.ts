import { beforeEach, describe, expect, it } from "vitest"

import { useConversationTuningStore } from "@/features/chat/conversation-tuning"
import { buildChatSendPayload } from "@/features/chat/send-payload"
import { useUserChatPrefsStore } from "@/features/settings/user-prefs"
import { toChatCompletionBody, toChatRegenerateBody } from "@/api/chat-body"
import type { ChatAttachment } from "@/lib/types"

const image: ChatAttachment = {
  id: "att-1",
  name: "shot.png",
  mime: "image/png",
  size: 12,
  data: "abc123",
  kind: "image",
}

describe("buildChatSendPayload", () => {
  beforeEach(() => {
    useUserChatPrefsStore.setState({ byUser: {} })
    useConversationTuningStore.setState({ byId: {} })
  })

  it("puts attachment records on the outgoing user message", () => {
    const payload = buildChatSendPayload({
      conversationId: "conv-1",
      messageId: "msg-1",
      text: "看这张图",
      attachments: [image],
      composer: {
        provider_id: 2,
        model_id: "demo",
        thinking: false,
        web_search: "off",
        mcp_ids: [9],
      },
    })

    expect(payload.conversation_id).toBe("conv-1")
    expect(payload.forwarded_props.mcp_ids).toEqual([9])
    expect(payload.messages[0]?.content).toEqual([
      { type: "text", text: "看这张图" },
      {
        type: "image",
        source: { type: "data", value: "abc123", mimeType: "image/png" },
        metadata: { filename: "shot.png", size: 12 },
      },
    ])
  })

  it("keeps plain text when there are no attachments", () => {
    const payload = buildChatSendPayload({
      conversationId: "conv-2",
      messageId: "msg-2",
      text: "你好",
      attachments: [],
      composer: { provider_id: 1, model_id: "m" },
    })
    expect(payload.messages[0]?.content).toBe("你好")
  })

  it("includes the current memory opt-out on an existing conversation send", () => {
    useUserChatPrefsStore.getState().setPrefs({ memory_enabled: false })
    const payload = buildChatSendPayload({
      conversationId: "conv-existing",
      messageId: "msg-memory",
      text: "继续聊",
      attachments: [],
      composer: { provider_id: 1, model_id: "m", memory_enabled: true },
    })
    expect(payload.forwarded_props.memory_enabled).toBe(false)
    expect(toChatCompletionBody(payload).forwardedProps.memoryEnabled).toBe(
      false
    )
    expect(
      toChatRegenerateBody({
        threadId: "conv-existing",
        forwarded_props: payload.forwarded_props,
      }).forwardedProps
    ).toMatchObject({ memoryEnabled: false })
  })

  it("keeps the attached workspace record id on forwarded_props", () => {
    const payload = buildChatSendPayload({
      conversationId: "conv-3",
      messageId: "msg-3",
      text: "按这个技能做",
      attachments: [],
      composer: {
        provider_id: 1,
        model_id: "m",
        workspace_ref: { kind: "knowledge", id: 17 },
      },
    })
    expect(payload.forwarded_props.workspace_ref).toEqual({
      kind: "knowledge",
      id: 17,
    })
  })

  it("takes the skill workspace ref from Directive text in the message", () => {
    const payload = buildChatSendPayload({
      conversationId: "conv-3",
      messageId: "msg-3",
      text: ":skill[摘要]{name=17} 按这个技能做",
      attachments: [],
      composer: {
        provider_id: 1,
        model_id: "m",
      },
    })
    expect(payload.forwarded_props.workspace_ref).toEqual({
      kind: "skill",
      id: 17,
    })
  })

  it("keeps chat sends on text generation even if the composer was last used for images", () => {
    const payload = buildChatSendPayload({
      conversationId: "conv-4",
      messageId: "msg-4",
      text: "继续聊",
      attachments: [],
      composer: {
        provider_id: 1,
        model_id: "m",
        generation_type: "image",
        image_size: "1K",
      },
    })
    expect(payload.forwarded_props.generation_type).toBe("text")
    expect(payload.forwarded_props.image_size).toBeUndefined()
  })

  it("puts assistant_id on the first new-conversation payload only when provided", () => {
    const payload = buildChatSendPayload({
      conversationId: "conv-new",
      assistantId: 12,
      messageId: "msg-a",
      text: "开始",
      attachments: [],
      composer: { provider_id: 1, model_id: "m" },
    })
    expect(payload.assistant_id).toBe(12)
    expect(payload.conversation_id).toBe("conv-new")
    expect(payload.forwarded_props).not.toHaveProperty("assistant_id")
    expect(payload.messages[0]?.content).toBe("开始")
  })

  it("omits assistant_id on later rounds", () => {
    const payload = buildChatSendPayload({
      conversationId: "conv-existing",
      messageId: "msg-b",
      text: "继续",
      attachments: [],
      composer: { provider_id: 1, model_id: "m" },
    })
    expect(payload.assistant_id).toBeUndefined()
  })

  it("attaches deferredApprovals when continuing a write-tool HITL round", () => {
    const payload = buildChatSendPayload({
      conversationId: "conv-5",
      messageId: "msg-5",
      text: "继续",
      attachments: [],
      composer: { provider_id: 1, model_id: "m" },
      deferredApprovals: { call_write_1: true },
    })
    expect(payload.forwarded_props.deferred_approvals).toEqual({
      call_write_1: true,
    })
  })

  it("provides only the structured quote anchor to forwarded props", () => {
    const quote = {
      messageId: "msg-source",
      conversationId: "conv-source",
      text: "需要解释的原文",
      occurrence: 2,
    }
    const payload = buildChatSendPayload({
      conversationId: "conv-quote",
      messageId: "msg-quote",
      text: "这句话是什么意思",
      attachments: [],
      composer: { provider_id: 1, model_id: "m" },
      quote,
    })

    expect(payload.context).toBeUndefined()
    expect(payload.forwarded_props.quote).toEqual(quote)
  })
})
