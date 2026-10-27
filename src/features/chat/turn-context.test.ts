import { describe, expect, it } from "vitest"

import {
  snapshotTurnContext,
  turnContextTags,
} from "@/features/chat/turn-context"

const LABELS = {
  chat: "对话",
  work: "工作",
  coding: "编码",
  mcp: "Plugin",
  search: "搜索",
  originIm: "即时消息",
  originCron: "定时任务",
}

describe("turnContextTags", () => {
  it("keeps Chat distinct from Work in historical turns", () => {
    expect(turnContextTags({ agent_mode: "chat" }, LABELS)).toEqual([
      { key: "mode", label: "对话" },
    ])
  })
  it("builds playback tags from the persisted turn combination", () => {
    expect(
      turnContextTags(
        {
          origin: "web",
          model_id: "gpt-5",
          agent_mode: "coding",
          mcp_ids: [1, 2],
          web_search: "tavily",
          acp_runner: true,
          acp_runner_name: "opencode",
        },
        LABELS
      )
    ).toEqual([
      { key: "mode", label: "编码" },
      { key: "model", label: "gpt-5" },
      { key: "mcp", label: "Plugin 2" },
      { key: "search", label: "搜索 tavily" },
      { key: "acp", label: "opencode" },
    ])
  })

  it("marks IM and cron origins", () => {
    expect(turnContextTags({ origin: "im" }, LABELS)[0]).toEqual({
      key: "origin",
      label: "即时消息",
    })
    expect(turnContextTags({ origin: "cron" }, LABELS)[0]).toEqual({
      key: "origin",
      label: "定时任务",
    })
  })
})

describe("snapshotTurnContext", () => {
  it("reads the native turnContext snapshot field", () => {
    expect(snapshotTurnContext({ turnContext: { model_id: "m" } })).toEqual({
      model_id: "m",
    })
  })
})
