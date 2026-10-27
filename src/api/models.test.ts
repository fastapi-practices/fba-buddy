import { afterEach, describe, expect, it, vi } from "vitest"

import { apiRequest } from "@/api/http"
import {
  createMyModel,
  defaultModelForKind,
  deleteMyModel,
  getMyModel,
  listMyModels,
  syncMyModelArchitecture,
  updateMyModel,
} from "@/api/models"
import type { ModelOptions, ModelWriteBody } from "@/lib/types"

vi.mock("@/api/http", () => ({ apiRequest: vi.fn() }))

afterEach(() => vi.resetAllMocks())

const options: ModelOptions = {
  providers: [],
  default_candidates: {
    chat: [1],
    embedding: [],
    image: [3],
  },
  default_models: {
    chat: {
      id: 1,
      provider_id: 2,
      provider_name: "OpenAI",
      provider_type: 0,
      model_id: "gpt-5.2",
      kind: "chat",
      status: 1,
      created_time: "2026-10-26T00:00:00Z",
      updated_time: null,
    },
    image: {
      id: 3,
      provider_id: 5,
      provider_name: "OpenAI",
      provider_type: 0,
      model_id: "gpt-image-2",
      kind: "image",
      status: 1,
      created_time: "2026-10-26T00:00:00Z",
      updated_time: null,
    },
    embedding: null,
  },
}

describe("defaultModelForKind", () => {
  it("reads chat, image, and missing kinds from default_models", () => {
    expect(defaultModelForKind(options, "chat")?.model_id).toBe("gpt-5.2")
    expect(defaultModelForKind(options, "image")?.model_id).toBe("gpt-image-2")
    expect(defaultModelForKind(options, "embedding")).toBeNull()
    expect(defaultModelForKind(undefined, "chat")).toBeNull()
  })
})

describe("current-user model API", () => {
  it("uses the latest CRUD and architecture sync endpoints", async () => {
    const body: ModelWriteBody = {
      provider_id: 2,
      model_id: "gpt-5.2",
      name: "GPT 5.2",
      kind: "chat",
      capabilities: ["tools", "thinking"],
      input_modalities: ["text", "image"],
      thinking_policy: {
        levels: ["low", "medium", "high"],
        default_level: "medium",
        can_disable: true,
      },
      context_window: 400000,
      max_output_tokens: 128000,
      sort: 1,
      status: 1,
      remark: null,
    }
    vi.mocked(apiRequest).mockResolvedValue(null)

    await listMyModels()
    await getMyModel(11)
    await createMyModel(body)
    await updateMyModel(11, body)
    await deleteMyModel(11)
    await syncMyModelArchitecture()

    expect(vi.mocked(apiRequest).mock.calls).toEqual([
      ["/models/me"],
      ["/models/me/11"],
      ["/models/me", { method: "POST", body: JSON.stringify(body) }],
      ["/models/me/11", { method: "PUT", body: JSON.stringify(body) }],
      ["/models/me/11", { method: "DELETE" }],
      ["/models/me/architecture/sync", { method: "POST" }],
    ])
  })
})
