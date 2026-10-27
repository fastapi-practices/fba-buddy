import { describe, expect, it } from "vitest"

import {
  toChatCompletionBody,
  toChatRegenerateBody,
  toForwardedPropsApi,
} from "@/api/chat-body"

describe("toForwardedPropsApi", () => {
  it("emits camelCase keys and leaves HITL approvals off the chat contract", () => {
    const payload = toForwardedPropsApi({
      provider_id: 2,
      model_id: "openai/gpt-5",
      thinking: "high",
      mcp_ids: [3],
      web_search: "off",
      advisor_model: "anthropic/claude-sonnet-4.6",
      mcp_approve_writes: true,
      tool_policies: { write_file: "ask" },
      deferred_approvals: { call_write_1: false },
      extra_body: { openai_reasoning_effort: "low" },
      logit_bias: { "9": 1 },
    })
    expect(payload).toMatchObject({
      providerId: 2,
      modelId: "openai/gpt-5",
      thinking: "high",
      mcpIds: [3],
      webSearch: "off",
      advisorModel: "anthropic/claude-sonnet-4.6",
      mcpApproveWrites: true,
      toolPolicies: { write_file: "ask" },
      extraBody: { openai_reasoning_effort: "low" },
      logitBias: { "9": 1 },
    })
    expect(payload).not.toHaveProperty("deferredApprovals")
    expect(payload).not.toHaveProperty("provider_id")
    expect(payload).not.toHaveProperty("toolOutputMaxChars")
  })

  it("forwards the latest conversation compaction configuration", () => {
    const props = {
      provider_id: 1,
      model_id: "m",
      compaction_enabled: false,
      compaction_strategy: "summary" as const,
      compaction_keep_messages: 12,
      compaction_max_messages: 30,
    }
    expect(toForwardedPropsApi(props)).toEqual({
      providerId: 1,
      modelId: "m",
      generationType: "text",
      compactionEnabled: false,
      compactionStrategy: "summary",
      compactionKeepMessages: 12,
      compactionMaxMessages: 30,
    })
  })

  it("omits boolean off thinking and maps true onto high", () => {
    expect(
      toForwardedPropsApi({
        provider_id: 1,
        model_id: "m",
        thinking: false,
      })
    ).not.toHaveProperty("thinking")
    expect(
      toForwardedPropsApi({ provider_id: 1, model_id: "m", thinking: "off" })
        .thinking
    ).toBe("off")
    expect(
      toForwardedPropsApi({
        provider_id: 1,
        model_id: "m",
        thinking: true,
      }).thinking
    ).toBe("high")
  })

  it("sends coding mode, permission, and acp_runner", () => {
    expect(
      toForwardedPropsApi({
        provider_id: 1,
        model_id: "m",
        agent_mode: "coding",
        permission_mode: "auto",
        acp_runner: true,
        acp_runner_name: "opencode",
      })
    ).toMatchObject({
      agentMode: "coding",
      permissionMode: "auto",
      acpRunner: true,
      acpRunnerName: "opencode",
    })
    expect(
      toForwardedPropsApi({
        provider_id: 1,
        model_id: "m",
        agent_mode: "coding",
        permission_mode: "ask",
        acp_runner: false,
      })
    ).toMatchObject({
      agentMode: "coding",
      permissionMode: "ask",
      acpRunner: false,
    })
    expect(
      toForwardedPropsApi({
        provider_id: 1,
        model_id: "m",
        agent_mode: "coding",
        acp_runner: false,
        acp_runner_name: "pi",
      })
    ).not.toHaveProperty("acpRunnerName")
    expect(
      toForwardedPropsApi({
        provider_id: 1,
        model_id: "m",
        agent_mode: "work",
        permission_mode: "auto",
        acp_runner: true,
        acp_runner_name: "pi",
      })
    ).toMatchObject({
      agentMode: "work",
    })
    expect(
      toForwardedPropsApi({
        provider_id: 1,
        model_id: "m",
        agent_mode: "work",
        permission_mode: "auto",
        acp_runner: true,
        acp_runner_name: "pi",
      })
    ).not.toHaveProperty("permissionMode")
    expect(
      toForwardedPropsApi({
        provider_id: 1,
        model_id: "m",
        agent_mode: "work",
        acp_runner: true,
      })
    ).not.toHaveProperty("acpRunner")
  })

  it("does not send image generation fields on chat completions", () => {
    const payload = toForwardedPropsApi({
      provider_id: 1,
      model_id: "gpt-5.2",
      generation_type: "image",
      image_size: "1K",
      image_quality: "high",
      image_aspect_ratio: "16:9",
    })
    expect(payload.generationType).toBe("text")
    expect(payload).not.toHaveProperty("imageSize")
    expect(payload).not.toHaveProperty("imageModel")
    expect(payload).not.toHaveProperty("imageQuality")
    expect(payload).not.toHaveProperty("imageAspectRatio")
    expect(payload).not.toHaveProperty("size")
    expect(payload).not.toHaveProperty("image_size")
  })

  it("sends workspaceRef so the backend can load that record immediately", () => {
    const payload = toForwardedPropsApi({
      provider_id: 1,
      model_id: "m",
      workspace_ref: { kind: "skill", id: 17 },
    })
    expect(payload.workspaceRef).toEqual({ kind: "skill", id: 17 })
    expect(payload).not.toHaveProperty("workspace_ref")
  })

  it("sends workspaceId for coding workspace binding", () => {
    const payload = toForwardedPropsApi({
      provider_id: 1,
      model_id: "m",
      agent_mode: "coding",
      workspace_id: "task_123",
    })

    expect(payload.workspaceId).toBe("task_123")
    expect(payload).not.toHaveProperty("workspace_id")
  })
})

