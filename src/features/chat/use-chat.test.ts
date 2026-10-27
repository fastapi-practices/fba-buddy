import { describe, expect, it } from "vitest"

import {
  canRegenerateMessage,
  canRegenerateReply,
  composerEditRoute,
  currentTurn,
  composerSubmitAction,
  conversationDetailIsGenerating,
  conversationLoadAction,
  editableUserMessage,
  isEditableChatMessage,
  messagesAfterRegenerate,
  mergeRecentConversationMessages,
  regenerateRoute,
  regenerateTargetPk,
  resolveChatPaneConversationId,
  shouldAnnounceConversationAfterRun,
  shouldShowHistoryLoading,
  shouldSyncConversationAfterRun,
} from "@/features/chat/use-chat"
import type { ChatMessage } from "@/lib/types"

describe("conversationLoadAction", () => {
  it("resets to a new chat when there is no conversation id", () => {
    expect(conversationLoadAction(null, false)).toBe("reset-new")
    expect(conversationLoadAction(null, true)).toBe("reset-new")
  })

  it("skips reload after the first send creates a conversation", () => {
    expect(conversationLoadAction("conv-1", true)).toBe("skip")
  })

  it("loads history when switching to an existing conversation", () => {
    expect(conversationLoadAction("conv-1", false)).toEqual({
      action: "load",
      conversationId: "conv-1",
    })
  })
})

describe("conversationDetailIsGenerating", () => {
  it("reads the generating flag", () => {
    expect(conversationDetailIsGenerating({ is_generating: true })).toBe(true)
    expect(conversationDetailIsGenerating({ is_generating: false })).toBe(false)
  })
})

describe("editableUserMessage", () => {
  const lastUser: ChatMessage = {
    id: "u2",
    pk: 22,
    role: "user",
    content: "再问一次",
    status: "complete",
  }
  const messages: ChatMessage[] = [
    {
      id: "u1",
      pk: 11,
      role: "user",
      content: "先问",
      status: "complete",
    },
    { id: "a1", role: "assistant", content: "好", status: "complete" },
    lastUser,
    { id: "a2", role: "assistant", content: "答", status: "complete" },
  ]

  it("returns the last user message when that is the edit source", () => {
    expect(editableUserMessage(messages, "u2")).toEqual(lastUser)
  })

  it("only marks persisted plain-text user messages as editable", () => {
    expect(isEditableChatMessage(lastUser)).toBe(true)
    expect(isEditableChatMessage({ ...lastUser, content: "   " })).toBe(false)
    expect(
      isEditableChatMessage({
        ...lastUser,
        attachments: [
          {
            id: "att-1",
            name: "shot.png",
            mime: "image/png",
            size: 12,
            data: "abc",
            kind: "image",
          },
        ],
      })
    ).toBe(false)
    expect(isEditableChatMessage({ ...lastUser, pk: 0 })).toBe(false)
    expect(isEditableChatMessage({ ...lastUser, role: "assistant" })).toBe(
      false
    )
  })

  it("rejects earlier user messages and messages with attachments", () => {
    expect(editableUserMessage(messages, "u1")).toBeNull()
    expect(
      editableUserMessage(
        [
          {
            ...lastUser,
            attachments: [
              {
                id: "att-1",
                name: "shot.png",
                mime: "image/png",
                size: 12,
                data: "abc",
                kind: "image",
              },
            ],
          },
        ],
        "u2"
      )
    ).toBeNull()
  })
})

describe("composerSubmitAction", () => {
  const lastUser: ChatMessage = {
    id: "u2",
    pk: 22,
    role: "user",
    content: "再问一次",
    status: "complete",
  }
  const messages: ChatMessage[] = [
    lastUser,
    { id: "a2", role: "assistant", content: "答", status: "complete" },
  ]

  it("regenerates when the composer is editing the last user message", () => {
    expect(composerSubmitAction("u2", messages, "  改过的问题  ")).toEqual({
      type: "edit",
      pk: 22,
      text: "改过的问题",
    })
  })

  it("sends a new message when not editing", () => {
    expect(composerSubmitAction(null, messages, "新问题")).toEqual({
      type: "send",
      text: "新问题",
    })
  })
})

