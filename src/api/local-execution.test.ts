import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { apiRequest } from "@/api/http"
import { withLocalAcpStream } from "@/api/local-acp"
import { withExecutionStream } from "@/api/local-execution"
import { toForwardedPropsApi } from "@/api/chat-body"
import type { ForwardedProps } from "@/lib/types"
import type {
  ExecutionPreparation,
  PreparedExecution,
} from "@/shared/execution"
import { currentAccountSource } from "@/lib/account-source"
import { bindProjectConversation } from "@/lib/project-workspace"

vi.mock("@/api/http", () => ({ apiRequest: vi.fn() }))
vi.mock("@/api/local-acp", () => ({ withLocalAcpStream: vi.fn() }))
vi.mock("@/lib/account-source", () => ({ currentAccountSource: vi.fn() }))
vi.mock("@/lib/project-workspace", () => ({ bindProjectConversation: vi.fn() }))
const stopExecution = vi.fn(async () => {})
const startExecution = vi.fn(async () => {})
const prepareExecution = vi.fn(async (): Promise<ExecutionPreparation> => ({
  backend: "local" as const,
  preparationId: "prepared",
  cwd: "/home/demo/fbabuddy",
  capabilities: [],
}))
const workspace = vi.fn(async () => ({
  environment: { backend: "local" },
}))
const props: ForwardedProps = {
  provider_id: 1,
  model_id: "test",
  agent_mode: "coding",
  acp_runner: false,
  permission_mode: "auto",
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal("window", {
    location: { href: "http://localhost:4174/" },
    buddyDesktop: {
      prepareExecution,
      startExecution,
      stopExecution,
      workspace,
    },
  })
  vi.mocked(apiRequest).mockImplementation(async (path) =>
    path === "/execution/options"
      ? { default_backend: "local", capabilities: [] }
      : { bridge_id: "a".repeat(32), ticket: "ticket".repeat(8) }
  )
})
afterEach(() => vi.unstubAllGlobals())

it("uses a separate authenticated desktop bridge and closes it after the stream", async () => {
  const request = vi.fn(async (forwarded: ForwardedProps) => {
    expect(toForwardedPropsApi(forwarded)).toMatchObject({
      executionBackend: "local",
      executionBridgeId: "a".repeat(32),
    })
    return new Response("done")
  })
  const response = await withExecutionStream("conversation-1", props, request)
  expect(await response.text()).toBe("done")
  expect(prepareExecution).toHaveBeenCalledWith(
    "conversation-1",
    { backend: "local", capabilities: [] },
    undefined
  )
  expect(apiRequest).toHaveBeenCalledWith(
    "/execution/bridges",
    expect.objectContaining({
      body: JSON.stringify({
        backend: "local",
        cwd: "/home/demo/fbabuddy",
        permission_mode: "auto",
        capabilities: [],
      }),
    })
  )
  expect(startExecution).toHaveBeenCalledWith(
    expect.objectContaining({
      preparationId: "prepared",
      permissionMode: "auto",
    })
  )
  expect(stopExecution).toHaveBeenCalledWith("a".repeat(32))
})

it("preserves the ACP path and applies the work location without launching coding execution", async () => {
  const source = { accountId: "42", backendUrl: "http://localhost/api/v1" }
  vi.mocked(currentAccountSource).mockReturnValueOnce(source)
  const request = vi.fn(async () => new Response("done"))
  await withExecutionStream("c1", { ...props, acp_runner: true }, request)
  expect(withLocalAcpStream).toHaveBeenCalledWith(
    { ...props, acp_runner: true },
    request,
    undefined,
    "c1",
    source,
    undefined
  )
  await withExecutionStream("c1", { ...props, agent_mode: "work" }, request)
  expect(prepareExecution).not.toHaveBeenCalled()
  expect(request).toHaveBeenCalledWith({
    ...props,
    agent_mode: "work",
    execution_backend: "local",
  })
  expect(workspace).toHaveBeenCalledWith(
    expect.objectContaining({ action: "environment", conversationId: "c1" })
  )
})

