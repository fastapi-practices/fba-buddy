import { beforeEach, describe, expect, it, vi } from "vitest"

import { getConversation, stopConversation, streamImageGeneration } from "@/api"
import { useComposerStore } from "@/features/chat/composer-store"
import {
  discardImageGeneration,
  useImageGen,
} from "@/features/image/use-image-gen"
import { useImageStore } from "@/features/image/image-store"
import { translateCurrent } from "@/lib/i18n"
import { beginDataSourceChange, sourceStorageKey } from "@/lib/account-source"
import type { ConversationDetail, SnapshotMessage } from "@/lib/types"
import { useSessionStore } from "@/lib/session"
import { conversationDetailFixture } from "@/test/conversation-fixtures"

const harness = vi.hoisted(() => {
  const storage = new Map<string, string>()
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
  })
  return {
    invalidateQueries: vi.fn().mockResolvedValue(undefined),
    setQueryData: vi.fn(),
  }
})

vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useCallback: <T>(callback: T) => callback,
}))
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    getQueryData: () => undefined,
    invalidateQueries: harness.invalidateQueries,
    setQueryData: harness.setQueryData,
  }),
}))
vi.mock("@/api", () => ({
  getConversation: vi.fn(),
  stopConversation: vi.fn(),
  streamImageGeneration: vi.fn(),
}))

const file: SnapshotMessage = {
  id: "generated-file",
  role: "activity",
  activityType: "pydantic_ai_file",
  content: { url: "data:image/png;base64,Y2F0", media_type: "image/png" },
}
const saved: ConversationDetail = conversationDetailFixture({
  id: 1,
  title: "Image",
  messages_snapshot: {
    messages: [{ id: "user", role: "user", content: "a cat" }, file],
  },
})
const started = {
  type: "RUN_STARTED",
  threadId: "image-thread",
  runId: "image-run",
}
const finished = {
  type: "RUN_FINISHED",
  threadId: "image-thread",
  runId: "image-run",
  outcome: { type: "success" },
}