describe("composerEditRoute", () => {
  const messages: ChatMessage[] = [
    { id: "u1", pk: 1, role: "user", content: "第一问", status: "complete" },
    {
      id: "a1",
      pk: 2,
      role: "assistant",
      content: "第一答",
      status: "complete",
    },
    { id: "u2", pk: 3, role: "user", content: "第二问", status: "complete" },
    {
      id: "a2",
      pk: 4,
      role: "assistant",
      content: "第二答",
      status: "complete",
    },
  ]

  it("edits the last user message in place", () => {
    expect(composerEditRoute(messages, 3, "改过的问题")).toBe("in-place")
  })

  it("branches in coding mode or when editing an earlier user message", () => {
    expect(composerEditRoute(messages, 3, "改过的问题", { coding: true })).toBe(
      "branch"
    )
    expect(composerEditRoute(messages, 1, "改过的第一问")).toBe("branch")
  })
})

describe("currentTurn", () => {
  const messages: ChatMessage[] = [
    { id: "u1", pk: 1, role: "user", content: "第一问", status: "complete" },
    {
      id: "a1",
      pk: 2,
      role: "assistant",
      content: "第一答",
      status: "complete",
    },
    { id: "u2", pk: 3, role: "user", content: "第二问", status: "complete" },
    {
      id: "a2",
      pk: 4,
      role: "assistant",
      content: "第二答",
      status: "complete",
    },
  ]

  it("takes the last prompt and the reply that follows it", () => {
    const turn = currentTurn(messages)
    expect(turn.prompt?.id).toBe("u2")
    expect(turn.reply?.id).toBe("a2")
  })

  it("has no reply while the last prompt is still unanswered", () => {
    const turn = currentTurn(messages.slice(0, 3))
    expect(turn.prompt?.id).toBe("u2")
    expect(turn.reply).toBeNull()
  })
})

describe("canRegenerateReply", () => {
  const messages: ChatMessage[] = [
    { id: "u1", pk: 1, role: "user", content: "第一问", status: "complete" },
    {
      id: "a1",
      pk: 2,
      role: "assistant",
      content: "第一答",
      status: "complete",
    },
    { id: "u2", pk: 3, role: "user", content: "第二问", status: "complete" },
    {
      id: "a2",
      pk: 4,
      role: "assistant",
      content: "第二答",
      status: "complete",
    },
  ]

  it("only allows the reply of the current turn", () => {
    expect(canRegenerateReply(messages, "a2")).toBe(true)
    expect(canRegenerateReply(messages, "a1")).toBe(false)
  })

  it("drops the direct regenerate when the current prompt has no reply", () => {
    expect(canRegenerateReply(messages.slice(0, 3), "a1")).toBe(false)
  })

  it("drops the direct regenerate for a reply that is not persisted", () => {
    expect(
      canRegenerateReply(
        [
          { ...messages[2]!, pk: undefined },
          { ...messages[3]!, pk: undefined },
        ],
        "a2"
      )
    ).toBe(false)
  })
})

describe("regenerateRoute", () => {
  const messages: ChatMessage[] = [
    { id: "u1", pk: 1, role: "user", content: "第一问", status: "complete" },
    {
      id: "a1",
      pk: 2,
      role: "assistant",
      content: "第一答",
      status: "complete",
    },
    { id: "u2", pk: 3, role: "user", content: "第二问", status: "complete" },
    {
      id: "a2",
      pk: 4,
      role: "assistant",
      content: "第二答",
      status: "complete",
    },
  ]

  it("regenerates the reply of the current turn in place", () => {
    expect(regenerateRoute(messages, "a2")).toBe("in-place")
  })

  it("regenerates a historical reply in a new branch", () => {
    expect(regenerateRoute(messages, "a1")).toBe("branch")
  })

  it("regenerates in a new branch when the conversation runs in coding mode", () => {
    expect(regenerateRoute(messages, "a2", { coding: true })).toBe("branch")
  })

  it("drops replies that were never persisted", () => {
    expect(
      regenerateRoute(
        [
          { ...messages[2]!, pk: undefined },
          { ...messages[3]!, pk: undefined },
        ],
        "a2"
      )
    ).toBeNull()
  })
})

