import { translate } from "@/lib/i18n"
import { describe, expect, it } from "vitest"

import { CUSTOM_NAV_ENTRIES } from "@/features/shell/custom-nav"
import {
  CUSTOM_WORKSPACE_KINDS,
  getWorkspaceNavItem,
  isCustomWorkspaceKind,
  normalizeWorkspaceKind,
  WORKSPACE_KIND_IDS,
  WORKSPACE_NAV_ITEMS,
} from "@/features/workspace/workspace-nav"

describe("workspace-nav", () => {
  it("falls back to artifact for unknown kinds", () => {
    expect(normalizeWorkspaceKind("nope")).toBe("artifact")
    expect(normalizeWorkspaceKind(null)).toBe("artifact")
    expect(normalizeWorkspaceKind("file")).toBe("artifact")
  })

  it("keeps knowledge and skill as workspace kinds the sidebar can open", () => {
    expect(normalizeWorkspaceKind("knowledge")).toBe("knowledge")
    expect(normalizeWorkspaceKind("skill")).toBe("skill")
  })

  it("keeps the sidebar kinds the content page also reads", () => {
    expect(WORKSPACE_KIND_IDS).toEqual([
      "artifact",
      "memory",
      "knowledge",
      "skill",
      "mcp",
      "acp",
      "phrase",
      "cron",
    ])
    expect(getWorkspaceNavItem("artifact").label).toBe("common.artifacts")
    expect(getWorkspaceNavItem("memory").label).toBe("common.memory")
    expect(getWorkspaceNavItem("knowledge").label).toBe("knowledge.title")
    expect(
      translate("zh-CN", getWorkspaceNavItem("knowledge").description)
    ).toContain("自己的知识库")
    expect(getWorkspaceNavItem("skill").label).toBe("common.skills")
    expect(
      translate("zh-CN", getWorkspaceNavItem("skill").description)
    ).toContain("上传")
    expect(getWorkspaceNavItem("mcp").label).toBe("common.mcp")
    expect(getWorkspaceNavItem("phrase").label).toBe("common.quickPhrases")
    expect(getWorkspaceNavItem("cron").label).toBe("common.scheduledTasks")
    expect(WORKSPACE_NAV_ITEMS.map((item) => item.id)).toEqual([
      "knowledge",
      "skill",
      "mcp",
      "acp",
      "phrase",
      "cron",
      "artifact",
    ])
    expect(CUSTOM_WORKSPACE_KINDS).toEqual(["phrase", "skill", "mcp"])
    expect(isCustomWorkspaceKind("knowledge")).toBe(false)
    expect(isCustomWorkspaceKind("skill")).toBe(true)
    expect(isCustomWorkspaceKind("artifact")).toBe(false)
    expect(isCustomWorkspaceKind("acp")).toBe(false)
    expect(isCustomWorkspaceKind("cron")).toBe(false)
  })

  it("shows quick phrases first in the custom menu", () => {
    expect(CUSTOM_NAV_ENTRIES.map((entry) => entry.id)).toEqual([
      "phrase",
      "assistant",
      "expert",
      "skill",
      "mcp",
    ])
  })
})