it("sends work requests to the selected cloud location", async () => {
  workspace.mockResolvedValueOnce({ environment: { backend: "sandbox" } })
  const request = vi.fn(async () => new Response("done"))
  await withExecutionStream(
    "cloud-work",
    { ...props, agent_mode: "work" },
    request
  )
  expect(request).toHaveBeenCalledWith(
    expect.objectContaining({ execution_backend: "sandbox" })
  )
  expect(prepareExecution).not.toHaveBeenCalled()
  expect(startExecution).not.toHaveBeenCalled()
})

it("sends coding sandbox requests without starting local execution", async () => {
  prepareExecution.mockResolvedValueOnce({
    backend: "sandbox",
    sandboxProvider: "e2b",
  })
  const request = vi.fn(async () => new Response("done"))
  const response = await withExecutionStream("sandbox-coding", props, request)
  expect(await response.text()).toBe("done")
  expect(request).toHaveBeenCalledWith(
    expect.objectContaining({
      execution_backend: "sandbox",
      sandbox_provider: "e2b",
    })
  )
  expect(apiRequest).not.toHaveBeenCalledWith(
    "/execution/bridges",
    expect.anything()
  )
  expect(startExecution).not.toHaveBeenCalled()
  expect(stopExecution).not.toHaveBeenCalled()
})

it("binds the selected project folder before preparing local and ACP execution", async () => {
  const request = vi.fn(async () => new Response("done"))
  const response = await withExecutionStream(
    "project-chat",
    props,
    request,
    undefined,
    undefined,
    7
  )
  await response.text()
  expect(bindProjectConversation).toHaveBeenCalledWith("project-chat", 7)
  expect(
    vi.mocked(bindProjectConversation).mock.invocationCallOrder[0]
  ).toBeLessThan(prepareExecution.mock.invocationCallOrder[0]!)
  await withExecutionStream(
    "project-acp",
    { ...props, acp_runner: true },
    request,
    undefined,
    undefined,
    7
  )
  expect(bindProjectConversation).toHaveBeenLastCalledWith("project-acp", 7)
  expect(
    vi.mocked(bindProjectConversation).mock.invocationCallOrder[1]
  ).toBeLessThan(vi.mocked(withLocalAcpStream).mock.invocationCallOrder[0]!)
})

it("stops before creating execution bridges when the project folder is unavailable", async () => {
  vi.mocked(bindProjectConversation).mockRejectedValueOnce(
    new Error("project folder missing")
  )
  const request = vi.fn(async () => new Response("done"))
  await expect(
    withExecutionStream("project-chat", props, request, undefined, undefined, 7)
  ).rejects.toThrow("project folder missing")
  expect(prepareExecution).not.toHaveBeenCalled()
  expect(startExecution).not.toHaveBeenCalled()
  expect(request).not.toHaveBeenCalled()
})

it("requires the desktop interface for every configured execution backend", async () => {
  vi.stubGlobal("window", { location: { href: "http://localhost/" } })
  const request = vi.fn(async () => new Response("remote"))
  for (const backend of ["local", "sandbox"] as const) {
    await expect(
      withExecutionStream(
        "c1",
        { ...props, execution_backend: backend },
        request
      )
    ).rejects.toThrow("桌面执行接口未就绪")
  }
  expect(request).not.toHaveBeenCalled()
  expect(startExecution).not.toHaveBeenCalled()
})

it("cleans up a failed request and preserves location without desktop execution bridges in ACP and work payloads", async () => {
  await expect(
    withExecutionStream("c1", props, async () => {
      throw new Error("failure")
    })
  ).rejects.toThrow("failure")
  expect(stopExecution).toHaveBeenCalled()
  for (const context of [
    { acp_runner: true },
    { agent_mode: "work" as const },
  ]) {
    const encoded = toForwardedPropsApi({
      ...props,
      execution_backend: "local",
      execution_bridge_id: "private",
      ...context,
    })
    expect(encoded).toHaveProperty("executionBackend", "local")
    expect(encoded).not.toHaveProperty("executionBridgeId")
  }
})

