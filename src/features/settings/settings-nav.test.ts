import { describe, expect, it } from "vitest"

import {
  filterSettingsNavItems,
  getSettingsNavItem,
  normalizeSettingsSection,
} from "@/features/settings/settings-nav"

describe("settings-nav", () => {
  it("falls back to general for unknown sections", () => {
    expect(normalizeSettingsSection("nope")).toBe("general")
    expect(normalizeSettingsSection(null)).toBe("general")
    expect(normalizeSettingsSection("chat")).toBe("general")
    expect(normalizeSettingsSection("phrases")).toBe("general")
    expect(normalizeSettingsSection("providers")).toBe("general")
    expect(normalizeSettingsSection("archived")).toBe("archived")
    expect(normalizeSettingsSection("environment")).toBe("environment")
    expect(normalizeSettingsSection("worktrees")).toBe("worktrees")
    expect(normalizeSettingsSection("storage")).toBe("general")
  })

  it("returns the nav item the settings sidebar and page both read", () => {
    expect(getSettingsNavItem("shortcuts").label).toBe("common.shortcuts")
    expect(getSettingsNavItem("display").label).toBe("common.appearance")
    expect(getSettingsNavItem("assistant").label).toBe("common.aiSettings")
    expect(getSettingsNavItem("models").label).toBe("models.providerManagement")
    expect(getSettingsNavItem("general").id).toBe("general")
    expect(getSettingsNavItem("environment").label).toBe(
      "common.runtimeEnvironment"
    )
    expect(getSettingsNavItem("worktrees").label).toBe("common.worktrees")
  })

  it("filters sidebar entries by label or description", () => {
    for (const query of [
      "AI 配置",
      "AI Settings",
      "顾问模型",
      "advisor model",
    ]) {
      expect(filterSettingsNavItems(query).map((item) => item.id)).toEqual([
        "assistant",
      ])
    }
    expect(filterSettingsNavItems("主题").map((item) => item.id)).toEqual([
      "display",
    ])
    expect(filterSettingsNavItems("字号").map((item) => item.id)).toEqual([
      "display",
    ])
    expect(filterSettingsNavItems("桌面通知").map((item) => item.id)).toEqual([
      "general",
    ])
    for (const query of ["编码执行", "工具运行时", "tool runtimes"]) {
      expect(filterSettingsNavItems(query).map((item) => item.id)).toEqual([
        "environment",
      ])
    }
    for (const query of ["Worktree", "独立 Git 工作区"]) {
      expect(filterSettingsNavItems(query).map((item) => item.id)).toEqual([
        "worktrees",
      ])
    }
    expect(filterSettingsNavItems("快捷键").map((item) => item.id)).toEqual([
      "shortcuts",
    ])
    expect(filterSettingsNavItems("theme").map((item) => item.id)).toEqual([
      "display",
    ])
    expect(filterSettingsNavItems("飞书").map((item) => item.id)).toEqual([])
    expect(filterSettingsNavItems("密钥").map((item) => item.id)).toEqual([
      "models",
    ])
    expect(filterSettingsNavItems("调度").map((item) => item.id)).toEqual([])
    expect(filterSettingsNavItems("存储").map((item) => item.id)).toEqual([])
    expect(filterSettingsNavItems("").map((item) => item.id)).toEqual([
      "general",
      "display",
      "shortcuts",
      "models",
      "assistant",
      "environment",
      "worktrees",
      "memories",
      "archived",
    ])
    expect(filterSettingsNavItems("归档").map((item) => item.id)).toEqual([
      "archived",
    ])
    expect(
      filterSettingsNavItems("已归档的聊天").map((item) => item.id)
    ).toEqual(["archived"])
  })
})
