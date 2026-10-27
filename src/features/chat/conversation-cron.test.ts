import { describe, expect, it } from "vitest"

import {
  cronEditorSchema,
  cronEditorValuesFromItem,
  cronMatchesQuery,
  cronStatus,
  cronWriteBodyFromEditor,
  cronsForConversation,
  displayCronTrigger,
  isCronActive,
  parseCronTrigger,
  resolveCronTrigger,
  type CronEditorValues,
} from "@/features/chat/conversation-cron"
import type { CronItem } from "@/lib/types"

function cron(patch: Partial<CronItem> & { id: number }): CronItem {
  return {
    name: `任务 ${patch.id}`,
    conversation_id: "c1",
    trigger: "cron:0 9 * * *",
    prompt: "提醒",
    status: 1,
    ...patch,
  }
}

function editor(patch: Partial<CronEditorValues> = {}): CronEditorValues {
  return {
    name: "",
    conversationId: "c1",
    triggerKind: "cron",
    scheduleMode: "custom",
    preset: "daily_9am",
    cronExpression: "0 9 * * *",
    intervalAmount: "1",
    intervalUnit: "hours",
    runAt: "",
    prompt: "写摘要",
    freshThread: false,
    model: "auto",
    mcpIds: [],
    active: true,
    ...patch,
  }
}

describe("conversation-cron", () => {
  it("uses status 0/1 instead of enabled", () => {
    expect(isCronActive(1)).toBe(true)
    expect(isCronActive(0)).toBe(false)
    expect(cronStatus(true)).toBe(1)
    expect(cronStatus(false)).toBe(0)
  })

  it("only lists crons for an existing conversation", () => {
    const items = [
      cron({ id: 1, conversation_id: "c1" }),
      cron({ id: 2, conversation_id: "c2" }),
    ]
    expect(cronsForConversation(items, "c1").map((item) => item.id)).toEqual([
      1,
    ])
    expect(cronsForConversation(items, null)).toEqual([])
  })

  it("filters by name, expression, prompt, or conversation title", () => {
    const item = cron({ id: 1, name: "早报", prompt: "写摘要" })
    expect(cronMatchesQuery(item, "早报")).toBe(true)
    expect(cronMatchesQuery(item, "9 *")).toBe(true)
    expect(cronMatchesQuery(item, "摘要")).toBe(true)
    expect(cronMatchesQuery(item, "周报", "周报对话")).toBe(true)
    expect(cronMatchesQuery(item, "晚报")).toBe(false)
  })

  it("parses and displays every trigger kind accepted by the backend", () => {
    expect(parseCronTrigger("0 9 * * *")).toEqual({
      kind: "cron",
      value: "0 9 * * *",
    })
    expect(parseCronTrigger("cron:0 9 * * *")).toEqual({
      kind: "cron",
      value: "0 9 * * *",
    })
    expect(parseCronTrigger("interval:3600")).toEqual({
      kind: "interval",
      value: "3600",
    })
    expect(parseCronTrigger("date:2026-10-27T09:00:00+08:00")).toEqual({
      kind: "date",
      value: "2026-10-27T09:00:00+08:00",
    })
    expect(displayCronTrigger("cron:0 9 * * *")).toBe("0 9 * * *")
    expect(displayCronTrigger("interval:3600", "en-US")).toContain("1 hour")
    expect(
      displayCronTrigger("date:2026-10-27T09:00:00+08:00", "en-US")
    ).not.toContain("date:")
  })

  it("enforces the backend name and prompt length limits", () => {
    expect(
      cronEditorSchema.safeParse(editor({ name: "x".repeat(80) })).success
    ).toBe(true)
    expect(
      cronEditorSchema.safeParse(editor({ name: "x".repeat(81) })).success
    ).toBe(false)
    expect(
      cronEditorSchema.safeParse(editor({ prompt: "x".repeat(2000) })).success
    ).toBe(true)
    expect(
      cronEditorSchema.safeParse(editor({ prompt: "x".repeat(2001) })).success
    ).toBe(false)
  })

  it("validates a custom Cron expression", () => {
    expect(
      cronEditorSchema.safeParse(editor({ cronExpression: "0 9 * *" })).success
    ).toBe(false)
  })

  it("converts fixed intervals to backend seconds", () => {
    const values = editor({
      triggerKind: "interval",
      intervalAmount: "2",
      intervalUnit: "hours",
    })
    expect(cronEditorSchema.safeParse(values).success).toBe(true)
    expect(resolveCronTrigger(values)).toBe("interval:7200")
    expect(
      cronEditorSchema.safeParse({ ...values, intervalAmount: "0" }).success
    ).toBe(false)
  })

  it("converts one-time local input to an ISO trigger", () => {
    const values = editor({
      triggerKind: "date",
      runAt: "2026-10-27T09:00:00",
    })
    expect(cronEditorSchema.safeParse(values).success).toBe(true)
    const trigger = resolveCronTrigger(values)
    expect(new Date(trigger.slice("date:".length)).getTime()).toBe(
      new Date(values.runAt).getTime()
    )
    expect(cronEditorSchema.safeParse({ ...values, runAt: "" }).success).toBe(
      false
    )
  })

  it("restores interval and one-time schedules for editing", () => {
    const interval = cronEditorValuesFromItem(
      cron({ id: 1, trigger: "interval:7200" })
    )
    expect(interval).toMatchObject({
      triggerKind: "interval",
      intervalAmount: "2",
      intervalUnit: "hours",
    })
    const date = cronEditorValuesFromItem(
      cron({ id: 2, trigger: "date:2026-10-27T09:00:00+08:00" })
    )
    expect(date.triggerKind).toBe("date")
    expect(date.runAt).not.toBe("")
  })

  it("builds a Cron write body from editor values", () => {
    const parsed = cronEditorSchema.safeParse(
      editor({
        name: " 早报 ",
        conversationId: " c1 ",
        cronExpression: " 0 9 * * * ",
        prompt: " 写摘要 ",
      })
    )
    expect(parsed.success).toBe(true)
    if (!parsed.success) {
      return
    }
    expect(resolveCronTrigger(parsed.data)).toBe("cron:0 9 * * *")
    expect(cronWriteBodyFromEditor(parsed.data)).toEqual({
      name: "早报",
      conversation_id: "c1",
      trigger: "cron:0 9 * * *",
      prompt: "写摘要",
      fresh_thread: false,
      provider_id: null,
      model_id: null,
      mcp_ids: [],
      status: 1,
    })
  })
})
