import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getConversation } from "@/api/conversations"
import { bindProjectConversation } from "@/lib/project-workspace"
import { useWorkspaceGit } from "./use-workspace-git"
import type { WorkspaceGitDiff, WorkspaceGitStatus } from "@/shared/workspace"

const hooks = vi.hoisted(() => ({
  values: [] as unknown[],
  refs: [] as { current: unknown }[],
  callbacks: [] as { callback: unknown; dependencies: unknown[] }[],
  effects: [] as {
    effect: () => void | (() => void)
    dependencies: unknown[]
    cleanup?: void | (() => void)
    changed: boolean
  }[],
  valueIndex: 0,
  refIndex: 0,
  callbackIndex: 0,
  effectIndex: 0,
  sourceKey: "account:1:0",
  source: { backendUrl: "https://buddy.test/api/v1", accountId: "1" },
  translate: (key: string) => key,
  same: (a: unknown[], b: unknown[]) =>
    a.length === b.length &&
    a.every((value, index) => Object.is(value, b[index])),
}))
vi.mock("react", () => ({
  useState: (initial: unknown) => {
    const i = hooks.valueIndex++
    if (i >= hooks.values.length) hooks.values[i] = initial
    return [
      hooks.values[i],
      (value: unknown) => {
        hooks.values[i] =
          typeof value === "function" ? value(hooks.values[i]) : value
      },
    ]
  },
  useRef: (initial: unknown) => {
    const i = hooks.refIndex++
    return (hooks.refs[i] ??= { current: initial })
  },
  useEffect: (effect: () => void | (() => void), dependencies: unknown[]) => {
    const i = hooks.effectIndex++
    const previous = hooks.effects[i]
    hooks.effects[i] = {
      effect,
      dependencies,
      cleanup: previous?.cleanup,
      changed: !previous || !hooks.same(previous.dependencies, dependencies),
    }
  },
  useCallback: (callback: unknown, dependencies: unknown[]) => {
    const i = hooks.callbackIndex++
    const previous = hooks.callbacks[i]
    if (!previous || !hooks.same(previous.dependencies, dependencies))
      hooks.callbacks[i] = { callback, dependencies }
    return hooks.callbacks[i].callback
  },
}))
vi.mock("@/hooks/use-t", () => ({ useT: () => hooks.translate }))
vi.mock("@/api/conversations", () => ({ getConversation: vi.fn() }))
vi.mock("@/lib/account-source", () => ({
  currentAccountSource: () => hooks.source,
  dataSourceKey: () => hooks.sourceKey,
}))
vi.mock("@/lib/project-workspace", () => ({ bindProjectConversation: vi.fn() }))

const workspace = vi.fn()
const source = { backendUrl: "https://buddy.test/api/v1", accountId: "1" }
const status: WorkspaceGitStatus = {
  repository: true,
  branch: "main",
  upstream: "origin/main",
  ahead: 2,
  behind: 1,
  entries: [],
}
const diff = (text = "+new"): WorkspaceGitDiff => ({
  repository: true,
  path: null,
  diff: text,
  additions: 1,
  deletions: 0,
  truncated: false,
})
function render({
  projectId,
  conversationId = "conversation",
  chatRunning = false,
  enabled = true,
  panelOpen = enabled,
}: {
  projectId?: number | null
  conversationId?: string | null
  chatRunning?: boolean
  enabled?: boolean
  panelOpen?: boolean
} = {}) {
  hooks.valueIndex =
    hooks.refIndex =
    hooks.callbackIndex =
    hooks.effectIndex =
      0
  // eslint-disable-next-line react-hooks/rules-of-hooks -- 使用隔离的 Hook 状态容器测试异步竞态
  const hook = useWorkspaceGit(
    conversationId,
    source,
    projectId,
    chatRunning,
    enabled,
    panelOpen
  )
  for (const effect of hooks.effects) {
    if (!effect.changed) continue
    if (typeof effect.cleanup === "function") effect.cleanup()
    effect.cleanup = effect.effect()
    effect.changed = false
  }
  return hook
}
async function flushMicrotasks() {
  for (let index = 0; index < 20; index++) await Promise.resolve()
}
function deferred() {
  let resolve!: (value: unknown) => void
  const promise = new Promise((done) => {
    resolve = done
  })
  return { resolve, promise }
}
function readActions() {
  return workspace.mock.calls.map(([request]) => request.action)
}
function unmount() {
  for (const effect of hooks.effects)
    if (typeof effect.cleanup === "function") effect.cleanup()
}

