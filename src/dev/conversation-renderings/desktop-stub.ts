import type { BuddyDesktopApi } from "@/shared/desktop"
import type { WorkspaceEnvironment, WorkspaceRequest } from "@/shared/workspace"
import { previewEnvironment } from "./preview-data"

/**
 * 桌面能力模拟：预览页跑在浏览器里，没有 Electron 主进程，
 * 这里补一份可切换的工作位置，让位置、分支与 Worktree 菜单能真实点开
 */
let environment: WorkspaceEnvironment = { ...previewEnvironment }

function applyEnvironment(
  patch: Partial<WorkspaceEnvironment>
): WorkspaceEnvironment {
  environment = { ...environment, ...patch }
  return environment
}

async function handleWorkspace(request: WorkspaceRequest): Promise<unknown> {
  switch (request.action) {
    case "environment":
    case "lock-environment":
      return { environment }
    case "configure-environment": {
      const backend = request.backend ?? "local"
      return {
        environment: applyEnvironment({
          backend,
          mode: request.mode,
          state: request.mode === "worktree" ? "pending" : "local",
          branch: request.mode === "worktree" ? (request.baseBranch ?? null) : environment.branch,
          baseBranch: request.baseBranch ?? environment.baseBranch,
          path: backend === "sandbox" ? null : environment.path,
        }),
      }
    }
    case "checkout-branch":
      applyEnvironment({ branch: request.branch, state: "local" })
      return { repository: true, branch: request.branch, upstream: null, ahead: 0, behind: 0, entries: [] }
    case "git-status":
      return { repository: true, branch: environment.branch, upstream: null, ahead: 0, behind: 0, entries: [] }
    case "git-diff":
      return { repository: true, path: request.path ?? null, diff: "", additions: 0, truncated: false }
    case "engineering-check":
      return {
        checkedAt: new Date().toISOString(),
        repository: true,
        conflicts: [],
        staged: 0,
        unstaged: 0,
        untracked: 0,
        whitespace: [],
      }
    case "list-worktrees":
      return { worktrees: [] }
    default:
      return null
  }
}

/** 安装桌面能力模拟，只在独立预览入口调用 */
export function installLocalPreviewDesktop() {
  const api: BuddyDesktopApi = {
    openWebPreview: async () => undefined,
    openExternal: async () => undefined,
    historyCache: async () => null,
    workspace: async (request) =>
      (await handleWorkspace(request)) as Awaited<
        ReturnType<BuddyDesktopApi["workspace"]>
      >,
    projectWorkspace: async () => ({ directory: null }),
    getExecutionStatus: async () =>
      ({}) as Awaited<ReturnType<BuddyDesktopApi["getExecutionStatus"]>>,
    setExecutionSettings: async () =>
      ({}) as Awaited<ReturnType<BuddyDesktopApi["setExecutionSettings"]>>,
    chooseExecutionWorkspace: async () => null,
    installRuntime: async () =>
      ({}) as Awaited<ReturnType<BuddyDesktopApi["installRuntime"]>>,
    prepareExecution: async () => ({ backend: "sandbox" }) as Awaited<
      ReturnType<BuddyDesktopApi["prepareExecution"]>
    >,
    startExecution: async () => undefined,
    stopExecution: async () => undefined,
    prepareAcp: async (config) => ({ ...config, preparationId: "preview" }),
    startAcp: async () => undefined,
    stopAcp: async () => undefined,
    platform: "darwin",
    getDesktopSettings: async () => ({
      openAtLogin: false,
      proxyMode: "system",
      proxyUrl: "",
      updateUrl: "",
    }),
    setOpenAtLogin: async () => false,
    setProxy: async () => false,
    setWindowMaterial: async () => false,
    isWindowFocused: async () => true,
    notify: async () => false,
    loadSession: async () => null,
    saveSession: async () => true,
    clearSession: async () => true,
    scanLocalSkills: async () => [],
    readLocalSkill: async () => ({ name: "", files: [] }),
  }
  window.buddyDesktop = api
}
