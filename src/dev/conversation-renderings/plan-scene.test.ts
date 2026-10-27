import { afterEach, describe, expect, it, vi } from "vitest"
import { planFromEvents } from "@/features/chat/plan-events"
import { readRichEvents } from "@/features/chat/rich-events"
import type { ChatMessage } from "@/lib/types"

afterEach(() => {
  vi.unstubAllGlobals()
})

const planStatuses = (message: ChatMessage | undefined) =>
  planFromEvents(
    readRichEvents(message?.turnContext?.lifecycle_events)
  ).map((item) => item.status)

describe("conversation rendering plan scene", () => {
  it("keeps the plan as a proposal until the user executes it", async () => {
    vi.stubGlobal("window", { location: { href: "https://preview.test/" } })
    const { scenes } = await import("./fixtures")
    const {
      applyPlaybackStep,
      buildEventPlayback,
      buildScenePlayback,
      seedPlayback,
    } = await import("./playback")
    const scene = scenes.find((item) => item.id === "plan")!
    const playback = buildScenePlayback(scene)
    const seeded = seedPlayback(playback)
    let messages = seeded.messages
    for (const step of playback.slice(seeded.cursor))
      messages = applyPlaybackStep(messages, step)

    // 提案回合结束后计划一步都没开始
    expect(planStatuses(messages.find((item) => item.id === "plan-proposal")))
      .toEqual(["pending", "pending", "pending"])

    const execution = buildEventPlayback(scene.planExecution ?? [])
    const lastPlan = execution.findLastIndex(
      (step) => step.kind === "event" && step.event.name === "buddy.planning"
    )
    const finished = execution.findIndex(
      (step) => step.kind === "event" && step.event.type === "RUN_FINISHED"
    )
    // 回合要等计划推进完才结束
    expect(finished).toBeGreaterThan(lastPlan)
    for (const step of execution) messages = applyPlaybackStep(messages, step)
    expect(planStatuses(messages.find((item) => item.id === "plan-proposal")))
      .toEqual(["completed", "completed", "completed"])
  })
})
