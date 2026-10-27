import { translate } from "@/lib/i18n"
import { describe, expect, it } from "vitest"

import { DEFAULT_APP_LOCATION } from "@/app/location"
import { workspaceHeaderTitle } from "@/features/shell/header-title"

describe("workspaceHeaderTitle", () => {
  it("translates fixed labels without translating custom conversation titles", () => {
    const t = (key: Parameters<typeof translate>[1]) => translate("en-US", key)
    expect(workspaceHeaderTitle(DEFAULT_APP_LOCATION, null, t)).toBe("New chat")
    expect(workspaceHeaderTitle(DEFAULT_APP_LOCATION, "设置", t)).toBe("设置")
    expect(
      workspaceHeaderTitle(DEFAULT_APP_LOCATION, "common.settings", t)
    ).toBe("common.settings")
    expect(
      workspaceHeaderTitle(
        { ...DEFAULT_APP_LOCATION, route: "settings" },
        null,
        t
      )
    ).toBe("Settings")
  })
  it("uses the conversation title, or 新对话", () => {
    expect(workspaceHeaderTitle(DEFAULT_APP_LOCATION, "周报")).toBe("周报")
    expect(workspaceHeaderTitle(DEFAULT_APP_LOCATION, "  ")).toBe("新对话")
    expect(workspaceHeaderTitle(DEFAULT_APP_LOCATION, null)).toBe("新对话")
  })

  it("uses the fixed settings big title and the current workspace, image, and assistants labels", () => {
    /* 设置页大标题固定为「设置」，分节标题由内容区承载 */
    expect(
      workspaceHeaderTitle({
        ...DEFAULT_APP_LOCATION,
        route: "settings",
        settingsSection: "shortcuts",
      })
    ).toBe("设置")
    expect(
      workspaceHeaderTitle({
        ...DEFAULT_APP_LOCATION,
        route: "settings",
        settingsSection: "display",
      })
    ).toBe("设置")
    expect(
      workspaceHeaderTitle({
        ...DEFAULT_APP_LOCATION,
        route: "workspace",
        workspaceKind: "knowledge",
      })
    ).toBe("知识库")
    expect(
      workspaceHeaderTitle({ ...DEFAULT_APP_LOCATION, route: "image" })
    ).toBe("绘画")
    expect(
      workspaceHeaderTitle({ ...DEFAULT_APP_LOCATION, route: "channels" })
    ).toBe("通道")
    expect(
      workspaceHeaderTitle({ ...DEFAULT_APP_LOCATION, route: "assistants" })
    ).toBe("助手")
    expect(
      workspaceHeaderTitle({
        ...DEFAULT_APP_LOCATION,
        route: "assistants",
        assistantsSection: "expert",
      })
    ).toBe("专家")
  })
})
