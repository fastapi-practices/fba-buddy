import { afterEach, describe, expect, it, vi } from "vitest"
import { readRichEvents } from "@/features/chat/rich-events"
import type { ChatMessage } from "@/lib/types"

afterEach(() => {
  vi.unstubAllGlobals()
})

const subagentStatus = (message: ChatMessage | undefined, taskId: string) =>
  readRichEvents(message?.turnContext?.lifecycle_events).find(
    (event) => event.name === "buddy.subagent" && event.value.task_id === taskId
  )?.value.status

describe("conversation rendering background follow up", () => {
  it("completes the running background subagent after the main reply", async () => {
    vi.stubGlobal("window", { location: { href: "https://preview.test/" } })
    const { scenes } = await import("./fixtures")
    const {
      applyPlaybackStep,
      buildEventPlayback,
      buildScenePlayback,
      seedPlayback,
    } = await import("./playback")
    const scene = scenes.find((item) => item.id === "subagent")!
    const playback = buildScenePlayback(scene)
    const seeded = seedPlayback(playback)
    let messages = seeded.messages
    for (const step of playback.slice(seeded.cursor))
      messages = applyPlaybackStep(messages, step)

    const workMessage = () =>
      messages.find((item) => item.id === "subagent-work")
    // 主回复结束时子代理还在跑
    expect(subagentStatus(workMessage(), "agent-layout-check")).toBe("running")

    const followUp = scene.backgroundFollowUp!
    expect(followUp.delay).toBeGreaterThan(0)
    for (const step of buildEventPlayback(followUp.events))
      messages = applyPlaybackStep(messages, step)

    expect(subagentStatus(workMessage(), "agent-layout-check")).toBe("completed")
  })
})