describe("canRegenerateMessage", () => {
  const messages: ChatMessage[] = [
    { id: "u1", pk: 1, role: "user", content: "你好", status: "complete" },
    {
      id: "a1",
      pk: 2,
      role: "assistant",
      content: "在的",
      status: "complete",
    },
    { id: "u2", pk: 3, role: "user", content: "继续", status: "complete" },
    {
      id: "a2",
      pk: 4,
      role: "assistant",
      content: "好的",
      status: "complete",
    },
  ]

  it("only allows the last user message", () => {
    expect(canRegenerateMessage(messages, 3)).toBe(true)
    expect(canRegenerateMessage(messages, 4)).toBe(false)
    expect(canRegenerateMessage(messages, 2)).toBe(false)
    expect(
      canRegenerateMessage(
        [
          { id: "u1", pk: 1, role: "user", content: "问题" },
          { id: "a1", pk: 2, role: "assistant", content: "回答" },
        ],
        2
      )
    ).toBe(false)
  })

  it("allows editing the last user message after its assistant reply", () => {
    expect(canRegenerateMessage(messages, 3, "修改的问题")).toBe(true)
    expect(canRegenerateMessage(messages, 1, "修改的问题")).toBe(false)
    expect(canRegenerateMessage(messages, 3, " ")).toBe(false)
    expect(canRegenerateMessage(messages, 99, "修改的问题")).toBe(false)
    expect(
      canRegenerateMessage(
        [
          ...messages.slice(0, 2),
          {
            ...messages[2]!,
            attachments: [
              {
                id: "file",
                name: "image.png",
                mime: "image/png",
                size: 1,
                data: "image",
                kind: "image",
              },
            ],
          },
          messages[3]!,
        ],
        3,
        "修改的问题"
      )
    ).toBe(false)
  })

  it("rejects unknown or missing pk", () => {
    expect(canRegenerateMessage(messages, null)).toBe(false)
    expect(canRegenerateMessage(messages, 99)).toBe(false)
    expect(canRegenerateMessage(messages, 0)).toBe(false)
    expect(canRegenerateMessage(messages, 1.5)).toBe(false)
    expect(canRegenerateMessage([], 1)).toBe(false)
  })

  it("rejects non-persisted ids when editing the last user message", () => {
    const last = messages[2]!
    expect(
      editableUserMessage(
        [...messages.slice(0, 2), { ...last, pk: 0 }, messages[3]!],
        last.id
      )
    ).toBeNull()
    expect(
      editableUserMessage(
        [...messages.slice(0, 2), { ...last, pk: 1.5 }, messages[3]!],
        last.id
      )
    ).toBeNull()
  })
})

describe("messagesAfterRegenerate", () => {
  it("keeps the edited user text and drops later assistant turns", () => {
    const pending: ChatMessage = {
      id: "pending",
      role: "assistant",
      content: "",
      status: "streaming",
    }
    const next = messagesAfterRegenerate(
      [
        {
          id: "u1",
          pk: 11,
          role: "user",
          content: "旧的",
          status: "complete",
        },
        { id: "a1", role: "assistant", content: "先前", status: "complete" },
      ],
      11,
      pending,
      "新的问题"
    )
    expect(next).toEqual([
      {
        id: "u1",
        pk: 11,
        role: "user",
        content: "新的问题",
        status: "complete",
      },
      pending,
    ])
  })

  it("keeps the current transcript when an action targets a stale message", () => {
    const current: ChatMessage[] = [
      {
        id: "u1",
        pk: 11,
        role: "user",
        content: "问题",
        status: "complete",
      },
      {
        id: "a1",
        pk: 12,
        role: "assistant",
        content: "回答",
        status: "complete",
      },
      {
        id: "u2",
        pk: 13,
        role: "user",
        content: "后续问题",
        status: "complete",
      },
      {
        id: "a2",
        pk: 14,
        role: "assistant",
        content: "后续回答",
        status: "complete",
      },
    ]
    const pending: ChatMessage = {
      id: "pending",
      role: "assistant",
      content: "",
      status: "streaming",
    }

    expect(messagesAfterRegenerate(current, 99, pending)).toBe(current)
    expect(messagesAfterRegenerate(current, 11, pending, "历史问题")).toBe(
      current
    )
  })
})

describe("regenerateTargetPk", () => {
  const messages: ChatMessage[] = [
    { id: "u1", pk: 11, role: "user", content: "问题", status: "complete" },
    {
      id: "a1",
      pk: 12,
      role: "assistant",
      content: "回答",
      status: "complete",
    },
  ]

  it("maps an assistant action to the preceding user message", () => {
    expect(regenerateTargetPk(messages, 12)).toBe(11)
    expect(regenerateTargetPk(messages, 11)).toBe(11)
  })

  it("rejects a target without a persisted user message", () => {
    expect(
      regenerateTargetPk(
        [
          {
            id: "a1",
            pk: 12,
            role: "assistant",
            content: "回答",
            status: "complete",
          },
        ],
        12
      )
    ).toBeNull()
  })
})

