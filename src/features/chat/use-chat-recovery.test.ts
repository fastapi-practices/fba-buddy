import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { QueryClient } from "@tanstack/react-query"
import { bindAppNavigate } from "@/app/navigation"

import {
  getConversation,
  listMcps,
  streamCompletion,
  subscribeConversationEvents,
  updateConversationWorkspace,
} from "@/api"
import { useConversationActivityStore } from "@/features/chat/conversation-activity"
import { useComposerStore } from "@/features/chat/composer-store"
import { useChat } from "@/features/chat/use-chat"
import { useSelectionStore } from "@/features/shell/selection-store"
import { translateCurrent } from "@/lib/i18n"
import {
  beginDataSourceChange,
  useAccountSourceStore,
} from "@/lib/account-source"
import { useHistoryCacheStatusStore } from "@/lib/history-cache-status"
import { useSessionStore } from "@/lib/session"
import { ApiError } from "@/api/http"
import { getMcpOauth } from "@/api/mcp-oauth"
import { toast } from "@/components/ui/toast"
import { conversationDetailFixture } from "@/test/conversation-fixtures"

const hooks = vi.hoisted(() => ({
  states: [] as unknown[],
  refs: [] as { current: unknown }[],
  effects: [] as (() => void | (() => void))[],
  stateIndex: 0,
  refIndex: 0,
}))

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useQueryClient: () => queryClient,
}))

vi.mock("react", async (importOriginal) => {
  const mocked = {
    ...(await importOriginal<typeof import("react")>()),
    useState: <T>(initial: T | (() => T)) => {
      const index = hooks.stateIndex++
      if (index >= hooks.states.length) {
        hooks.states[index] =
          typeof initial === "function" ? (initial as () => T)() : initial
      }
      return [
        hooks.states[index] as T,
        (next: T | ((current: T) => T)) => {
          hooks.states[index] =
            typeof next === "function"
              ? (next as (current: T) => T)(hooks.states[index] as T)
              : next
        },
      ]
    },
    useRef: <T>(initial: T) => {
      const index = hooks.refIndex++
      hooks.refs[index] ??= { current: initial }
      return hooks.refs[index] as { current: T }
    },
    useEffect: (effect: () => void | (() => void)) => {
      hooks.effects.push(effect)
    },
    useMemo: <T>(factory: () => T) => factory(),
    useCallback: <T>(callback: T) => callback,
    useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) =>
      getSnapshot(),
    useDebugValue: () => {},
  }
  return { ...mocked, default: mocked }
})

vi.mock("@/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api")>()),
  getConversation: vi.fn(),
  listMcps: vi.fn(),
  subscribeConversationEvents: vi.fn(),
  streamCompletion: vi.fn(),
  updateConversationWorkspace: vi.fn().mockResolvedValue(null),
}))

vi.mock("@/api/mcp-oauth", () => ({ getMcpOauth: vi.fn() }))
vi.mock("@/components/ui/toast", () => ({ toast: { add: vi.fn() } }))

vi.mock("@/lib/desktop-notify", () => ({
  notifyDesktop: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/features/chat/composer-store", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/features/chat/composer-store")>()
  return {
    useComposerStore: Object.assign(
      () => original.useComposerStore.getState(),
      original.useComposerStore
    ),
  }
})

vi.mock("@/features/chat/conversation-activity", async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import("@/features/chat/conversation-activity")
    >()
  return {
    ...original,
    useConversationActivityStore: Object.assign(
      (
        selector: (
          state: ReturnType<
            typeof original.useConversationActivityStore.getState
          >
        ) => unknown
      ) => selector(original.useConversationActivityStore.getState()),
      original.useConversationActivityStore
    ),
  }
})

const onRunActiveChange = vi.fn()
const onSettled = vi.fn()
const onConversationId = vi.fn()

function ChatProbe(
  conversationId: string | null = "conv-recovery",
  projectId?: number,
  draftConversationId?: string
) {
  return useChat({
    conversationId,
    draftConversationId,
    projectId,
    onConversationId,
    onRunActiveChange,
    onSettled,
  })
}

function renderChatProbe(
  conversationId: string | null = "conv-recovery",
  projectId?: number,
  draftConversationId?: string
) {
  hooks.stateIndex = 0
  hooks.refIndex = 0
  hooks.effects = []
  return ChatProbe(conversationId, projectId, draftConversationId)
}

