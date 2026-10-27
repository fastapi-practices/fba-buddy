import { afterEach, expect, it, vi } from "vitest"

import { apiRequest } from "@/api/http"
import {
  createMyProvider,
  deleteMyProviders,
  getMyProvider,
  listMyProviderModels,
  listMyProviders,
  updateMyProvider,
} from "./providers"

vi.mock("@/api/http", () => ({ apiRequest: vi.fn() }))

afterEach(() => vi.resetAllMocks())

it("uses only the current-user provider endpoints and wire body", async () => {
  const body = {
    name: "My OpenAI",
    type: 0 as const,
    api_key: "sk-new",
    api_host: null,
    status: 1,
    remark: null,
  }
  vi.mocked(apiRequest).mockResolvedValue(null)

  await listMyProviders()
  await getMyProvider(7)
  await listMyProviderModels(7)
  await createMyProvider(body)
  await updateMyProvider(7, { ...body, api_key: "" })
  await deleteMyProviders([7, 8])

  expect(vi.mocked(apiRequest).mock.calls).toEqual([
    ["/providers/me"],
    ["/providers/me/7"],
    ["/providers/me/7/models"],
    ["/providers/me", { method: "POST", body: JSON.stringify(body) }],
    [
      "/providers/me/7",
      { method: "PUT", body: JSON.stringify({ ...body, api_key: "" }) },
    ],
    [
      "/providers/me",
      { method: "DELETE", body: JSON.stringify({ pks: [7, 8] }) },
    ],
  ])
})
