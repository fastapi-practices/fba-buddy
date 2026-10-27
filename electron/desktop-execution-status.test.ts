import path from "node:path"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import type { ExecutionSettings } from "../src/shared/execution"
import type { ManagedRuntimeStatuses } from "./runtimes"
import { desktopExecutionStatus } from "./desktop-execution-status"

const mocks = vi.hoisted(() => ({
  capabilities: vi.fn(),
  createRuntimeManager: vi.fn(),
  status: vi.fn(),
  install: vi.fn(),
  download: vi.fn(),
  findExecutable: vi.fn(),
  executeBounded: vi.fn(),
  fetch: vi.fn(),
}))
vi.mock("./execution-isolation", () => ({
  getExecutionCapabilities: mocks.capabilities,
  findExecutable: mocks.findExecutable,
  executionEnvironment: vi.fn(),
}))
vi.mock("./execution-process", () => ({
  executeBounded: mocks.executeBounded,
}))
vi.mock("./runtimes", () => ({
  createRuntimeManager: mocks.createRuntimeManager,
  downloadRuntimeArchive: mocks.download,
}))

const config: ExecutionSettings = {
  backend: "local",
  workspaceDir: "/project",
  workspaceMode: "custom",
}
const paths = {
  home: "/home/test",
  documents: "/home/test/Documents",
  runtimeDirectory: "/app/runtimes",
}
const managed: ManagedRuntimeStatuses = {
  node: {
    kind: "node",
    supported: true,
    installed: true,
    version: "24.9.0",
    executable: "/app/runtimes/node/bin/node",
    message: "",
  },
  python: {
    kind: "python",
    supported: true,
    installed: false,
    version: "3.13.7",
    message: "Not installed",
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal("fetch", mocks.fetch)
  mocks.createRuntimeManager.mockReturnValue({
    status: mocks.status,
    install: mocks.install,
  })
  mocks.status.mockResolvedValue(managed)
  mocks.capabilities.mockResolvedValue({
    platform: "darwin",
    local: { available: true, isolation: "seatbelt", message: "" },
  })
})
afterEach(() => vi.unstubAllGlobals())

it("reads only app-managed Python and Node status without installing or probing system runtimes", async () => {
  const result = await desktopExecutionStatus(config, paths)

  expect(mocks.createRuntimeManager).toHaveBeenCalledExactlyOnceWith({
    directory: paths.runtimeDirectory,
  })
  expect(mocks.capabilities).toHaveBeenCalledExactlyOnceWith({
    runtimeDirectory: paths.runtimeDirectory,
  })
  expect(mocks.status).toHaveBeenCalledOnce()
  expect(result).toEqual({
    config,
    homeWorkspace: path.join(paths.home, ".fbabuddy"),
    documentsWorkspace: path.join(paths.documents, "FbaBuddy"),
    local: { available: true, reason: "", kind: "seatbelt" },
    runtimes: {
      python: {
        available: false,
        path: undefined,
        version: undefined,
        reason: "Not installed",
        source: "managed",
      },
      node: {
        available: true,
        path: managed.node.executable,
        version: managed.node.version,
        reason: "",
        source: "managed",
      },
    },
  })
  expect(Object.keys(result.runtimes).sort()).toEqual(["node", "python"])
  for (const effect of [
    mocks.install,
    mocks.download,
    mocks.fetch,
    mocks.findExecutable,
    mocks.executeBounded,
  ])
    expect(effect).not.toHaveBeenCalled()
})

it("preserves managed-runtime failure reasons and unavailable local capabilities", async () => {
  mocks.status.mockResolvedValue({
    ...managed,
    node: {
      kind: "node",
      supported: true,
      installed: false,
      version: "24.9.0",
      message: "Managed runtime integrity check failed",
    },
  })
  mocks.capabilities.mockResolvedValue({
    platform: "darwin",
    local: {
      available: false,
      isolation: null,
      message: "Install the managed Node.js runtime",
    },
  })

  const result = await desktopExecutionStatus(config, paths)

  expect(result.runtimes.node).toEqual({
    available: false,
    path: undefined,
    version: undefined,
    reason: "Managed runtime integrity check failed",
    source: "managed",
  })
  expect(result.local).toEqual({
    available: false,
    reason: "Install the managed Node.js runtime",
    kind: undefined,
  })
  expect(mocks.install).not.toHaveBeenCalled()
})