beforeEach(() => {
  hooks.values = []
  hooks.refs = []
  hooks.callbacks = []
  hooks.effects = []
  hooks.valueIndex =
    hooks.refIndex =
    hooks.callbackIndex =
    hooks.effectIndex =
      0
  hooks.sourceKey = "account:1:0"
  hooks.source = source
  vi.mocked(getConversation).mockReset()
  vi.mocked(getConversation).mockResolvedValue({ project_id: null } as never)
  vi.mocked(bindProjectConversation).mockReset()
  workspace
    .mockReset()
    .mockImplementation(async (request) =>
      request.action === "git-diff" ? diff() : status
    )
  vi.stubGlobal("window", { buddyDesktop: { workspace } })
})
afterEach(() => vi.unstubAllGlobals())

describe("workspace Git requests", () => {
  it("does not read a workspace while neither Git surface is open", async () => {
    render({ enabled: false })
    await flushMicrotasks()
    expect(getConversation).not.toHaveBeenCalled()
    expect(bindProjectConversation).not.toHaveBeenCalled()
    expect(workspace).not.toHaveBeenCalled()
    expect(render({ enabled: false }).loading).toBe(false)
  })

  it("loads status and the complete working-tree diff when the sidebar opens", async () => {
    render()
    await flushMicrotasks()
    expect(readActions()).toEqual(["git-status", "git-diff"])
    expect(workspace).toHaveBeenLastCalledWith({
      action: "git-diff",
      conversationId: "conversation",
      source,
    })
    expect(render()).toMatchObject({
      status,
      loading: false,
      aggregate: diff(),
      diffScope: "working-tree",
      diffLoading: false,
      diffError: "",
    })
  })

  it("does not read Git during environment synchronization while both surfaces are closed", async () => {
    const hook = render({ enabled: false })
    await hook.refreshIfOpen()
    await hook.refreshIfOpen()
    await flushMicrotasks()
    expect(getConversation).not.toHaveBeenCalled()
    expect(bindProjectConversation).not.toHaveBeenCalled()
    expect(workspace).not.toHaveBeenCalled()
    render()
    await flushMicrotasks()
    expect(readActions()).toEqual(["git-status", "git-diff"])
  })

  it("refreshes only status when an environment changes with only the commit dialog open", async () => {
    render({ enabled: true, panelOpen: false })
    await flushMicrotasks()
    workspace.mockClear()
    await render({ enabled: true, panelOpen: false }).refreshIfOpen()
    expect(readActions()).toEqual(["git-status"])
  })

  it("supersedes a pending status read after an open workspace changes", async () => {
    const previousWorkspace = deferred()
    workspace.mockReturnValueOnce(previousWorkspace.promise)
    render()
    await flushMicrotasks()
    await render().refreshIfOpen()
    previousWorkspace.resolve({ ...status, branch: "previous-workspace" })
    await flushMicrotasks()
    expect(render()).toMatchObject({ status, aggregate: diff() })
    expect(readActions()).toEqual(["git-status", "git-status", "git-diff"])
  })

  it("loads only status for the commit dialog and adds a diff when the sidebar opens", async () => {
    render({ enabled: true, panelOpen: false })
    await flushMicrotasks()
    expect(readActions()).toEqual(["git-status"])
    render({ enabled: true, panelOpen: true })
    await flushMicrotasks()
    expect(readActions()).toEqual(["git-status", "git-status", "git-diff"])
  })

  it("does not duplicate an explicit refresh when its Git surface opens", async () => {
    const response = deferred()
    workspace.mockReturnValueOnce(response.promise)
    const request = render({ enabled: false }).refresh()
    await flushMicrotasks()
    render()
    await flushMicrotasks()
    expect(readActions()).toEqual(["git-status"])
    response.resolve(status)
    await request
    expect(readActions()).toEqual(["git-status", "git-diff"])
  })

  it("retains the scope and refreshes its complete diff after reopening", async () => {
    render()
    await flushMicrotasks()
    render().setDiffScope("staged")
    await flushMicrotasks()
    render({ enabled: false })
    expect(render({ enabled: false }).diffScope).toBe("staged")
    workspace.mockClear()
    render()
    await flushMicrotasks()
    expect(readActions()).toEqual(["git-status", "git-diff"])
    expect(workspace).toHaveBeenLastCalledWith({
      action: "git-diff",
      conversationId: "conversation",
      source,
      scope: "staged",
    })
  })

  it("binds an existing conversation to its actual project", async () => {
    vi.mocked(getConversation).mockResolvedValue({ project_id: 42 } as never)
    await render({ panelOpen: false }).refresh()
    expect(getConversation).toHaveBeenCalledWith("conversation", {
      messageLimit: 1,
      silent: true,
    })
    expect(bindProjectConversation).toHaveBeenCalledWith("conversation", 42)
    expect(workspace).toHaveBeenCalledWith({
      action: "git-status",
      conversationId: "conversation",
      source,
    })
  })

  it("uses the explicit project for an unsaved worktree draft", async () => {
    await render({ projectId: 7 }).refresh()
    expect(getConversation).not.toHaveBeenCalled()
    expect(bindProjectConversation).toHaveBeenCalledWith("conversation", 7)
  })

  it("reads a project's Git changes without creating or binding a conversation", async () => {
    await render({ conversationId: null, projectId: 7 }).refresh()
    expect(getConversation).not.toHaveBeenCalled()
    expect(bindProjectConversation).not.toHaveBeenCalled()
    expect(workspace.mock.calls.map(([request]) => request)).toEqual([
      { action: "git-status", projectId: 7, source },
      { action: "git-diff", projectId: 7, source },
    ])
    const git = render({ conversationId: null, projectId: 7 })
    expect(git.aggregate).toEqual(diff())
    await git.changeStage(["changed.ts"], "unstaged")
    expect(workspace).toHaveBeenCalledWith({
      action: "git-stage",
      projectId: 7,
      paths: ["changed.ts"],
      source,
    })
  })

  it("does not bind project metadata arriving after an account switch", async () => {
    const metadata = deferred()
    vi.mocked(getConversation).mockReturnValue(metadata.promise as never)
    const request = render().refresh()
    hooks.source = { ...source, accountId: "2" }
    hooks.sourceKey = "account:2:1"
    metadata.resolve({ project_id: 42 })
    await request
    expect(bindProjectConversation).not.toHaveBeenCalled()
    expect(workspace).not.toHaveBeenCalled()
  })

  it("does not request status after the source epoch changes during binding", async () => {
    const binding = deferred()
    vi.mocked(bindProjectConversation).mockReturnValue(binding.promise as never)
    const request = render({ projectId: 7 }).refresh()
    hooks.sourceKey = "account:1:1"
    binding.resolve("/workspace/project")
    await request
    expect(workspace).not.toHaveBeenCalled()
  })

  it("keeps the latest status and diff when refreshes overlap", async () => {
    const old = deferred()
    workspace.mockReturnValueOnce(old.promise)
    const hook = render()
    const first = hook.refresh()
    await flushMicrotasks()
    await hook.refresh()
    old.resolve({ ...status, branch: "stale" })
    await first
    expect(render()).toMatchObject({ status, aggregate: diff() })
    expect(readActions()).toEqual(["git-status", "git-status", "git-diff"])
  })

  it("keeps staged and unstaged aggregate requests separate and discards stale scopes", async () => {
    render()
    await flushMicrotasks()
    workspace.mockClear()
    const old = deferred()
    workspace
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce(diff("+unstaged"))
    render().setDiffScope("staged")
    expect(render()).toMatchObject({ diffScope: "staged", diffLoading: true })
    render().setDiffScope("unstaged")
    await flushMicrotasks()
    old.resolve(diff("+staged"))
    await flushMicrotasks()
    expect(render()).toMatchObject({
      diffScope: "unstaged",
      aggregate: diff("+unstaged"),
      diffLoading: false,
    })
    expect(workspace.mock.calls.map(([request]) => request.scope)).toEqual([
      "staged",
      "unstaged",
    ])
    expect(
      workspace.mock.calls.every(([request]) => !("path" in request))
    ).toBe(true)
  })

  it("does not reload the current scope or read a new scope while the sidebar is closed", async () => {
    render()
    await flushMicrotasks()
    workspace.mockClear()
    render().setDiffScope("working-tree")
    await flushMicrotasks()
    expect(workspace).not.toHaveBeenCalled()
    render({ enabled: true, panelOpen: false }).setDiffScope("staged")
    await flushMicrotasks()
    expect(workspace).not.toHaveBeenCalled()
    render()
    await flushMicrotasks()
    expect(workspace).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: "git-diff", scope: "staged" })
    )
  })

  it("uses the latest scope once pending status resolves", async () => {
    const pending = deferred()
    workspace.mockReturnValueOnce(pending.promise)
    render()
    await flushMicrotasks()
    render().setDiffScope("staged")
    render().setDiffScope("unstaged")
    expect(readActions()).toEqual(["git-status"])
    pending.resolve(status)
    await flushMicrotasks()
    expect(readActions()).toEqual(["git-status", "git-diff"])
    expect(workspace).toHaveBeenLastCalledWith(
      expect.objectContaining({ scope: "unstaged" })
    )
  })

  it("does not read working-tree bytes for an aggregate binary diff", async () => {
    const binary = diff("Binary files a/image.png and b/image.png differ\n")
    workspace.mockImplementation(async (request) =>
      request.action === "git-diff" ? binary : status
    )
    render()
    await flushMicrotasks()
    expect(render().aggregate).toEqual(binary)
    expect(readActions()).toEqual(["git-status", "git-diff"])
  })

  it("does not request a diff outside a Git repository", async () => {
    workspace.mockResolvedValue({ ...status, repository: false })
    render()
    await flushMicrotasks()
    expect(readActions()).toEqual(["git-status"])
    expect(render()).toMatchObject({ aggregate: null, diffLoading: false })
  })

  it("drops a pending diff when the sidebar closes while the commit dialog stays open", async () => {
    render()
    await flushMicrotasks()
    const pending = deferred()
    workspace.mockReturnValueOnce(pending.promise)
    const request = render().reloadDiff()
    render({ enabled: true, panelOpen: false })
    pending.resolve(diff("+stale"))
    await request
    expect(render({ enabled: true, panelOpen: false }).aggregate).toBeNull()
    workspace.mockClear()
    await render({ enabled: true, panelOpen: false }).refresh()
    expect(readActions()).toEqual(["git-status"])
  })

  it("ignores a diff arriving after an account epoch change", async () => {
    render()
    await flushMicrotasks()
    const pending = deferred()
    workspace.mockReturnValueOnce(pending.promise)
    const request = render().reloadDiff()
    hooks.sourceKey = "account:1:1"
    pending.resolve(diff("+previous-account"))
    await request
    expect(render().aggregate).toBeNull()
  })

  it("invalidates an older diff before refreshing status", async () => {
    render()
    await flushMicrotasks()
    const old = deferred()
    workspace.mockReturnValueOnce(old.promise)
    const loadingOld = render().reloadDiff()
    await render().refresh()
    old.resolve(diff("+stale"))
    await loadingOld
    expect(render().aggregate).toEqual(diff())
  })

  it("reports diff failures independently and permits an explicit retry", async () => {
    workspace
      .mockResolvedValueOnce(status)
      .mockRejectedValueOnce(new Error("Diff unavailable"))
    render()
    await flushMicrotasks()
    expect(render()).toMatchObject({
      status,
      error: "",
      diffError: "Diff unavailable",
      diffLoading: false,
      actionError: "",
      aggregate: null,
    })
    await render().reloadDiff()
    expect(render()).toMatchObject({ aggregate: diff(), diffError: "" })
  })

  it("refreshes the same aggregate scope after an explicit stage operation", async () => {
    render()
    await flushMicrotasks()
    render().setDiffScope("staged")
    await flushMicrotasks()
    workspace.mockClear()
    await render().changeStage(["a.ts", "b.ts"], "unstaged")
    expect(readActions()).toEqual(["git-stage", "git-status", "git-diff"])
    expect(workspace).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: "git-diff", scope: "staged" })
    )
    expect(workspace).toHaveBeenCalledWith({
      action: "git-stage",
      paths: ["a.ts", "b.ts"],
      conversationId: "conversation",
      source,
    })
  })

  it("commits only after an explicit request without automatically staging", async () => {
    workspace.mockResolvedValueOnce({
      commit: { hash: "abc123", message: "fix" },
    })
    await render({ panelOpen: false }).commit("fix")
    expect(readActions()).toEqual(["git-commit", "git-status"])
    expect(workspace).toHaveBeenCalledWith({
      action: "git-commit",
      message: "fix",
      conversationId: "conversation",
      source,
    })
  })

  it("blocks overlapping mutations and surfaces errors without losing status", async () => {
    render()
    await flushMicrotasks()
    const pending = deferred()
    workspace.mockReturnValueOnce(pending.promise)
    const first = render().changeStage(["a.ts"], "unstaged")
    await render().changeStage(["b.ts"], "unstaged")
    pending.resolve(null)
    await first
    expect(render()).toMatchObject({
      status,
      actionError: "common.gitResponseInvalid",
      busy: false,
    })
    expect(
      readActions().filter((action) => action === "git-stage")
    ).toHaveLength(1)
  })

  it("finishes an explicit mutation without a hidden read when both surfaces close", async () => {
    render()
    await flushMicrotasks()
    workspace.mockClear()
    const pending = deferred()
    workspace.mockReturnValueOnce(pending.promise)
    const mutation = render().changeStage(["a.ts"], "unstaged")
    render({ enabled: false })
    pending.resolve(status)
    await mutation
    expect(readActions()).toEqual(["git-stage"])
    expect(render({ enabled: false }).busy).toBe(false)
    render()
    await flushMicrotasks()
    expect(readActions()).toEqual(["git-stage", "git-status", "git-diff"])
  })

  it("does not read a diff after a stage completes with only the commit dialog open", async () => {
    render()
    await flushMicrotasks()
    workspace.mockClear()
    const pending = deferred()
    workspace.mockReturnValueOnce(pending.promise)
    const mutation = render().changeStage(["a.ts"], "unstaged")
    render({ enabled: true, panelOpen: false })
    pending.resolve(status)
    await mutation
    expect(readActions()).toEqual(["git-stage", "git-status"])
  })

  it("drops pending status and diff responses when the session unmounts", async () => {
    const pendingStatus = deferred()
    workspace.mockReturnValueOnce(pendingStatus.promise)
    render()
    await flushMicrotasks()
    unmount()
    pendingStatus.resolve(status)
    await flushMicrotasks()
    expect(render({ enabled: false }).status).toBeNull()
    expect(readActions()).toEqual(["git-status"])
  })

  it("exposes status errors and permits a successful retry", async () => {
    workspace.mockRejectedValueOnce(new Error("Git unavailable"))
    await render().refresh()
    expect(render()).toMatchObject({ error: "Git unavailable", loading: false })
    await render().refresh()
    expect(render()).toMatchObject({
      error: "",
      loading: false,
      status,
      aggregate: diff(),
    })
  })

  it("does not add a refresh when the chat first starts running", async () => {
    render()
    await flushMicrotasks()
    workspace.mockClear()
    render({ chatRunning: true })
    await flushMicrotasks()
    expect(workspace).not.toHaveBeenCalled()
  })

  it("refreshes status and the current diff after the chat completes", async () => {
    render({ chatRunning: true })
    await flushMicrotasks()
    workspace.mockClear()
    render({ chatRunning: false })
    await flushMicrotasks()
    expect(readActions()).toEqual(["git-status", "git-diff"])
    expect(render().aggregate).toEqual(diff())
  })

  it("defers completed-chat reads while closed and refreshes once on opening", async () => {
    render({ enabled: false, chatRunning: true })
    render({ enabled: false, chatRunning: false })
    await flushMicrotasks()
    expect(workspace).not.toHaveBeenCalled()
    render()
    await flushMicrotasks()
    expect(readActions()).toEqual(["git-status", "git-diff"])
  })

  it("defers a completed-chat refresh until a Git mutation settles", async () => {
    render({ chatRunning: true })
    await flushMicrotasks()
    workspace.mockClear()
    const pending = deferred()
    workspace.mockReturnValueOnce(pending.promise)
    const mutation = render({ chatRunning: true }).changeStage(
      ["a.ts"],
      "unstaged"
    )
    render({ chatRunning: false })
    await flushMicrotasks()
    expect(readActions()).toEqual(["git-stage"])
    pending.resolve(null)
    await mutation
    render({ chatRunning: false })
    await flushMicrotasks()
    expect(readActions()).toEqual(["git-stage", "git-status", "git-diff"])
  })

  it("consumes a completed-chat refresh when a successful mutation already refreshes", async () => {
    render({ chatRunning: true })
    await flushMicrotasks()
    workspace.mockClear()
    const pending = deferred()
    workspace.mockReturnValueOnce(pending.promise)
    const mutation = render({ chatRunning: true }).changeStage(
      ["a.ts"],
      "unstaged"
    )
    render({ chatRunning: false })
    pending.resolve(status)
    await mutation
    render({ chatRunning: false })
    await flushMicrotasks()
    expect(readActions()).toEqual(["git-stage", "git-status", "git-diff"])
  })
})