it.each([
  { server: true, desktop: true, negotiated: true },
  { server: true, desktop: false, negotiated: false },
  { server: false, desktop: true, negotiated: false },
  { server: false, desktop: false, negotiated: false },
])(
  "negotiates tests only with server=$server and desktop=$desktop",
  async ({ server, desktop, negotiated }) => {
    vi.mocked(apiRequest).mockResolvedValueOnce({
      default_backend: "local",
      capabilities: server ? ["run_tests_v1"] : [],
    })
    prepareExecution.mockResolvedValueOnce({
      backend: "local",
      preparationId: "prepared",
      cwd: "/home/demo/fbabuddy",
      capabilities: desktop ? ["run_tests_v1"] : [],
    })
    const request = vi.fn(async () => new Response("done"))
    const response = await withExecutionStream("c1", props, request)
    expect(await response.text()).toBe("done")
    const call = vi
      .mocked(apiRequest)
      .mock.calls.find(([path]) => path === "/execution/bridges")!
    const body = JSON.parse(String(call[1]?.body))
    expect(body.capabilities).toEqual(negotiated ? ["run_tests_v1"] : [])
    expect(request).toHaveBeenCalledOnce()
    expect(startExecution).toHaveBeenCalledOnce()
  }
)

it("negotiates only the intersection of recognized desktop and server capabilities", async () => {
  vi.mocked(apiRequest).mockResolvedValueOnce({
    default_backend: "local",
    capabilities: ["run_tests_v1", "workspace_git_v1"],
  })
  prepareExecution.mockResolvedValueOnce({
    backend: "local",
    preparationId: "prepared",
    cwd: "/home/demo/fbabuddy",
    capabilities: ["workspace_git_v1"],
  })
  const response = await withExecutionStream(
    "c1",
    props,
    vi.fn(async () => new Response("done"))
  )
  await response.text()
  const call = vi
    .mocked(apiRequest)
    .mock.calls.find(([path]) => path === "/execution/bridges")!
  expect(JSON.parse(String(call[1]?.body)).capabilities).toEqual([
    "workspace_git_v1",
  ])
})

it.each([undefined, null, "run_tests_v1", {}, ["run_tests_v1", null], [1]])(
  "does not start execution when server capabilities are invalid %j",
  async (capabilities) => {
    vi.mocked(apiRequest).mockResolvedValueOnce({
      default_backend: "local",
      capabilities,
    })
    const request = vi.fn(async () => new Response("done"))
    await expect(withExecutionStream("c1", props, request)).rejects.toThrow(
      "无效的默认配置"
    )
    expect(prepareExecution).not.toHaveBeenCalled()
    expect(startExecution).not.toHaveBeenCalled()
    expect(request).not.toHaveBeenCalled()
    expect(apiRequest).not.toHaveBeenCalledWith(
      "/execution/bridges",
      expect.anything()
    )
  }
)

it.each([undefined, null, "run_tests_v1", {}, ["run_tests_v1", null], [1]])(
  "does not create a bridge when desktop capabilities are invalid %j",
  async (capabilities) => {
    prepareExecution.mockResolvedValueOnce({
      backend: "local",
      preparationId: "prepared",
      cwd: "/home/demo/fbabuddy",
      capabilities,
    } as unknown as PreparedExecution)
    const request = vi.fn(async () => new Response("done"))
    await expect(withExecutionStream("c1", props, request)).rejects.toThrow(
      "无效的协议能力"
    )
    expect(startExecution).not.toHaveBeenCalled()
    expect(request).not.toHaveBeenCalled()
    expect(apiRequest).not.toHaveBeenCalledWith(
      "/execution/bridges",
      expect.anything()
    )
  }
)
