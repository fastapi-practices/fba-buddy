import { describe, expect, it } from "vitest"

import { useComposerStore } from "@/features/chat/composer-store"
import {
  nextWorkspaceRef,
  replaceSkillDirective,
  skillDirectiveText,
  skillRefFromText,
  workspaceRefFromComposerDraft,
  workspaceRefLabel,
} from "@/features/chat/workspace-ref"

describe("nextWorkspaceRef", () => {
  it("pins a record and toggling the same one unbinds it", () => {
    expect(nextWorkspaceRef(null, "skill", 17)).toEqual({
      kind: "skill",
      id: 17,
    })
    expect(nextWorkspaceRef({ kind: "skill", id: 17 }, "skill", 17)).toBeNull()
  })

  it("replaces a different kind so only one ref is sent", () => {
    expect(
      nextWorkspaceRef({ kind: "knowledge", id: 3 }, "artifact", 8)
    ).toEqual({ kind: "artifact", id: 8 })
  })
})

describe("skillDirectiveText", () => {
  it("serializes a skill mention for Directive text", () => {
    expect(skillDirectiveText(17, "摘要")).toBe(":skill[摘要]{name=17}")
    expect(skillDirectiveText(8, "8")).toBe(":skill[8]")
  })
})

describe("replaceSkillDirective", () => {
  it("puts a skill chip at the start and replaces a previous skill", () => {
    expect(replaceSkillDirective("帮我写", 17, "摘要")).toBe(
      ":skill[摘要]{name=17} 帮我写"
    )
    expect(
      replaceSkillDirective(":skill[翻译]{name=8} 帮我写", 17, "摘要")
    ).toBe(":skill[摘要]{name=17} 帮我写")
  })
})

describe("skillRefFromText", () => {
  it("reads the last skill directive as a workspace ref", () => {
    expect(skillRefFromText("帮我写")).toBeNull()
    expect(skillRefFromText(":skill[摘要]{name=17} 帮我写")).toEqual({
      kind: "skill",
      id: 17,
    })
  })
})

describe("workspaceRefFromComposerDraft", () => {
  it("binds a skill from Directive text and unbinds when the chip is gone", () => {
    expect(
      workspaceRefFromComposerDraft(":skill[摘要]{name=17} 帮我写", null)
    ).toEqual({ kind: "skill", id: 17 })
    expect(
      workspaceRefFromComposerDraft("帮我写", { kind: "skill", id: 17 })
    ).toBeNull()
    expect(
      workspaceRefFromComposerDraft("帮我写", { kind: "knowledge", id: 3 })
    ).toEqual({ kind: "knowledge", id: 3 })
  })

  it("unbinds the skill when setDraft no longer contains Directive text", () => {
    useComposerStore.setState({
      draft: ":skill[摘要]{name=17} 帮我写",
      workspace_ref: { kind: "skill", id: 17 },
    })
    useComposerStore.getState().setDraft("帮我写")
expect(useComposerStore.getState().workspace_ref).toBeNull()
  })

  it("binds the skill when setDraft contains Directive text", () => {
    useComposerStore.setState({ draft: "", workspace_ref: null })
    useComposerStore.getState().setDraft(":skill[摘要]{name=17} 帮我写")
    expect(useComposerStore.getState().workspace_ref).toEqual({
      kind: "skill",
      id: 17,
    })
  })
})

describe("workspaceRefLabel", () => {
  it("uses the list title or name the composer chip shows", () => {
    expect(
      workspaceRefLabel(
        { kind: "skill", id: 2 },
        {
          skills: [{ id: 2, name: "摘要" }],
        }
      )
    ).toBe("摘要")
    expect(
      workspaceRefLabel(
        { kind: "knowledge", id: 4 },
        {
          knowledge: [{ id: 4, title: "规范" }],
        }
      )
    ).toBe("规范")
    expect(
      workspaceRefLabel(
        { kind: "artifact", id: 9 },
        {
          artifacts: [{ id: 9, title: "草稿" }],
        }
      )
    ).toBe("草稿")
  })
})