function mount(
  conversationId: string | null = "conv-recovery",
  projectId?: number,
  draftConversationId?: string
) {
  renderChatProbe(conversationId, projectId, draftConversationId)
  return hooks.effects.map((effect) => effect())
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

beforeEach(() => {
  vi.clearAllMocks()
  queryClient.clear()
  useHistoryCacheStatusStore.setState({ offline: false, cachedAt: null })
  hooks.states = []
  hooks.refs = []
  useSessionStore.setState({ accessToken: "test-token" })
  useAccountSourceStore.setState({
    ready: true,
    epoch: 0,
    account: "test-account",
  })
  useSelectionStore.setState(useSelectionStore.getInitialState(), true)
  useComposerStore.setState(useComposerStore.getInitialState(), true)
  useConversationActivityStore.setState({ generatingIds: [] })
  vi.mocked(getConversation).mockResolvedValue(
    conversationDetailFixture({
      id: 1,
      title: "Recovered conversation",
      is_generating: true,
      messages_snapshot: {
        messages: [
          { id: "u1", role: "user", content: "continue" },
          { id: "a1", role: "assistant", content: "partial reply" },
        ],
      },
    })
  )
})

afterEach(() => {
  bindAppNavigate(null)
  vi.unstubAllGlobals()
})

describe("useChat history stream recovery", () => {
  it("keeps a restored draft and blocks sending until selected MCP authorization is connected", async () => {
    useComposerStore.getState().setModel(1, "test")
    useComposerStore.getState().setDraft("restored prompt")
    useComposerStore.getState().setMcpIds([42])
    vi.mocked(listMcps).mockResolvedValue([
      {
        id: 42,
        name: "Calendar",
        description: null,
        type: 2,
        user_id: 0,
        url: "https://mcp.example.com/calendar",
      },
    ])
    vi.mocked(getMcpOauth).mockResolvedValue({
      configured: true,
      connected: false,
      expires_time: null,
    })
    mount(null)

    await renderChatProbe(null).send("restored prompt")

    expect(streamCompletion).not.toHaveBeenCalled()
    expect(onConversationId).not.toHaveBeenCalled()
    expect(useComposerStore.getState().draft).toBe("restored prompt")
    expect(renderChatProbe(null).messages).toEqual([])
    expect(renderChatProbe(null).error).toBe(
      translateCurrent("oauth.connectionRequired")
    )
    expect(toast.add).toHaveBeenCalledWith(
      expect.objectContaining({ actionProps: expect.any(Object) })
    )
    expect(onRunActiveChange.mock.calls).toEqual([[true], [false]])
  })

  it("blocks selected MCPs on a failed fresh status check without consuming input", async () => {
    useComposerStore.getState().setModel(1, "test")
    useComposerStore.getState().setDraft("retry prompt")
    useComposerStore.getState().setMcpIds([42])
    vi.mocked(listMcps).mockResolvedValue([
      {
        id: 42,
        name: "Calendar",
        description: null,
        type: 2,
        user_id: 0,
        url: "https://mcp.example.com/calendar",
      },
    ])
    vi.mocked(getMcpOauth).mockRejectedValue(new ApiError(0, "Network failure"))
    mount(null)

    await renderChatProbe(null).send("retry prompt")

    expect(streamCompletion).not.toHaveBeenCalled()
    expect(useComposerStore.getState().draft).toBe("retry prompt")
    expect(renderChatProbe(null).error).toBe(
      translateCurrent("oauth.checkFailed")
    )
  })

  it.each(["http", "run"])(
    "refreshes OAuth state and offers connection details after a %s failure",
    async (failure) => {
      useComposerStore.getState().setModel(1, "test")
      useComposerStore.getState().setMcpIds([42])
      vi.mocked(listMcps).mockResolvedValue([
        {
          id: 42,
          name: "Calendar",
          description: null,
          type: 2,
          user_id: 0,
          url: "https://mcp.example.com/calendar",
        },
      ])
      vi.mocked(getMcpOauth)
        .mockResolvedValueOnce({
          configured: true,
          connected: true,
          expires_time: null,
        })
        .mockResolvedValue({
          configured: true,
          connected: false,
          expires_time: null,
        })
      if (failure === "http")
        vi.mocked(streamCompletion).mockRejectedValueOnce(
          new ApiError(400, "Operation failed")
        )
      else
        vi.mocked(streamCompletion).mockResolvedValueOnce(
          new Response(
            `data: ${JSON.stringify({ type: "RUN_ERROR", message: "Operation failed" })}\n\n`
          )
        )
      mount(null)

      await renderChatProbe(null).send("run with MCP")

      await vi.waitFor(() => expect(getMcpOauth).toHaveBeenCalledTimes(2))
      await vi.waitFor(() =>
        expect(toast.add).toHaveBeenCalledWith(
          expect.objectContaining({
            title: translateCurrent("oauth.runFailedHint"),
            type: "info",
            actionProps: expect.any(Object),
          })
        )
      )
      expect(streamCompletion).toHaveBeenCalledTimes(1)
    }
  )

  it.each([undefined, "prebound-worktree"])(
    "waits for server creation before adopting draft %s and blocks duplicate sends",
    async (draftId) => {
      const pending = deferred<Response>()
      vi.mocked(streamCompletion).mockReturnValueOnce(pending.promise)
      useComposerStore.getState().setModel(1, "test")
      mount(null, undefined, draftId)
      const chat = renderChatProbe(null, undefined, draftId)
      const sending = chat.send("immediate local message")
      expect(listMcps).not.toHaveBeenCalled()
      expect(onConversationId).not.toHaveBeenCalled()
      expect(getConversation).not.toHaveBeenCalled()
      expect(
        renderChatProbe(null, undefined, draftId).messages[0]?.content
      ).toBe("immediate local message")
      await chat.send("duplicate")
      expect(streamCompletion).toHaveBeenCalledTimes(1)
      const id = vi.mocked(streamCompletion).mock.calls[0]![0].conversation_id!
      pending.resolve(
        new Response(
          `data: ${JSON.stringify({ type: "RUN_FINISHED", threadId: id, runId: "created" })}\n\n`
        )
      )
      await sending
      expect(onConversationId).toHaveBeenCalledExactlyOnceWith(id)
    }
  )

  it.each([undefined, "prebound-worktree"])(
    "retries an uncreated draft %s with the same ID without querying missing history",
    async (draftId) => {
      vi.mocked(streamCompletion).mockRejectedValueOnce(
        new Error("Preparation failed")
      )
      useComposerStore.getState().setModel(1, "test")
      mount(null, undefined, draftId)
      await renderChatProbe(null, undefined, draftId).send("first attempt")
      expect(onConversationId).not.toHaveBeenCalled()
      expect(getConversation).not.toHaveBeenCalled()
      expect(renderChatProbe(null, undefined, draftId)).toMatchObject({
        status: "idle",
        connectionPhase: "online",
        error: "Preparation failed",
      })
      const firstId =
        vi.mocked(streamCompletion).mock.calls[0]![0].conversation_id!
      vi.mocked(streamCompletion).mockResolvedValueOnce(
        new Response(
          `data: ${JSON.stringify({ type: "RUN_FINISHED", threadId: firstId, runId: "retry" })}\n\n`
        )
      )
      await renderChatProbe(null, undefined, draftId).send("retry")
      expect(
        vi.mocked(streamCompletion).mock.calls[1]![0].conversation_id
      ).toBe(firstId)
      expect(onConversationId).toHaveBeenCalledExactlyOnceWith(firstId)
    }
  )

  it("keeps a prebound worktree chat as a blank draft and reuses its ID for the first message", async () => {
    useComposerStore.getState().setModel(1, "test")
    vi.mocked(streamCompletion).mockResolvedValueOnce(new Response(""))
    mount(null, undefined, "worktree-draft")
    expect(getConversation).not.toHaveBeenCalled()
    expect(renderChatProbe(null, undefined, "worktree-draft").messages).toEqual(
      []
    )
    await renderChatProbe(null, undefined, "worktree-draft").send(
      "first worktree message"
    )
    expect(streamCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        conversation_id: "worktree-draft",
        messages: [
          expect.objectContaining({ content: "first worktree message" }),
        ],
      }),
      expect.any(AbortSignal),
      expect.objectContaining({ onRequest: expect.any(Function) })
    )
    expect(onConversationId).toHaveBeenCalledExactlyOnceWith("worktree-draft")
  })

  it.each([0, 503])(
    "recovers an existing new conversation after a dispatched request fails with %s",
    async (code) => {
      vi.mocked(streamCompletion).mockImplementationOnce(
        async (_body, _signal, options) => {
          options?.onRequest?.()
          throw new ApiError(code, "Response lost after commit")
        }
      )
      let events!: ReadableStreamDefaultController<Uint8Array>
      vi.mocked(subscribeConversationEvents).mockResolvedValueOnce(
        new Response(
          new ReadableStream({
            start(controller) {
              events = controller
            },
          })
        )
      )
      useComposerStore.getState().setModel(1, "test")
      mount(null, undefined, "bound-chat")
      await renderChatProbe(null, undefined, "bound-chat").send("first attempt")

      expect(getConversation).toHaveBeenCalledExactlyOnceWith("bound-chat", {
        messageLimit: 50,
        refresh: true,
        silent: true,
        signal: expect.any(AbortSignal),
      })
      expect(onConversationId).toHaveBeenCalledExactlyOnceWith("bound-chat")
      const cleanups = mount("bound-chat")
      await vi.waitFor(() =>
        expect(subscribeConversationEvents).toHaveBeenCalledTimes(1)
      )
      expect(
        renderChatProbe("bound-chat").messages.map((message) => message.content)
      ).toEqual(["continue", "partial reply"])
      expect(streamCompletion).toHaveBeenCalledTimes(1)
      for (const cleanup of cleanups) cleanup?.()
      events.close()
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
    }
  )

  it.each([400, 403, 404, 422])(
    "does not probe a rejected new conversation request with %s",
    async (code) => {
      vi.mocked(streamCompletion).mockImplementationOnce(
        async (_body, _signal, options) => {
          options?.onRequest?.()
          throw new ApiError(code, "Rejected before creation")
        }
      )
      useComposerStore.getState().setModel(1, "test")
      mount(null)
      await renderChatProbe(null).send("rejected attempt")
      expect(getConversation).not.toHaveBeenCalled()
      expect(onConversationId).not.toHaveBeenCalled()
    }
  )

  it("does not probe an aborted first completion request", async () => {
    vi.mocked(streamCompletion).mockImplementationOnce(
      async (_body, _signal, options) => {
        options?.onRequest?.()
        throw new DOMException("Cancelled", "AbortError")
      }
    )
    useComposerStore.getState().setModel(1, "test")
    mount(null)
    await renderChatProbe(null).send("cancelled attempt")
    expect(getConversation).not.toHaveBeenCalled()
    expect(onConversationId).not.toHaveBeenCalled()
  })

  it("keeps an unknown request as a draft when the silent probe returns 404 and retries its bound ID", async () => {
    vi.mocked(streamCompletion).mockImplementationOnce(
      async (_body, _signal, options) => {
        options?.onRequest?.()
        throw new ApiError(0, "Network error")
      }
    )
    vi.mocked(getConversation).mockRejectedValueOnce(
      new ApiError(404, "Missing")
    )
    useComposerStore.getState().setModel(1, "test")
    mount(null, undefined, "bound-chat")
    await renderChatProbe(null, undefined, "bound-chat").send("first attempt")
    expect(onConversationId).not.toHaveBeenCalled()
    expect(renderChatProbe(null, undefined, "bound-chat").connectionPhase).toBe(
      "online"
    )
    vi.mocked(streamCompletion).mockResolvedValueOnce(new Response(""))
    await renderChatProbe(null, undefined, "bound-chat").send("retry")
    expect(
      vi
        .mocked(streamCompletion)
        .mock.calls.map(([body]) => body.conversation_id)
    ).toEqual(["bound-chat", "bound-chat"])
    expect(onConversationId).toHaveBeenCalledExactlyOnceWith("bound-chat")
  })

  it("recovers the existing run on a manual retry conflict after the initial request and probe lose their connection", async () => {
    const completion = vi.mocked(streamCompletion)
    completion
      .mockImplementationOnce(async (_body, _signal, options) => {
        options?.onRequest?.()
        throw new ApiError(0, "Network error")
      })
      .mockImplementationOnce(async (_body, _signal, options) => {
        options?.onRequest?.()
        throw new ApiError(409, "Run already active")
      })
    vi.mocked(getConversation).mockRejectedValueOnce(
      new ApiError(0, "Still offline")
    )
    useComposerStore.getState().setModel(1, "test")
    mount(null, undefined, "bound-chat")
    await renderChatProbe(null, undefined, "bound-chat").send("first attempt")
    expect(onConversationId).not.toHaveBeenCalled()
    await renderChatProbe(null, undefined, "bound-chat").send("manual retry")
    expect(completion.mock.calls.map(([body]) => body.conversation_id)).toEqual(
      ["bound-chat", "bound-chat"]
    )
    expect(getConversation).toHaveBeenCalledTimes(2)
    expect(onConversationId).toHaveBeenCalledExactlyOnceWith("bound-chat")
  })

  it("does not reuse a draft worktree ID for a separate explicit new conversation", async () => {
    useComposerStore.getState().setModel(1, "test")
    vi.mocked(streamCompletion).mockResolvedValueOnce(new Response(""))
    mount(null, undefined, "worktree-draft")
    await renderChatProbe(null, undefined, "worktree-draft").send(
      "separate chat",
      [],
      undefined,
      true
    )
    expect(
      vi.mocked(streamCompletion).mock.calls[0]![0].conversation_id
    ).not.toBe("worktree-draft")
  })

  it("keeps the connection online when local runtime setup needs attention", async () => {
    vi.mocked(getConversation).mockResolvedValueOnce(
      conversationDetailFixture({
        id: 1,
        title: "Runtime setup conversation",
        is_generating: false,
        messages_snapshot: { messages: [] },
      })
    )
    useComposerStore.getState().setModel(1, "test")
    mount("conv-recovery")
    await vi.waitFor(() =>
      expect(renderChatProbe("conv-recovery").status).toBe("idle")
    )
    const error = "Install the managed node runtime before local execution"
    vi.mocked(streamCompletion).mockRejectedValueOnce(new Error(error))

    await renderChatProbe("conv-recovery").send("run locally")

    expect(renderChatProbe("conv-recovery").error).toBe(error)
    expect(renderChatProbe("conv-recovery").connectionPhase).toBe("online")
    expect(renderChatProbe("conv-recovery").messages.at(-1)).toMatchObject({
      role: "assistant",
      status: "error",
      error,
    })
  })

  it("retries an explicit new conversation from existing history with its pending ID and new assistant binding", async () => {
    vi.mocked(getConversation).mockResolvedValueOnce(
      conversationDetailFixture({
        id: 1,
        title: "Original conversation",
        is_generating: false,
        messages_snapshot: { messages: [] },
      })
    )
    vi.mocked(streamCompletion).mockRejectedValueOnce(
      new Error("Preparation failed")
    )
    useComposerStore.getState().setModel(1, "test")
    mount("old-chat")
    await vi.waitFor(() =>
      expect(renderChatProbe("old-chat").status).toBe("idle")
    )
    useSelectionStore.getState().setSelectedAssistantId(7)
    await renderChatProbe("old-chat").send(
      "start a new plan",
      [],
      undefined,
      true
    )
    const newId = vi.mocked(streamCompletion).mock.calls[0]![0].conversation_id
    expect(newId).not.toBe("old-chat")
    expect(onConversationId).not.toHaveBeenCalled()
    expect(getConversation).toHaveBeenCalledTimes(1)
    vi.mocked(streamCompletion).mockResolvedValueOnce(new Response(""))
    await renderChatProbe("old-chat").send("retry new plan")
    expect(vi.mocked(streamCompletion).mock.calls[1]![0]).toMatchObject({
      conversation_id: newId,
      assistant_id: 7,
    })
    expect(onConversationId).toHaveBeenCalledExactlyOnceWith(newId)
  })

  it.each(["source", "unmount"] as const)(
    "ignores delayed creation confirmation after %s changes",
    async (change) => {
      const history = deferred<Awaited<ReturnType<typeof getConversation>>>()
      vi.mocked(getConversation).mockReturnValueOnce(history.promise)
      vi.mocked(streamCompletion).mockImplementationOnce(
        async (_body, _signal, options) => {
          options?.onRequest?.()
          throw new ApiError(0, "Response lost")
        }
      )
      useComposerStore.getState().setModel(1, "test")
      const cleanups = mount(null)
      const sending = renderChatProbe(null).send("first attempt")
      await vi.waitFor(() => expect(getConversation).toHaveBeenCalledTimes(1))
      if (change === "source") {
        beginDataSourceChange()
        useAccountSourceStore.setState({ ready: true })
      } else {
        for (const cleanup of cleanups) cleanup?.()
      }
      history.resolve(
        conversationDetailFixture({
          id: 1,
          title: "Late confirmation",
          is_generating: true,
        })
      )
      await sending
      expect(onConversationId).not.toHaveBeenCalled()
      expect(subscribeConversationEvents).not.toHaveBeenCalled()
    }
  )

  it("ignores a prebound draft after its account source changes", async () => {
    useComposerStore.getState().setModel(1, "test")
    mount(null, undefined, "worktree-draft")
    const chat = renderChatProbe(null, undefined, "worktree-draft")
    beginDataSourceChange()
    useAccountSourceStore.setState({ ready: true })
    await chat.send("stale draft")
    expect(streamCompletion).not.toHaveBeenCalled()
    expect(onConversationId).not.toHaveBeenCalled()
  })

  it("requires login without consuming a draft or creating history", async () => {
    const navigate = vi.fn()
    bindAppNavigate(navigate)
    vi.stubGlobal("window", {
      location: { hash: "#/chat" },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
    useSessionStore.setState({ accessToken: null })
    useComposerStore.getState().setModel(1, "test")
    useComposerStore.getState().setDraft("offline draft")
    mount(null)

    await renderChatProbe(null).send("offline draft")

    expect(streamCompletion).not.toHaveBeenCalled()
    expect(onConversationId).not.toHaveBeenCalled()
    expect(useComposerStore.getState().draft).toBe("offline draft")
    expect(useConversationActivityStore.getState().generatingIds).toEqual([])
    expect(navigate).toHaveBeenCalledWith(
      expect.stringContaining("/auth/login?returnTo="),
      undefined
    )
  })
  it("keeps the draft and avoids a completion request while showing offline cached history", async () => {
    useComposerStore.getState().setModel(1, "test")
    useComposerStore.getState().setDraft("offline draft")
    mount(null)
    useHistoryCacheStatusStore.setState({
      offline: true,
      cachedAt: new Date().toISOString(),
    })

    await renderChatProbe(null).send("offline draft")

    expect(streamCompletion).not.toHaveBeenCalled()
    expect(onConversationId).not.toHaveBeenCalled()
    expect(useComposerStore.getState().draft).toBe("offline draft")
    expect(useConversationActivityStore.getState().generatingIds).toEqual([])
  })

  it("does not submit while account initialization is pending", async () => {
    useComposerStore.getState().setModel(1, "test")
    mount(null)
    const chat = renderChatProbe(null)
    useAccountSourceStore.setState({ ready: false })

    await chat.send("queued prompt")

    expect(streamCompletion).not.toHaveBeenCalled()
    expect(useConversationActivityStore.getState().generatingIds).toEqual([])
    expect(onRunActiveChange).not.toHaveBeenCalled()
  })

  it("ignores delayed history after the account source epoch changes", async () => {
    const history = deferred<Awaited<ReturnType<typeof getConversation>>>()
    vi.mocked(getConversation).mockReturnValueOnce(history.promise)
    mount()
    beginDataSourceChange()
    useAccountSourceStore.setState({ ready: true })
    useSelectionStore.setState({ selectedAssistantId: 99 })
    useComposerStore.setState({ provider_id: 99, model_id: "new-source-model" })

    history.resolve(
      conversationDetailFixture({
        id: 1,
        title: "Old source history",
        assistant_id: 7,
        provider_id: 7,
        model_id: "old-source-model",
        is_generating: true,
        messages_snapshot: {
          messages: [{ id: "old", role: "user", content: "old prompt" }],
        },
      })
    )
    await history.promise
    await Promise.resolve()

    expect(useSelectionStore.getState().selectedAssistantId).toBe(99)
    expect(useComposerStore.getState().model_id).toBe("new-source-model")
    expect(subscribeConversationEvents).not.toHaveBeenCalled()
    expect(useConversationActivityStore.getState().generatingIds).toEqual([])
    expect(onRunActiveChange).not.toHaveBeenCalled()
  })

  it("keeps the new source activity and unread state when an old subscription finishes", async () => {
    let events!: ReadableStreamDefaultController<Uint8Array>
    vi.mocked(subscribeConversationEvents).mockResolvedValueOnce(
      new Response(
        new ReadableStream({
          start(controller) {
            events = controller
          },
        })
      )
    )
    mount()
    await vi.waitFor(() =>
      expect(subscribeConversationEvents).toHaveBeenCalledTimes(1)
    )
    beginDataSourceChange()
    useAccountSourceStore.setState({ ready: true })
    useConversationActivityStore.setState({
      generatingIds: ["conv-recovery", "new-source-chat"],
    })
    events.close()
    await new Promise<void>((resolve) => setTimeout(resolve, 0))

    expect(useConversationActivityStore.getState().generatingIds).toEqual([
      "conv-recovery",
      "new-source-chat",
    ])
    expect(useSelectionStore.getState().unreadConversationIds).toEqual([])
    expect(onRunActiveChange.mock.calls).toEqual([[true]])
    expect(getConversation).toHaveBeenCalledTimes(1)
  })

  it("does not associate or settle a new conversation in a changed source after its response arrives", async () => {
    const completion = deferred<Response>()
    vi.mocked(streamCompletion).mockReturnValueOnce(completion.promise)
    useComposerStore.getState().setModel(1, "test")
    mount(null, 33)
    const sending = renderChatProbe(null, 33).send("new conversation")
    const id = vi.mocked(streamCompletion).mock.calls[0]![0].conversation_id!
    beginDataSourceChange()
    useAccountSourceStore.setState({ account: "new-account", ready: true })
    useConversationActivityStore.setState({
      generatingIds: [id, "new-source-chat"],
    })
    completion.resolve(new Response(""))
    await sending

    expect(updateConversationWorkspace).not.toHaveBeenCalled()
    expect(onSettled).not.toHaveBeenCalled()
    expect(useConversationActivityStore.getState().generatingIds).toEqual([
      id,
      "new-source-chat",
    ])
    expect(useSelectionStore.getState().unreadConversationIds).toEqual([])
    expect(onRunActiveChange.mock.calls).toEqual([[true]])
    expect(getConversation).not.toHaveBeenCalled()
  })

  it("refreshes terminal server history after its view unmounts without updating the next view", async () => {
    const completion = deferred<Response>()
    vi.mocked(streamCompletion).mockReturnValueOnce(completion.promise)
    useComposerStore.getState().setModel(1, "test")
    const cleanups = mount(null)
    const sending = renderChatProbe(null).send("background conversation")
    const id = vi.mocked(streamCompletion).mock.calls[0]![0].conversation_id!
    for (const cleanup of cleanups) cleanup?.()
    useSelectionStore.setState({ selectedAssistantId: 99 })
    vi.mocked(getConversation).mockResolvedValueOnce(
      conversationDetailFixture({
        id: 1,
        assistant_id: 7,
        title: "Completed background conversation",
        is_generating: false,
        messages_snapshot: {
          messages: [{ id: "reply", role: "assistant", content: "Completed" }],
        },
      })
    )
    completion.resolve(
      new Response(
        `data: ${JSON.stringify({ type: "RUN_FINISHED", threadId: id, runId: "background-run", outcome: { type: "success" } })}\n\n`
      )
    )
    await sending

    expect(onSettled).toHaveBeenCalledTimes(1)
    expect(useConversationActivityStore.getState().generatingIds).toEqual([])
    expect(useSelectionStore.getState().unreadConversationIds).toEqual([id])
    expect(getConversation).toHaveBeenCalledExactlyOnceWith(id, {
      messageLimit: 50,
      refresh: true,
    })
    expect(useSelectionStore.getState().selectedAssistantId).toBe(99)
  })

  it("refreshes a detached subscription only after receiving its terminal event", async () => {
    let events!: ReadableStreamDefaultController<Uint8Array>
    vi.mocked(subscribeConversationEvents).mockResolvedValueOnce(
      new Response(
        new ReadableStream({
          start(controller) {
            events = controller
          },
        })
      )
    )
    const cleanups = mount()
    await vi.waitFor(() =>
      expect(subscribeConversationEvents).toHaveBeenCalledOnce()
    )
    for (const cleanup of cleanups) cleanup?.()
    useSelectionStore.setState({ selectedAssistantId: 99 })
    vi.mocked(getConversation).mockResolvedValueOnce(
      conversationDetailFixture({
        id: 1,
        assistant_id: 7,
        title: "Completed subscription",
        is_generating: false,
      })
    )
    events.enqueue(
      new TextEncoder().encode(
        `data: ${JSON.stringify({ type: "TEXT_MESSAGE_CONTENT", messageId: "a1", delta: " background" })}\n\n`
      )
    )
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    expect(getConversation).toHaveBeenCalledTimes(1)

    events.enqueue(
      new TextEncoder().encode(
        `data: ${JSON.stringify({ type: "RUN_FINISHED", threadId: "conv-recovery", runId: "background-run", outcome: { type: "success" } })}\n\n`
      )
    )
    await vi.waitFor(() => expect(getConversation).toHaveBeenCalledTimes(2))
    expect(getConversation).toHaveBeenLastCalledWith("conv-recovery", {
      messageLimit: 50,
      refresh: true,
    })
    expect(useSelectionStore.getState().selectedAssistantId).toBe(99)
  })

  it("reconnects through history and the existing subscription without resending the prompt", async () => {
    vi.mocked(subscribeConversationEvents).mockRejectedValueOnce(
      new Error("Connection lost")
    )
    mount()
    await vi.waitFor(() =>
      expect(renderChatProbe().connectionPhase).toBe("dropped")
    )
    renderChatProbe().retryConnection()
    expect(renderChatProbe().connectionPhase).toBe("reconnecting")
    vi.mocked(subscribeConversationEvents).mockResolvedValueOnce(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                `data: ${JSON.stringify({ type: "RUN_FINISHED", threadId: "conv-recovery", runId: "recovery-run", outcome: { type: "success" } })}\n\n`
              )
            )
            controller.close()
          },
        })
      )
    )
    mount()
    await vi.waitFor(() => {
      const recovered = renderChatProbe()
      expect(recovered.connectionPhase).toBe("resumed")
      expect(recovered.error).toBeNull()
      expect(recovered.messages.map((message) => message.content)).toEqual([
        "continue",
        "partial reply",
      ])
    })
    expect(subscribeConversationEvents).toHaveBeenCalledTimes(2)
    expect(streamCompletion).not.toHaveBeenCalled()
  })

  it("replays a reconnect from the last persisted SSE event id", async () => {
    vi.mocked(subscribeConversationEvents).mockResolvedValueOnce(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                `id: 7-3\ndata: ${JSON.stringify({ type: "RUN_STARTED", threadId: "conv-recovery", runId: "recovery-run" })}\n\n`
              )
            )
          },
          pull(controller) {
            controller.error(new Error("Connection lost"))
          },
        })
      )
    )
    mount()
    await vi.waitFor(() =>
      expect(renderChatProbe().connectionPhase).toBe("dropped")
    )
    vi.mocked(subscribeConversationEvents).mockResolvedValueOnce(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                `id: 7-4\ndata: ${JSON.stringify({ type: "RUN_FINISHED", threadId: "conv-recovery", runId: "recovery-run", outcome: { type: "success" } })}\n\n`
              )
            )
            controller.close()
          },
        })
      )
    )
    renderChatProbe().retryConnection()
    mount()
    await vi.waitFor(() =>
      expect(renderChatProbe().connectionPhase).toBe("resumed")
    )
    expect(subscribeConversationEvents).toHaveBeenNthCalledWith(
      1,
      "conv-recovery",
      expect.any(AbortSignal),
      null
    )
    expect(subscribeConversationEvents).toHaveBeenNthCalledWith(
      2,
      "conv-recovery",
      expect.any(AbortSignal),
      "7-3"
    )
  })
  it("preserves history and displays a subscription failure", async () => {
    vi.mocked(subscribeConversationEvents).mockRejectedValue(
      new Error("Subscription failed")
    )
    mount()

    await vi.waitFor(() => {
      const chat = renderChatProbe()
      expect(chat.status).toBe("idle")
      expect(chat.error).toBe("Subscription failed")
      expect(chat.messages).toMatchObject([
        { id: "u1", status: "complete", content: "continue" },
        {
          id: "a1",
          status: "error",
          content: "partial reply",
          error: "Subscription failed",
        },
      ])
      expect(useConversationActivityStore.getState().generatingIds).toEqual([])
      expect(onRunActiveChange.mock.calls).toEqual([[true], [false]])
    })
  })

  it("treats a subscription response without a body as an error", async () => {
    vi.mocked(subscribeConversationEvents).mockResolvedValue(new Response(null))
    mount()

    await vi.waitFor(() => {
      const chat = renderChatProbe()
      const error = translateCurrent("common.streamingResponseWasEmpty")
      expect(chat.error).toBe(error)
      expect(chat.messages.at(-1)).toMatchObject({ status: "error", error })
      expect(chat.status).toBe("idle")
      expect(useConversationActivityStore.getState().generatingIds).toEqual([])
      expect(onRunActiveChange.mock.calls).toEqual([[true], [false]])
    })
  })

  it("settles a read failure after streamed text and a pending approval", async () => {
    const events = [
      { type: "TEXT_MESSAGE_CONTENT", messageId: "a1", delta: " continued" },
      {
        type: "CUSTOM",
        name: "buddy.coding.approval",
        value: {
          request_id: "approval-1",
          message_id: "a1",
          call_id: "tool-1",
          name: "write_file",
          arguments: { path: "output.txt" },
        },
      },
    ]
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")
          )
        )
      },
      pull(controller) {
        controller.error(new Error("Connection lost"))
      },
    })
    vi.mocked(subscribeConversationEvents).mockResolvedValue(new Response(body))
    mount()

    await vi.waitFor(() => {
      const chat = renderChatProbe()
      expect(chat.error).toBe("Connection lost")
      expect(chat.status).toBe("idle")
      expect(chat.messages.at(-1)).toMatchObject({
        status: "error",
        content: "partial reply continued",
        error: "Connection lost",
        tools: [{ id: "tool-1", pendingApproval: false }],
        timing: { totalStreamTime: expect.any(Number) },
      })
      expect(chat.messages.at(-1)?.tools?.[0].approvalRequestId).toBeUndefined()
      expect(useConversationActivityStore.getState().generatingIds).toEqual([])
      expect(onRunActiveChange.mock.calls).toEqual([[true], [false]])
    })
  })
})