describe("toChatRegenerateBody", () => {
  it("omits content when regenerating the original user message", () => {
    expect(
      toChatRegenerateBody({
        threadId: "conv-1",
        forwarded_props: { provider_id: 1, model_id: "m" },
      })
    ).toEqual({
      threadId: "conv-1",
      runId: expect.any(String),
      messages: [],
      tools: [],
      context: [],
      state: {},
      forwardedProps: {
        providerId: 1,
        modelId: "m",
        generationType: "text",
      },
    })
  })

  it("sends edited user text as content", () => {
    expect(
      toChatRegenerateBody({
        threadId: "conv-1",
        forwarded_props: { provider_id: 1, model_id: "m" },
        content: "改过的问题",
      })
    ).toEqual({
      threadId: "conv-1",
      runId: expect.any(String),
      messages: [
        { id: expect.any(String), role: "user", content: "改过的问题" },
      ],
      tools: [],
      context: [],
      state: {},
      forwardedProps: {
        providerId: 1,
        modelId: "m",
        generationType: "text",
      },
    })
  })
})

describe("toChatCompletionBody", () => {
  it("sends native RunAgentInput for completions", () => {
    const body = toChatCompletionBody({
      conversation_id: "conv-1",
      messages: [{ id: "m1", role: "user", content: "hi" }],
      forwarded_props: {
        provider_id: 1,
        model_id: "m",
      },
    })
    expect(body.threadId).toBe("conv-1")
    expect(typeof body.runId).toBe("string")
    expect(body.messages).toEqual([{ id: "m1", role: "user", content: "hi" }])
    expect(body.tools).toEqual([])
    expect(body.context).toEqual([])
    expect(body.state).toEqual({})
    expect(body.forwardedProps).toMatchObject({
      providerId: 1,
      modelId: "m",
    })
    expect(body).not.toHaveProperty("conversationId")
    expect(body).not.toHaveProperty("conversation_id")
    expect(body).not.toHaveProperty("assistantId")
    expect(body).not.toHaveProperty("resume")
  })

  it("puts assistantId in forwardedProps for new conversations", () => {
    const body = toChatCompletionBody({
      conversation_id: null,
      assistant_id: 12,
      messages: [{ id: "m1", role: "user", content: "hi" }],
      forwarded_props: {
        provider_id: 1,
        model_id: "openai/gpt-5",
      },
    })
    expect(body.threadId).toMatch(/^[a-f0-9-]{36}$/)
    expect(body).not.toHaveProperty("assistantId")
    expect(body.forwardedProps).toMatchObject({
      providerId: 1,
      modelId: "openai/gpt-5",
      assistantId: 12,
    })
  })

  it("resolves accepted and declined interrupts without resending messages", () => {
    const body = toChatCompletionBody({
      conversation_id: "conv-5",
      messages: [{ id: "m5", role: "user", content: "继续" }],
      forwarded_props: {
        provider_id: 1,
        model_id: "m",
        deferred_approvals: {
          "int-call_write_1": true,
          "int-call_write_2": false,
        },
      },
    })
    expect(body.resume).toEqual([
      {
        interruptId: "int-call_write_1",
        status: "resolved",
        payload: { approved: true },
      },
      {
        interruptId: "int-call_write_2",
        status: "resolved",
        payload: { approved: false },
      },
    ])
    expect(body.messages).toEqual([])
    expect(body.forwardedProps).not.toHaveProperty("deferredApprovals")
    expect(body.forwardedProps).not.toHaveProperty("deferred_approvals")
  })

  it("keeps normal messages when there are no interrupt decisions", () => {
    const body = toChatCompletionBody({
      conversation_id: "conv-5",
      messages: [{ id: "m5", role: "user", content: "继续" }],
      forwarded_props: {
        provider_id: 1,
        model_id: "m",
        deferred_approvals: {},
      },
    })
    expect(body.messages).toEqual([{ id: "m5", role: "user", content: "继续" }])
    expect(body).not.toHaveProperty("resume")
  })
})