function packet(event: unknown) {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`)
}

function response(events: unknown[]) {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const event of events) controller.enqueue(packet(event))
        controller.close()
      },
    })
  )
}

beforeEach(() => {
  useSessionStore.setState({ accessToken: "test-token" })
  vi.clearAllMocks()
  useImageStore.setState({
    prompt: "a cat",
    items: [],
    selectedConversationId: null,
  })
  useComposerStore.setState({
    image_provider_id: 1,
    image_model_id: "image-model",
  })
  vi.mocked(getConversation).mockResolvedValue(saved)
  vi.mocked(stopConversation).mockResolvedValue(null)
})

describe("useImageGen", () => {
  it("continues the selected conversation with complete text and image history", async () => {
    vi.mocked(streamImageGeneration).mockImplementation(async () =>
      response([started, finished])
    )
    await useImageGen().generate()
    const first = useImageStore.getState().items[0]!
    expect(first.messages?.map((message) => message.role)).toEqual([
      "user",
      "assistant",
    ])
    useImageStore.getState().setPrompt("make the cat blue")
    vi.mocked(getConversation).mockResolvedValue({
      ...saved,
      messages_snapshot: {
        messages: [
          ...saved.messages_snapshot!.messages!,
          { id: "follow-up", role: "user", content: "make the cat blue" },
          { id: "reply", role: "assistant", content: "Here is the blue cat" },
          {
            ...file,
            id: "blue-file",
            content: {
              url: "data:image/png;base64,Ymx1ZQ==",
              media_type: "image/png",
            },
          },
        ],
      },
    })
    await useImageGen().generate()
    expect(streamImageGeneration).toHaveBeenLastCalledWith(
      expect.objectContaining({
        conversation_id: first.conversationId,
        messages: [
          expect.objectContaining({
            role: "user",
            content: [
              { type: "text", text: "make the cat blue" },
              {
                type: "image",
                source: { type: "data", value: "Y2F0", mimeType: "image/png" },
              },
            ],
          }),
        ],
      }),
      expect.any(AbortSignal)
    )
    const items = useImageStore.getState().items
    expect(items).toHaveLength(1)
    expect(
      items[0]?.messages?.filter((message) => message.role === "user")
    ).toHaveLength(2)
    expect(items[0]?.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "assistant",
          content: "Here is the blue cat",
        }),
        expect.objectContaining({
          role: "assistant",
          attachments: expect.arrayContaining([
            expect.objectContaining({ data: "Ymx1ZQ==", mime: "image/png" }),
          ]),
        }),
      ])
    )
  })

  it("starts a separate conversation only after choosing new drawing", async () => {
    vi.mocked(streamImageGeneration).mockImplementation(async () =>
      response([started, finished])
    )
    await useImageGen().generate()
    const firstId = useImageStore.getState().selectedConversationId
    useImageStore.getState().startNewConversation()
    useImageStore.getState().setPrompt("a dog")
    await useImageGen().generate()
    expect(useImageStore.getState().selectedConversationId).not.toBe(firstId)
    expect(useImageStore.getState().items).toHaveLength(2)
  })

  it("starts a new conversation while another conversation is streaming", async () => {
    const writers: ReadableStreamDefaultController<Uint8Array>[] = []
    vi.mocked(streamImageGeneration).mockImplementation(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              writers.push(controller)
            },
          })
        )
    )
    const generation = useImageGen()
    const first = generation.generate()
    await vi.waitFor(() => expect(writers).toHaveLength(1))
    const firstId = useImageStore.getState().selectedConversationId

    useImageStore.getState().startNewConversation()
    useImageStore.getState().setPrompt("a dog")
    const second = generation.generate()
    await vi.waitFor(() => expect(writers).toHaveLength(2))

    expect(useImageStore.getState().selectedConversationId).not.toBe(firstId)
    expect(useImageStore.getState().items).toHaveLength(2)
    expect(useImageStore.getState().items.map((item) => item.status)).toEqual([
      "streaming",
      "streaming",
    ])

    for (const writer of writers) {
      writer.enqueue(packet(started))
      writer.enqueue(packet(finished))
      writer.close()
    }
    await Promise.all([first, second])
    expect(useImageStore.getState().items.map((item) => item.status)).toEqual([
      "complete",
      "complete",
    ])
  })

  it("preserves successful streamed content when the follow-up detail request fails", async () => {
    vi.mocked(streamImageGeneration).mockResolvedValue(
      response([
        started,
        { type: "TEXT_MESSAGE_START", messageId: "reply", role: "assistant" },
        {
          type: "TEXT_MESSAGE_CONTENT",
          messageId: "reply",
          delta: "Your painting",
        },
        {
          type: "ACTIVITY_SNAPSHOT",
          messageId: "image",
          activityType: "pydantic_ai_file",
          content: {
            url: "data:image/png;base64,Y2F0",
            media_type: "image/png",
          },
        },
        finished,
      ])
    )
    vi.mocked(getConversation).mockRejectedValue(new Error("offline"))
    await useImageGen().generate()
    expect(useImageStore.getState().items[0]).toMatchObject({
      status: "complete",
      content: "Your painting",
      urls: ["data:image/png;base64,Y2F0"],
      messages: [
        expect.objectContaining({ role: "user", content: "a cat" }),
        expect.objectContaining({
          role: "assistant",
          content: "Your painting",
        }),
      ],
    })
  })

  it("does not change the selected view when a background generation finishes", async () => {
    let resolveSnapshot!: (detail: ConversationDetail) => void
    vi.mocked(getConversation).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSnapshot = resolve
        })
    )
    vi.mocked(streamImageGeneration).mockResolvedValue(
      response([started, finished])
    )
    const pending = useImageGen().generate()
    await vi.waitFor(() => expect(getConversation).toHaveBeenCalledOnce())
    useImageStore.getState().selectConversation("other-conversation")
    resolveSnapshot(saved)
    await pending
    expect(useImageStore.getState().selectedConversationId).toBe(
      "other-conversation"
    )
  })

  it("drops old generation updates after changing the data source", async () => {
    let resolveSnapshot!: (detail: ConversationDetail) => void
    vi.mocked(getConversation).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSnapshot = resolve
        })
    )
    vi.mocked(streamImageGeneration).mockResolvedValue(
      response([started, finished])
    )
    const pending = useImageGen().generate()
    await vi.waitFor(() => expect(getConversation).toHaveBeenCalledOnce())
    beginDataSourceChange()
    useImageStore.setState({
      items: [],
      prompt: "new source draft",
      selectedConversationId: null,
    })
    resolveSnapshot(saved)
    await pending
    expect(useImageStore.getState()).toMatchObject({
      items: [],
      prompt: "new source draft",
      selectedConversationId: null,
    })
  })

  it("persists conversation metadata without duplicating image bytes in browser storage", async () => {
    vi.mocked(streamImageGeneration).mockResolvedValue(
      response([started, finished])
    )
    await useImageGen().generate()
    const persisted = localStorage.getItem(
      sourceStorageKey("fba-buddy.image-gen")
    )!
    expect(persisted).not.toContain("Y2F0")
    expect(JSON.parse(persisted).state.items[0]).toMatchObject({
      conversationId: useImageStore.getState().selectedConversationId,
    })
    expect(JSON.parse(persisted).state.items[0].messages).toBeUndefined()
  })

  it("does not let a stopped run overwrite a new run in the same conversation", async () => {
    let resolveOldSnapshot!: (detail: ConversationDetail) => void
    vi.mocked(getConversation)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOldSnapshot = resolve
          })
      )
      .mockResolvedValue(saved)
    vi.mocked(streamImageGeneration).mockImplementation(async () =>
      response([started, finished])
    )
    const generation = useImageGen()
    const stoppedRun = generation.generate()
    await vi.waitFor(() => expect(getConversation).toHaveBeenCalledOnce())
    await generation.stop()
    useImageStore.getState().setPrompt("try again")
    await generation.generate()
    expect(useImageStore.getState().items[0]?.status).toBe("complete")
    resolveOldSnapshot(saved)
    await stoppedRun
    expect(useImageStore.getState().items[0]?.status).toBe("complete")
  })

  it("loads native generated file activities after a successful text-free stream", async () => {
    vi.mocked(streamImageGeneration).mockResolvedValue(
      response([started, finished])
    )
    await useImageGen().generate()
    const item = useImageStore.getState().items[0]!
    expect(getConversation).toHaveBeenCalledWith(item.conversationId, {
      messageLimit: 50,
      refresh: true,
    })
    expect(item).toMatchObject({
      status: "complete",
      content: "",
      urls: ["data:image/png;base64,Y2F0"],
    })
  })

  it("shows native streamed snapshots immediately", async () => {
    let writer!: ReadableStreamDefaultController<Uint8Array>
    vi.mocked(streamImageGeneration).mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            writer = controller
          },
        })
      )
    )
    const pending = useImageGen().generate()
    writer.enqueue(packet(started))
    writer.enqueue(packet({ type: "MESSAGES_SNAPSHOT", messages: [file] }))
    await vi.waitFor(() => {
      expect(useImageStore.getState().items[0]).toMatchObject({
        status: "streaming",
        urls: ["data:image/png;base64,Y2F0"],
      })
    })
    writer.enqueue(packet(finished))
    await pending
    expect(useImageStore.getState().items[0]?.status).toBe("complete")
  })

  it("discards an active generation without restoring its deleted record", async () => {
    let writer!: ReadableStreamDefaultController<Uint8Array>
    vi.mocked(streamImageGeneration).mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            writer = controller
          },
        })
      )
    )
    const pending = useImageGen().generate()
    await vi.waitFor(() => {
      expect(useImageStore.getState().items[0]?.status).toBe("streaming")
    })
    const conversationId = useImageStore.getState().items[0]!.conversationId

    discardImageGeneration(conversationId)
    useImageStore.getState().removeConversation(conversationId)
    writer.enqueue(packet(started))
    writer.close()

    await pending
    expect(useImageStore.getState().items).toEqual([])
  })

  it("refreshes terminal failed history without replacing the streamed error with snapshot content", async () => {
    vi.mocked(streamImageGeneration).mockResolvedValue(
      response([{ type: "RUN_ERROR", message: "Image quota exceeded" }])
    )
    await useImageGen().generate()
    expect(useImageStore.getState().items[0]).toMatchObject({
      status: "error",
      error: "Image quota exceeded",
      urls: [],
    })
    expect(getConversation).toHaveBeenCalledExactlyOnceWith(
      useImageStore.getState().selectedConversationId,
      { messageLimit: 50, refresh: true }
    )
    expect(harness.setQueryData).not.toHaveBeenCalled()
  })

  it("treats a stream without a terminal event as generation failure", async () => {
    vi.mocked(streamImageGeneration).mockResolvedValue(response([started]))
    await useImageGen().generate()
    expect(useImageStore.getState().items[0]?.status).toBe("error")
    expect(getConversation).not.toHaveBeenCalled()
  })

  it("keeps a stopped item stopped when the snapshot request finishes later", async () => {
    let resolveSnapshot!: (detail: ConversationDetail) => void
    vi.mocked(getConversation).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSnapshot = resolve
        })
    )
    vi.mocked(streamImageGeneration).mockResolvedValue(
      response([started, finished])
    )
    const generation = useImageGen()
    const pending = generation.generate()
    await vi.waitFor(() => expect(getConversation).toHaveBeenCalledOnce())
    const conversationId = useImageStore.getState().items[0]!.conversationId
    await generation.stop()
    expect(stopConversation).toHaveBeenCalledWith(conversationId)
    expect(useImageStore.getState().items[0]).toMatchObject({
      status: "error",
      error: translateCurrent("common.stopped"),
    })
    resolveSnapshot(saved)
    await pending
    expect(useImageStore.getState().items[0]).toMatchObject({
      status: "error",
      error: translateCurrent("common.stopped"),
      urls: [],
    })
  })
})