describe("shouldSyncConversationAfterRun", () => {
  const user: ChatMessage = {
    id: "u1",
    role: "user",
    content: "hi",
    status: "complete",
  }

  it("syncs a completed assistant reply", () => {
    const messages: ChatMessage[] = [
      user,
      { id: "a1", role: "assistant", content: "好", status: "complete" },
    ]
    expect(shouldSyncConversationAfterRun(messages)).toBe(true)
    expect(shouldAnnounceConversationAfterRun(messages)).toBe(true)
  })

  it("still syncs after an error so backend error fields can apply", () => {
    const messages: ChatMessage[] = [
      user,
      {
        id: "a1",
        role: "assistant",
        content: "",
        status: "error",
        error: "模型不可用",
      },
    ]
    expect(shouldSyncConversationAfterRun(messages)).toBe(true)
    expect(shouldAnnounceConversationAfterRun(messages)).toBe(false)
  })

  it("does not sync while a write tool is waiting for approval", () => {
    expect(
      shouldSyncConversationAfterRun([
        user,
        {
          id: "a1",
          role: "assistant",
          content: "",
          status: "awaiting-approval",
          tools: [
            {
              id: "t1",
              name: "mcp_files_write",
              args: "{}",
              pendingApproval: true,
            },
          ],
        },
      ])
    ).toBe(false)
  })
})

describe("resolveChatPaneConversationId", () => {
  it("keeps the selected conversation when the chat route is hidden", () => {
    expect(resolveChatPaneConversationId("conv-1", "conv-1", null)).toBe(
      "conv-1"
    )
  })

  it("does not restore a stale draft from the url", () => {
    expect(resolveChatPaneConversationId("draft-3", null, "conv-1")).toBeNull()
  })
})

describe("shouldShowHistoryLoading", () => {
  it("does not cover a new conversation", () => {
    expect(shouldShowHistoryLoading(null, "loading")).toBe(false)
    expect(shouldShowHistoryLoading(null, "idle")).toBe(false)
  })

  it("only covers an existing conversation while its history is fetching", () => {
    expect(shouldShowHistoryLoading("conv-1", "loading")).toBe(true)
    expect(shouldShowHistoryLoading("conv-1", "idle")).toBe(false)
    expect(shouldShowHistoryLoading("conv-1", "streaming")).toBe(false)
  })
})

describe("mergeRecentConversationMessages", () => {
  const message = (
    id: string,
    role: "user" | "assistant",
    pk?: number
  ): ChatMessage => ({
    id,
    role,
    content: id,
    status: "complete",
    ...(pk == null ? {} : { pk }),
  })
  const older = [
    message("older-user", "user"),
    message("older-answer", "assistant"),
  ]
  it("retains loaded earlier pages when refreshing only recent messages", () => {
    const recent = [
      message("user", "user", 3),
      message("answer", "assistant", 4),
    ]
    expect(
      mergeRecentConversationMessages(recent, [...older, ...recent])
    ).toEqual([...older, ...recent])
  })
  it("replaces a temporary user ID together with its matching assistant", () => {
    const current = [
      ...older,
      message("temporary-user", "user"),
      message("answer", "assistant"),
    ]
    const refreshed = [
      message("saved-user", "user", 3),
      message("answer", "assistant", 4),
    ]
    expect(
      mergeRecentConversationMessages(refreshed, current).map((item) => item.id)
    ).toEqual(["older-user", "older-answer", "saved-user", "answer"])
  })
  it("preserves the preceding user when the recent page starts mid-turn", () => {
    const current = [
      ...older,
      message("user", "user", 3),
      message("answer", "assistant", 4),
    ]
    expect(
      mergeRecentConversationMessages(
        [message("answer", "assistant", 4)],
        current
      )
    ).toEqual(current)
  })
  it("matches persisted keys even when both message IDs changed", () => {
    const current = [
      ...older,
      message("temp-user", "user", 3),
      message("temp-answer", "assistant", 4),
    ]
    const refreshed = [
      message("saved-user", "user", 3),
      message("saved-answer", "assistant", 4),
    ]
    expect(
      mergeRecentConversationMessages(refreshed, current).map((item) => item.id)
    ).toEqual(["older-user", "older-answer", "saved-user", "saved-answer"])
  })
  it("keeps the live transcript if persistence has not returned messages yet", () => {
    expect(mergeRecentConversationMessages([], older)).toEqual(older)
  })
})
