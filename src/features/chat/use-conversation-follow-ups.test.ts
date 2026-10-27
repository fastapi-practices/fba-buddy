import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ChatSubmission } from "@/features/chat/thread-types"
import { useConversationFollowUps } from "./use-conversation-follow-ups"
import {
  removeConversationFollowUp,
  submitConversationFollowUp,
} from "@/api/follow-ups"

const harness = vi.hoisted(() => ({
  states: [] as unknown[],
  refs: [] as { current: unknown }[],
  memos: [] as { deps: unknown[]; value: unknown }[],
  effects: [] as (() => void | (() => void))[],
  s: 0,
  r: 0,
  m: 0,
  data: { items: [] } as { items: unknown[] },
}))
const queryClient = vi.hoisted(() => ({
  invalidateQueries: vi.fn(async () => {}),
}))
vi.mock("react", async (original) => {
  const real = await original<typeof import("react")>()
  return {
    ...real,
    useState: (initial: unknown) => {
      const i = harness.s++
      if (i >= harness.states.length)
        harness.states[i] = typeof initial === "function" ? initial() : initial
      return [
        harness.states[i],
        (next: unknown) => {
          harness.states[i] =
            typeof next === "function" ? next(harness.states[i]) : next
        },
      ]
    },
    useRef: (initial: unknown) =>
      (harness.refs[harness.r++] ??= { current: initial }),
    useMemo: (factory: () => unknown, deps: unknown[]) => {
      const i = harness.m++
      const previous = harness.memos[i]
      if (!previous || deps.some((dep, j) => dep !== previous.deps[j]))
        harness.memos[i] = { deps, value: factory() }
      return harness.memos[i]!.value
    },
    useCallback: (callback: unknown, deps: unknown[]) => {
      const i = harness.m++
      const previous = harness.memos[i]
      if (!previous || deps.some((dep, j) => dep !== previous.deps[j]))
        harness.memos[i] = { deps, value: callback }
      return harness.memos[i]!.value
    },
    useEffect: (effect: () => void) => {
      harness.effects.push(effect)
    },
    useLayoutEffect: (effect: () => void) => {
      harness.effects.push(effect)
    },
    useSyncExternalStore: (_subscribe: unknown, get: () => unknown) => get(),
  }
})
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: harness.data }),
  queryOptions: (options: unknown) => options,
  useQueryClient: () => ({
    invalidateQueries: queryClient.invalidateQueries,
    setQueryData: (
      _key: unknown,
      update: (value: unknown) => typeof harness.data
    ) => {
      harness.data = update(harness.data)
    },
  }),
}))
vi.mock("@/api/follow-ups", () => ({
  listConversationFollowUps: vi.fn(),
  submitConversationFollowUp: vi.fn(),
  updateConversationFollowUp: vi.fn(),
  removeConversationFollowUp: vi.fn(),
}))
vi.mock("@/lib/notify", () => ({ notifyError: vi.fn() }))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((accept) => {
    resolve = accept
  })
  return { promise, resolve }
}

const append = (text: string): ChatSubmission => ({
  text,
  attachments: [],
})
const result = {
  id: 7,
  clientRequestId: "request-7",
  mode: "queue" as const,
  status: "queued" as const,
  disposition: "queued" as const,
  content: "queued prompt",
  attachments: [],
  forwardedProps: { provider_id: 1, model_id: "test-model" },
  position: 0,
  reason: null,
  runId: null,
  messageId: null,
  createdTime: "2026-10-26T00:00:00Z",
}
const onNew = vi.fn<(message: ChatSubmission) => Promise<void>>(async () => {})
function FollowUpsProbe(running = true) {
  return useConversationFollowUps({
    conversationId: "conversation",
    running,
    ready: true,
    messages: [],
    onNew,
  })
}
function renderFollowUps(running = true) {
  harness.s = harness.r = harness.m = 0
  harness.effects = []
  const hook = FollowUpsProbe(running)
  harness.effects.forEach((effect) => effect())
  return hook
}
beforeEach(() => {
  vi.clearAllMocks()
  harness.states = []
  harness.refs = []
  harness.memos = []
  harness.data = { items: [] }
})

describe("server follow-up confirmation", () => {
  it("does not invalidate cached follow-ups when the conversation hook mounts", () => {
    renderFollowUps(false)
    expect(queryClient.invalidateQueries).not.toHaveBeenCalled()
  })
  it("shows pending immediately and replaces it with one confirmed server row", async () => {
    const request = deferred<typeof result>()
    vi.mocked(submitConversationFollowUp).mockReturnValue(request.promise)
    renderFollowUps().queue.enqueue(append("queued prompt"))
    expect(renderFollowUps().queue.items[0]?.id).toMatch(/^pending:/)
    request.resolve(result)
    await vi.waitFor(() =>
      expect(renderFollowUps().queue.items.map((item) => item.id)).toEqual([
        "7",
      ])
    )
  })
  it("retains failed text and retries with the original idempotency key", async () => {
    vi.mocked(submitConversationFollowUp).mockRejectedValueOnce(
      new Error("offline")
    )
    renderFollowUps().queue.enqueue(append("queued prompt"))
    await vi.waitFor(() =>
      expect(renderFollowUps().queue.items[0]?.id).toMatch(/^failed:/)
    )
    const failed = renderFollowUps().queue.items[0]!
    vi.mocked(submitConversationFollowUp).mockResolvedValueOnce(result)
    await renderFollowUps().saveQueuedMessage(
      failed.id,
      append("queued prompt")
    )
    expect(
      vi.mocked(submitConversationFollowUp).mock.calls[0]?.[1].requestId
    ).toBe(vi.mocked(submitConversationFollowUp).mock.calls[1]?.[1].requestId)
    expect(renderFollowUps().queue.items.map((item) => item.id)).toEqual(["7"])
  })
  it("steers a queued message by resending it and dropping the queued copy", async () => {
    harness.data = { items: [result] }
    vi.mocked(submitConversationFollowUp).mockResolvedValue({
      ...result,
      mode: "steer",
      disposition: "steered",
    })
    renderFollowUps().queue.move("7", { lane: "steer" })
    await vi.waitFor(() =>
      expect(vi.mocked(submitConversationFollowUp)).toHaveBeenCalled()
    )
    expect(vi.mocked(submitConversationFollowUp).mock.calls[0]?.[1].mode).toBe(
      "steer"
    )
    expect(vi.mocked(submitConversationFollowUp).mock.calls[0]?.[1].text).toBe(
      "queued prompt"
    )
    await vi.waitFor(() =>
      expect(removeConversationFollowUp).toHaveBeenCalledWith("conversation", 7)
    )
  })
})
