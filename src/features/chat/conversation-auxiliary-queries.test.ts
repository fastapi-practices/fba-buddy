import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  getConversationPlan,
  pendingInputRequests,
} from "@/api/chat-interactions"
import { listConversationFollowUps } from "@/api/follow-ups"
import { createAppQueryClient } from "@/app/query-client"
import {
  conversationFollowUpsQueryOptions,
  conversationInputRequestsQueryOptions,
  conversationPlanQueryOptions,
} from "./conversation-auxiliary-queries"

vi.mock("@/api/chat-interactions", () => ({
  getConversationPlan: vi.fn(),
  pendingInputRequests: vi.fn(),
}))
vi.mock("@/api/follow-ups", () => ({
  listConversationFollowUps: vi.fn(),
}))

const plan = vi.mocked(getConversationPlan)
const inputRequests = vi.mocked(pendingInputRequests)
const followUps = vi.mocked(listConversationFollowUps)

async function visitConversation(
  client: ReturnType<typeof createAppQueryClient>,
  conversationId: string
) {
  await Promise.all([
    client.fetchQuery(conversationFollowUpsQueryOptions(conversationId, false)),
    client.fetchQuery(conversationPlanQueryOptions(conversationId, true)),
    client.fetchQuery(
      conversationInputRequestsQueryOptions(conversationId, true)
    ),
  ])
}

beforeEach(() => {
  vi.resetAllMocks()
  plan.mockResolvedValue({ items: [] })
  inputRequests.mockResolvedValue({ items: [] })
  followUps.mockResolvedValue({ items: [] })
})

describe("conversation auxiliary queries", () => {
  it("reuses cached data when returning to a conversation", async () => {
    const client = createAppQueryClient()

    await visitConversation(client, "first")
    await visitConversation(client, "second")
    await visitConversation(client, "first")

    expect(plan).toHaveBeenCalledTimes(2)
    expect(inputRequests).toHaveBeenCalledTimes(2)
    expect(followUps).toHaveBeenCalledTimes(2)
  })

  it("waits for the conversation detail before loading auxiliary state", () => {
    expect(
      conversationFollowUpsQueryOptions("first", false, false).enabled
    ).toBe(false)
    expect(conversationPlanQueryOptions("first", false).enabled).toBe(false)
    expect(conversationInputRequestsQueryOptions("first", false).enabled).toBe(
      false
    )
  })
})
