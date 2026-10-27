import { beforeEach, expect, it } from "vitest"
import { dataSourceKey, useAccountSourceStore } from "@/lib/account-source"
import { useComposerStore } from "./composer-store"
import {
  conversationAgentMode,
  useConversationModeStore,
} from "./conversation-mode"
import { resolveChatForwardedProps } from "./forwarded-props"
import { buildChatSendPayload } from "./send-payload"

beforeEach(() => {
  useAccountSourceStore.setState({ account: "mode-test", epoch: 0 })
  useConversationModeStore.setState({ modes: {}, drafts: {} })
  useComposerStore.setState({
    provider_id: 1,
    model_id: "test",
    agent_mode: "work",
  })
})

it("existing conversations keep their own mode when draft preferences change", () => {
  const store = useConversationModeStore.getState()
  store.remember(dataSourceKey(), "chat-thread", "chat")
  store.remember(dataSourceKey(), "coding-thread", "coding")
  useComposerStore.getState().setAgentMode("coding")
  const composer = {
    ...useComposerStore.getState(),
    workspace_id: "workspace",
    acp_runner: true,
  }
  const chat = buildChatSendPayload({
    conversationId: "chat-thread",
    messageId: "next",
    text: "Continue",
    attachments: [],
    composer,
  })
  expect(chat.forwarded_props).toMatchObject({ agent_mode: "chat" })
  expect(chat.forwarded_props.workspace_id).toBeUndefined()
  expect(chat.forwarded_props.acp_runner).toBeUndefined()
  useComposerStore.getState().setAgentMode("work")
  expect(
    resolveChatForwardedProps(useComposerStore.getState(), {
      conversationId: "coding-thread",
      agent_mode: "chat",
    }).agent_mode
  ).toBe("coding")
  expect(
    resolveChatForwardedProps(useComposerStore.getState(), {
      conversationId: "new-thread",
    }).agent_mode
  ).toBe("work")
})

it("the same conversation id in different account sources has independent modes", () => {
  useConversationModeStore
    .getState()
    .remember(dataSourceKey(), "thread", "chat")
  useAccountSourceStore.setState({ account: "other-account" })
  expect(conversationAgentMode("thread")).toBeUndefined()
  useConversationModeStore
    .getState()
    .remember(dataSourceKey(), "thread", "coding")
  expect(conversationAgentMode("thread")).toBe("coding")
  useAccountSourceStore.setState({ account: "mode-test" })
  expect(conversationAgentMode("thread")).toBe("chat")
})
