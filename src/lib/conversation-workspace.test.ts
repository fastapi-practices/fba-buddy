import { describe, expect, it } from "vitest"

import {
  mergeConversationWorkspace,
  toConversationWorkspaceBody,
  workspaceFromConversation,
} from "@/lib/conversation-workspace"

describe("workspaceFromConversation", () => {
  it("reads the assistant from conversation payloads", () => {
    expect(
      workspaceFromConversation({
        project_id: 3,
        assistant_id: 12,
        goal: "写周报",
      })
    ).toEqual({
      project_id: 3,
      assistant_id: 12,
      goal: "写周报",
    })
  })
})

describe("mergeConversationWorkspace", () => {
  it("keeps the bound assistant when only the project changes", () => {
    const current = {
      project_id: 1,
      assistant_id: 12,
      goal: "写周报",
    }
    expect(mergeConversationWorkspace(current, { project_id: 4 })).toEqual({
      project_id: 4,
      assistant_id: 12,
      goal: "写周报",
    })
  })

  it("unbinds the assistant with a null assistant_id", () => {
    expect(
      mergeConversationWorkspace(
        {
          project_id: 1,
          assistant_id: 12,
          goal: null,
        },
        { assistant_id: null }
      )
    ).toEqual({
      project_id: 1,
      assistant_id: null,
      goal: null,
    })
  })
})

describe("toConversationWorkspaceBody", () => {
  it("sends every workspace field so a partial PUT cannot clear the assistant", () => {
    expect(
      toConversationWorkspaceBody({
        project_id: 4,
        assistant_id: 12,
        goal: null,
      })
    ).toEqual({
      project_id: 4,
      assistant_id: 12,
      goal: null,
    })
  })
})
