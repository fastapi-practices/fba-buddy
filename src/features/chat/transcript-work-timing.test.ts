import type { ThreadMessage } from "@/features/chat/thread-types"
import { describe, expect, it } from "vitest"
import {
  formatTurnDuration,
  settleTurnElapsed,
  transcriptWorkTiming,
  turnElapsedMs,
} from "./transcript-work-timing"

const message = (timing?: Record<string, unknown>) =>
  ({ metadata: { custom: { workTiming: timing } } }) as unknown as ThreadMessage

describe("transcript work timing", () => {
  it("covers all sequential messages rather than choosing the longest sample", () => {
    const timing = transcriptWorkTiming([
      message({ startedAt: 0, endedAt: 7000, elapsedMs: 7000 }),
      message({ startedAt: 7000, endedAt: 19000, elapsedMs: 12000 }),
      message({ startedAt: 19000, endedAt: 23000, elapsedMs: 4000 }),
    ])
    expect(timing).toEqual({ startedAt: 0, elapsedMs: 23000 })
  })

  it("keeps waiting and retry gaps while repeated run timing is counted once", () => {
    expect(
      transcriptWorkTiming([
        message({
          runId: "first",
          startedAt: 1000,
          endedAt: 5000,
          elapsedMs: 4000,
        }),
        message({ runId: "next", startedAt: 7000, elapsedMs: 6000 }),
        message({ runId: "next", startedAt: 7000, elapsedMs: 6000 }),
      ])
    ).toEqual({ startedAt: 1000, elapsedMs: 12000 })
  })

  it("runs from the original start and freezes at completion", () => {
    const timing = transcriptWorkTiming([
      message({ startedAt: 1000, endedAt: 6000, elapsedMs: 5000 }),
    ])
    expect(turnElapsedMs(timing, true, 7000)).toBe(6000)
    expect(turnElapsedMs(timing, true, 11000)).toBe(10000)
    expect(turnElapsedMs(timing, false, 11000)).toBe(5000)
    expect(turnElapsedMs(timing, true, 500)).toBe(0)
  })

  it("keeps the settled duration when the turn ends after background work", () => {
    const timing = transcriptWorkTiming([
      message({ startedAt: 1000, elapsedMs: 2600 }),
    ])
    const settled = settleTurnElapsed(timing, 7600)
    expect(settled).toBe(6600)
    expect(turnElapsedMs(timing, false, 7600, settled)).toBe(6600)
    expect(turnElapsedMs(timing, true, 7600)).toBe(6600)
  })

  it("cannot settle a turn without a start timestamp", () => {
    expect(settleTurnElapsed({}, 5000)).toBeUndefined()
    expect(
      settleTurnElapsed({ startedAt: 4000 }, 3000)
    ).toBe(0)
  })

  it("preserves saved durations without inventing timestamps for historical replies", () => {
    expect(
      transcriptWorkTiming([
        message({ elapsedMs: 7000 }),
        message({ elapsedMs: 12000 }),
      ])
    ).toEqual({ elapsedMs: 12000 })
    const unknown = transcriptWorkTiming([message({ startedAt: 1000 })])
    expect(turnElapsedMs(unknown, false, 100000)).toBeUndefined()
    expect(transcriptWorkTiming([message()])).toEqual({})
  })

  it("shows the stream duration after a historical reply completes", () => {
    const completed = {
      metadata: {
        timing: {
          streamStartTime: 1000,
          totalStreamTime: 7500,
          totalChunks: 2,
          toolCallCount: 1,
        },
        custom: {
          workTiming: { runId: "run", status: "complete" },
        },
      },
    } as unknown as ThreadMessage
    expect(transcriptWorkTiming([completed])).toEqual({ elapsedMs: 7500 })
  })

  it("ignores malformed timestamps and reversed intervals", () => {
    expect(
      transcriptWorkTiming([
        message({ startedAt: NaN, endedAt: Infinity, elapsedMs: -3 }),
        message({ startedAt: "1000", endedAt: -2, elapsedMs: NaN }),
      ])
    ).toEqual({})
    expect(
      transcriptWorkTiming([message({ startedAt: 5000, endedAt: 1000 })])
    ).toEqual({ startedAt: 5000 })
  })
})

describe("turn duration labels", () => {
  it("shows precise short completions and readable long durations", () => {
    expect(formatTurnDuration(0)).toBe("1ms")
    expect(formatTurnDuration(123)).toBe("123ms")
    expect(formatTurnDuration(7500)).toBe("7.5s")
    expect(formatTurnDuration(23000)).toBe("23s")
    expect(formatTurnDuration(125000)).toBe("2m 5s")
    expect(formatTurnDuration(3660000)).toBe("1h 1m")
    expect(formatTurnDuration(90000000)).toBe("1d 1h")
  })

  it("uses whole seconds while running", () => {
    expect(formatTurnDuration(0, true)).toBe("0s")
    expect(formatTurnDuration(7500, true)).toBe("7s")
  })
})
