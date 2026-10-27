import { afterEach, expect, it, vi } from "vitest"
import { apiRequest } from "@/api/http"
import { getExecutionDefaults } from "./execution-options"

vi.mock("@/api/http", () => ({ apiRequest: vi.fn() }))
afterEach(() => vi.resetAllMocks())

it("accepts only the two supported backend defaults", async () => {
  for (const backend of ["local", "sandbox"] as const) {
    vi.mocked(apiRequest).mockResolvedValue({
      default_backend: backend,
      capabilities: [],
    })
    expect(await getExecutionDefaults()).toEqual({ backend, capabilities: [] })
  }
  vi.mocked(apiRequest).mockResolvedValue({
    default_backend: "unknown",
    capabilities: [],
  })
  expect(await getExecutionDefaults()).toBeUndefined()
  vi.mocked(apiRequest).mockRejectedValue(new Error("offline"))
  expect(await getExecutionDefaults()).toBeUndefined()
})

it("preserves cancellation rather than treating it as missing defaults", async () => {
  const controller = new AbortController()
  controller.abort()
  vi.mocked(apiRequest).mockRejectedValue(new Error("cancelled"))
  await expect(getExecutionDefaults(controller.signal)).rejects.toThrow()
})

it("advertises only recognized execution protocol capabilities", async () => {
  vi.mocked(apiRequest).mockResolvedValue({
    default_backend: "local",
    capabilities: [
      "unknown",
      "run_tests_v1",
      "workspace_git_v1",
      "command_v1",
      "run_tests_v1",
    ],
  })
  expect(await getExecutionDefaults()).toEqual({
    backend: "local",
    capabilities: ["run_tests_v1", "workspace_git_v1", "command_v1"],
  })
  for (const capabilities of [[], ["unknown"]]) {
    vi.mocked(apiRequest).mockResolvedValue({
      default_backend: "local",
      capabilities,
    })
    expect(await getExecutionDefaults()).toEqual({
      backend: "local",
      capabilities: [],
    })
  }
})

it.each([undefined, null, "run_tests_v1", {}, ["run_tests_v1", null], [1]])(
  "rejects missing or invalid execution capabilities %j",
  async (capabilities) => {
    vi.mocked(apiRequest).mockResolvedValue({
      default_backend: "local",
      capabilities,
    })
    expect(await getExecutionDefaults()).toBeUndefined()
  }
)
