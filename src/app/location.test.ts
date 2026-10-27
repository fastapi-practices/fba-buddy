import { describe, expect, it } from "vitest"

import {
  appPaths,
  parseAppPath,
  pathForRoute,
  pathFromHash,
} from "@/app/location"

describe("parseAppPath", () => {
  it("defaults unknown paths to chat", () => {
    expect(parseAppPath("/")).toEqual({
      route: "chat",
      conversationId: null,
      settingsSection: "general",
      workspaceKind: "artifact",
      assistantsSection: "assistant",
    })
    expect(parseAppPath("/nope").route).toBe("chat")
  })

  it("reads chat, settings, workspace, image, channels and assistants", () => {
    expect(parseAppPath("/chat/abc-1").conversationId).toBe("abc-1")
    expect(parseAppPath("/settings/display").settingsSection).toBe("display")
    expect(parseAppPath("/settings/archived").settingsSection).toBe("archived")
    expect(parseAppPath("/settings/models").settingsSection).toBe("models")
    expect(parseAppPath("/settings/memories").settingsSection).toBe("memories")
    expect(parseAppPath("/settings/storage?source=local").settingsSection).toBe(
      "general"
    )
    expect(parseAppPath("/workspace/skill").workspaceKind).toBe("skill")
    expect(parseAppPath("/workspace/mcp").workspaceKind).toBe("mcp")
    expect(parseAppPath("/workspace/phrase").workspaceKind).toBe("phrase")
    expect(parseAppPath("/workspace/cron").workspaceKind).toBe("cron")
    expect(parseAppPath("/image").route).toBe("image")
    expect(parseAppPath("/channels").route).toBe("channels")
    expect(parseAppPath("/assistants").route).toBe("assistants")
    expect(parseAppPath("/assistants").assistantsSection).toBe("assistant")
    expect(parseAppPath("/assistants/expert").assistantsSection).toBe("expert")
  })
})

describe("pathFromHash", () => {
  it("reads the hash pathname used by the workspace router", () => {
    expect(pathFromHash("")).toBe("/")
    expect(pathFromHash("#/chat/abc-1")).toBe("/chat/abc-1")
    expect(pathFromHash("#/settings/general?x=1")).toBe("/settings/general")
  })
})

describe("pathForRoute", () => {
  it("builds shareable hash paths", () => {
    const paths = appPaths()
    expect(paths.chat("id 1")).toBe("/chat/id%201")
    expect(paths.channels()).toBe("/channels")
    expect(pathForRoute("settings", { settingsSection: "shortcuts" })).toBe(
      "/settings/shortcuts"
    )
    expect(pathForRoute("workspace", { workspaceKind: "memory" })).toBe(
      "/workspace/memory"
    )
    expect(pathForRoute("chat")).toBe("/chat")
    expect(pathForRoute("channels")).toBe("/channels")
    expect(pathForRoute("assistants")).toBe("/assistants")
    expect(pathForRoute("assistants", { assistantsSection: "expert" })).toBe(
      "/assistants/expert"
    )
  })
})
