import { describe, expect, it } from "vitest"

import {
  parseSlashInvocation,
  slashApplyAction,
  slashCommandsToMentions,
  slashExecuteBody,
} from "@/features/chat/slash-commands"

describe("slashCommandsToMentions", () => {
  it("maps catalog items onto / trigger mentions", () => {
    expect(
      slashCommandsToMentions([
        {
          name: "polish",
          description: "润色输入框草稿，不落历史",
          entries: ["web"],
        },
        {
          name: "help",
          description: "列出当前入口可用指令",
          entries: ["web", "im"],
        },
      ])
    ).toEqual([
      {
        id: "polish",
        type: "slash",
        label: "/polish",
        description: "润色输入框草稿，不落历史",
        icon: "slash",
      },
      {
        id: "help",
        type: "slash",
        label: "/help",
        description: "列出当前入口可用指令",
        icon: "slash",
      },
    ])
  })
})

describe("parseSlashInvocation", () => {
  it("splits /title args from the composer draft", () => {
    expect(parseSlashInvocation("/title 周报", "title")).toEqual({
      args: "周报",
      draftWithoutCommand: "",
    })
    expect(parseSlashInvocation("草稿 /polish", "polish")).toEqual({
      args: "",
      draftWithoutCommand: "草稿",
    })
  })
})

describe("slashExecuteBody", () => {
  it("sends the remaining draft to /polish and keeps other commands arg-only", () => {
    expect(slashExecuteBody("polish", "请改得更短 /polish", "c1")).toEqual({
      command: "polish",
      conversation_id: "c1",
      args: null,
      origin: "web",
      draft: "请改得更短",
    })
    expect(slashExecuteBody("title", "/title 新标题", "c1")).toEqual({
      command: "title",
      conversation_id: "c1",
      args: "新标题",
      origin: "web",
      draft: null,
    })
  })
})

describe("slashApplyAction", () => {
  it("replaces the composer draft after polish", () => {
    expect(
      slashApplyAction(
        { command: "polish", message: "已润色", data: { draft: "更短的草稿" } },
        "c1"
      )
    ).toEqual({
      type: "polish",
      draft: "更短的草稿",
      message: "已润色",
    })
  })

  it("opens the created conversation after /new", () => {
    expect(
      slashApplyAction(
        {
          command: "new",
          message: "已新开对话",
          data: { conversation_id: "c2" },
        },
        "c1"
      )
    ).toEqual({
      type: "navigate",
      conversationId: "c2",
      message: "已新开对话",
    })
  })

  it("reloads the current conversation after retry or compact", () => {
    expect(
      slashApplyAction(
        { command: "retry", message: "已重跑", data: { conversation_id: "c1" } },
        "c1"
      )
    ).toEqual({ type: "reload", conversationId: "c1", message: "已重跑" })
  })
})
