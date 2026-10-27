import { describe, expect, it } from "vitest"

import { applyWorkspaceCommand } from "@/features/shell/workspace-commands"

describe("applyWorkspaceCommand", () => {
  it("opens a new conversation from the same helper the palette uses", () => {
    expect(applyWorkspaceCommand("new-conversation")).toEqual({
      path: "/chat",
      remountChat: true,
    })
  })

  it("opens settings from the same helper the palette uses", () => {
    expect(applyWorkspaceCommand("open-settings")).toEqual({
      path: "/settings/general",
      remountChat: false,
    })
  })

  it("opens the image generation page from the same helper the palette uses", () => {
    expect(applyWorkspaceCommand("open-image")).toEqual({
      path: "/image",
      remountChat: false,
    })
  })

  it("opens the assistants page from the same helper the palette uses", () => {
    expect(applyWorkspaceCommand("open-assistants")).toEqual({
      path: "/assistants",
      remountChat: false,
    })
  })
})
