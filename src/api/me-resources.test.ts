import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  createChannel,
  generateChannelQrcode,
  listChannelBindOptions,
  pollChannelQrcode,
  createCron,
  createMyAssistant,
  createMyExpert,
  createMyKnowledgeBase,
  createMyMcp,
  importMyMcps,
  searchSkills,
  createMyQuickPhrase,
  createMySubagent,
  deleteMyAssistant,
  deleteMyExpert,
  deleteMyKnowledgeBase,
  deleteMyKnowledgeDocument,
  deleteMyMcp,
  deleteMyQuickPhrase,
  deleteMySkill,
  deleteMySubagent,
  listChannels,
  listCrons,
  updateMyAssistant,
  updateMyExpert,
  updateMyKnowledgeBase,
  cloneMyMcp,
  updateMyMcp,
  updateMyQuickPhrase,
  updateMySubagent,
  uploadMyKnowledgeDocument,
  uploadMySkill,
} from "@/api"
import { apiRequest } from "@/api/http"

vi.mock("@/lib/notify", () => ({
  notifyError: vi.fn(),
}))

function ok(data: unknown = null) {
  return new Response(JSON.stringify({ code: 200, data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}

describe("client write resources use JWT /me or user-owned paths", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ok())
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("writes assistants, experts, skills, knowledge, mcp, subagents and phrases through /me", async () => {
    await createMyAssistant({ name: "我的助手", prompt: "你好" })
    await updateMyAssistant(3, { name: "改名", prompt: "你好" })
    await deleteMyAssistant(3)
    await createMyExpert({ name: "我的专家", prompt: "角色" })
    await updateMyExpert(4, { name: "专家", prompt: "角色" })
    await deleteMyExpert(4)
    await createMyKnowledgeBase({ name: "我的知识库" })
    await updateMyKnowledgeBase(5, { name: "知识库" })
    await deleteMyKnowledgeBase(5)
    await createMyMcp({ name: "我的 MCP", type: 0, command: "npx" })
    await updateMyMcp(6, { name: "MCP", type: 0, command: "npx" })
    await deleteMyMcp(6)
    await createMySubagent({
      name: "研究员",
      description: "查资料",
      prompt: "认真查",
    })
    await updateMySubagent(7, {
      name: "研究员",
      description: "查资料",
      prompt: "认真查",
    })
    await deleteMySubagent(7)
    await createMyQuickPhrase({ title: "短语", content: "内容" })
    await updateMyQuickPhrase(8, { title: "短语", content: "改" })
    await deleteMyQuickPhrase(8)
    await deleteMySkill(9)

    const calls = vi.mocked(fetch).mock.calls.map(([input, init]) => {
      const url = String(input)
      return { url, method: String(init?.method ?? "GET") }
    })
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          url: expect.stringContaining("/assistants/me"),
          method: "POST",
        }),
        expect.objectContaining({
          url: expect.stringContaining("/assistants/me/3"),
          method: "PUT",
        }),
        expect.objectContaining({
          url: expect.stringContaining("/assistants/me/3"),
          method: "DELETE",
        }),
        expect.objectContaining({
          url: expect.stringContaining("/experts/me"),
          method: "POST",
        }),
        expect.objectContaining({
          url: expect.stringContaining("/experts/me/4"),
          method: "PUT",
        }),
        expect.objectContaining({
          url: expect.stringContaining("/experts/me/4"),
          method: "DELETE",
        }),
        expect.objectContaining({
          url: expect.stringContaining("/knowledges/me"),
          method: "POST",
        }),
        expect.objectContaining({
          url: expect.stringContaining("/knowledges/me/5"),
          method: "PUT",
        }),
        expect.objectContaining({
          url: expect.stringContaining("/knowledges/me/5"),
          method: "DELETE",
        }),
        expect.objectContaining({
          url: expect.stringContaining("/mcps/me"),
          method: "POST",
        }),
        expect.objectContaining({
          url: expect.stringContaining("/mcps/me/6"),
          method: "PUT",
        }),
        expect.objectContaining({
          url: expect.stringContaining("/mcps/me/6"),
          method: "DELETE",
        }),
        expect.objectContaining({
          url: expect.stringContaining("/subagents/me"),
          method: "POST",
        }),
        expect.objectContaining({
          url: expect.stringContaining("/subagents/me/7"),
          method: "PUT",
        }),
        expect.objectContaining({
          url: expect.stringContaining("/subagents/me/7"),
          method: "DELETE",
        }),
        expect.objectContaining({
          url: expect.stringContaining("/quick-phrases/me"),
          method: "POST",
        }),
        expect.objectContaining({
          url: expect.stringContaining("/quick-phrases/me/8"),
          method: "PUT",
        }),
        expect.objectContaining({
          url: expect.stringContaining("/skills/me/9"),
          method: "DELETE",
        }),
      ])
    )
    expect(
      calls.some((call) => /ai:(skill|assistant|mcp):add/.test(call.url))
    ).toBe(false)
  })

  it("carries an existing knowledge embedding binding without changing runtime configuration", async () => {
    const body = {
      name: "改名后的知识库",
      description: "说明",
      provider_id: 7,
      model_id: "existing-embedding",
    }
    await updateMyKnowledgeBase(5, body)
    const [url, init] = vi.mocked(fetch).mock.calls[0] ?? []
    expect(String(url)).toContain("/knowledges/me/5")
    expect(init?.method).toBe("PUT")
    expect(JSON.parse(String(init?.body))).toEqual(body)
  })

  it("clones a builtin MCP through /mcps/me/{pk}/clone", async () => {
    await cloneMyMcp(6)
    const [url, init] = vi.mocked(fetch).mock.calls[0] ?? []
    expect(String(url)).toContain("/mcps/me/6/clone")
    expect(init?.method).toBe("POST")
  })

  it("imports MCP JSON through /mcps/me/import", async () => {
    vi.mocked(fetch).mockImplementation(async () =>
      ok({ created: 1, skipped: [] })
    )
    await importMyMcps(
      '{"mcpServers":{"demo":{"url":"https://example.com/mcp"}}}'
    )
    const [url, init] = vi.mocked(fetch).mock.calls[0] ?? []
    expect(String(url)).toContain("/mcps/me/import")
    expect(init?.method).toBe("POST")
    expect(JSON.parse(String(init?.body))).toEqual({
      config: '{"mcpServers":{"demo":{"url":"https://example.com/mcp"}}}',
    })
  })

  it("searches skills through /skills/search", async () => {
    vi.mocked(fetch).mockImplementation(async () => ok([]))
    await searchSkills("周报")
    expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toContain(
      "/skills/search?q="
    )
    expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toContain(
      encodeURIComponent("周报")
    )
  })

  it("creates a user MCP with connection fields only", async () => {
    await createMyMcp({ name: "stdio", type: 0, command: "npx" })
    const init = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit
    expect(JSON.parse(String(init.body))).toEqual({
      name: "stdio",
      type: 0,
      command: "npx",
    })
    expect(JSON.parse(String(init.body))).not.toHaveProperty("is_preset")
    expect(JSON.parse(String(init.body))).not.toHaveProperty("allowed_tools")
    expect(JSON.parse(String(init.body))).not.toHaveProperty("oauth")
  })

  it("uploads skills as multipart to /skills/me", async () => {
    const file = new File(["skill"], "skill.zip", { type: "application/zip" })
    await uploadMySkill([file])
    const [url, init] = vi.mocked(fetch).mock.calls[0] ?? []
    expect(String(url)).toContain("/skills/me")
    expect(init?.method).toBe("POST")
    expect(init?.body).toBeInstanceOf(FormData)
    expect((init?.body as FormData).get("file")).toBeInstanceOf(File)
  })

  it("uploads and deletes knowledge documents through /knowledges/me", async () => {
    const file = new File(["doc"], "note.md", { type: "text/markdown" })
    await uploadMyKnowledgeDocument(12, [file])
    await deleteMyKnowledgeDocument(12, 34)
    const [uploadUrl, uploadInit] = vi.mocked(fetch).mock.calls[0] ?? []
    const [deleteUrl, deleteInit] = vi.mocked(fetch).mock.calls[1] ?? []
    expect(String(uploadUrl)).toContain("/knowledges/me/12/documents")
    expect(uploadInit?.method).toBe("POST")
    expect(uploadInit?.body).toBeInstanceOf(FormData)
    expect(String(deleteUrl)).toContain("/knowledges/me/12/documents/34")
    expect(deleteInit?.method).toBe("DELETE")
  })

  it("does not send dropped subagent tool fields", async () => {
    await createMySubagent({
      name: "研究员",
      description: "查资料",
      prompt: "认真查",
    })
    const init = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit
    expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toContain(
      "/subagents/me"
    )
    expect(JSON.parse(String(init.body))).toEqual({
      name: "研究员",
      description: "查资料",
      prompt: "认真查",
    })
    expect(JSON.parse(String(init.body))).not.toHaveProperty("allowed_tools")
    expect(JSON.parse(String(init.body))).not.toHaveProperty("max_calls")
  })

  it("reads channels and crons from /all and writes without assistant_id or enabled", async () => {
    vi.mocked(fetch).mockImplementation(async () => ok([]))
    await listChannels()
    await listCrons()
    await listChannelBindOptions()
    await generateChannelQrcode("wechat")
    await pollChannelQrcode("wechat", { session_id: "sess-1" })
    await createChannel({
      name: "飞书",
      type: "feishu",
      status: 1,
      show_thinking: true,
      show_tool_hints: true,
      config: { app_id: "cli" },
    })
    await createCron({
      name: "早报",
      conversation_id: "conv-1",
      trigger: "cron:0 9 * * *",
      prompt: "写早报",
      fresh_thread: false,
      mcp_ids: [],
      status: 1,
    })
    const bodies = vi.mocked(fetch).mock.calls.map(([, init]) => {
      if (typeof init?.body !== "string") {
        return null
      }
      return JSON.parse(init.body) as Record<string, unknown>
    })
    expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toContain(
      "/channels/all"
    )
    expect(String(vi.mocked(fetch).mock.calls[1]?.[0])).toContain("/crons/all")
    expect(String(vi.mocked(fetch).mock.calls[2]?.[0])).toContain(
      "/channels/bind-options"
    )
    expect(String(vi.mocked(fetch).mock.calls[3]?.[0])).toContain(
      "/channels/qrcode/wechat"
    )
    expect(String(vi.mocked(fetch).mock.calls[4]?.[0])).toContain(
      "/channels/qrcode/wechat/poll"
    )
    expect(bodies[4]).toEqual({ session_id: "sess-1" })
    expect(bodies[5]).toEqual({
      name: "飞书",
      type: "feishu",
      status: 1,
      show_thinking: true,
      show_tool_hints: true,
      config: { app_id: "cli" },
    })
    expect(bodies[5]).not.toHaveProperty("assistant_id")
    expect(bodies[5]).not.toHaveProperty("enabled")
    expect(bodies[6]).toEqual({
      name: "早报",
      conversation_id: "conv-1",
      trigger: "cron:0 9 * * *",
      prompt: "写早报",
      fresh_thread: false,
      mcp_ids: [],
      status: 1,
    })
    expect(bodies[6]).not.toHaveProperty("enabled")
  })
})

describe("apiRequest", () => {
  it("is imported so FormData writes still go through JWT fetch", () => {
    expect(apiRequest).toEqual(expect.any(Function))
  })
})
