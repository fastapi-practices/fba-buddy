import { describe, expect, it } from "vitest"

import { cronEditorValuesFromExample } from "@/features/workspace/cron-examples"

describe("cron examples", () => {
  it("fills the new scheduled task editor from an example", () => {
    expect(
      cronEditorValuesFromExample(
        {
          name: "Repository health",
          trigger: "cron:0 9 * * 1-5",
          prompt: "Review the repository health",
          fresh_thread: true,
        },
        "chat-1"
      )
    ).toEqual({
      name: "Repository health",
      conversationId: "chat-1",
      triggerKind: "cron",
      scheduleMode: "preset",
      preset: "weekday_9am",
      cronExpression: "0 9 * * 1-5",
      intervalAmount: "1",
      intervalUnit: "hours",
      runAt: "",
      prompt: "Review the repository health",
      freshThread: true,
      model: "auto",
      mcpIds: [],
      active: true,
    })
  })
})
