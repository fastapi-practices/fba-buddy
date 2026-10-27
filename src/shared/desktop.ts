import type {
  ExecutionDefaults,
  ExecutionLaunch,
  ExecutionPreparation,
  ExecutionSettings,
  ExecutionStatus,
  RuntimeName,
} from "./execution"
import type { WorkspaceRequest, WorkspaceResponse } from "./workspace"
import type { AccountSource } from "./account-source"
import type { HistoryCacheRequest, HistoryCacheSnapshot } from "./history-cache"
import type {
  ProjectWorkspaceRequest,
  ProjectWorkspaceResponse,
} from "./project-workspace"
import type { DesktopWindowMaterial } from "./window-material"

export const DESKTOP_CHANNELS = {
  webPreview: "buddy:web-preview",
  openExternal: "desktop:open-external",
  historyCache: "desktop:history-cache",
  workspace: "desktop:workspace",
  projectWorkspace: "desktop:project-workspace",
  getExecutionStatus: "desktop:execution-status",
  setExecutionSettings: "desktop:execution-settings",
  chooseExecutionWorkspace: "desktop:execution-workspace",
  installRuntime: "desktop:runtime-install",
  prepareExecution: "desktop:execution-prepare",
  startExecution: "desktop:execution-start",
  stopExecution: "desktop:execution-stop",
  prepareAcp: "desktop:acp-prepare",
  startAcp: "desktop:acp-start",
  stopAcp: "desktop:acp-stop",
  getSettings: "desktop:get-settings",
  setOpenAtLogin: "desktop:set-open-at-login",
  setProxy: "desktop:set-proxy",
  setWindowMaterial: "desktop:set-window-material",
  isFocused: "desktop:is-focused",
  notify: "desktop:notify",
  loadSession: "session:load",
  saveSession: "session:save",
  clearSession: "session:clear",
  scanLocalSkills: "desktop:scan-local-skills",
  readLocalSkill: "desktop:read-local-skill",
} as const

export type DesktopProxyMode = "system" | "direct" | "custom"

export type DesktopSettings = {
  openAtLogin: boolean
  proxyMode: DesktopProxyMode
  proxyUrl: string
  updateUrl: string
}

export type DesktopNotifyPayload = {
  title: string
  body: string
}

export type DesktopSessionPayload = {
  accessToken: string | null
  accessTokenExpireTime: string | null
  sessionUuid: string | null
  user: unknown
}

export type DesktopLocalSkillHit = {
  path: string
  name: string
  description: string
  version: string
  source: string
}

type DesktopLocalSkillFile = {
  relativePath: string
  contentBase64: string
}

export type DesktopLocalSkillPayload = {
  name: string
  files: DesktopLocalSkillFile[]
}

export type DesktopAcpLaunch = {
  preparationId?: string
  source?: AccountSource
  bridgeId: string
  ticket: string
  url: string
  config: { command: string; args: string[]; cwd?: string }
}

export type BuddyDesktopApi = {
  openWebPreview: (url: string) => Promise<void>
  openExternal: (url: string) => Promise<void>
  historyCache: (
    request: HistoryCacheRequest
  ) => Promise<HistoryCacheSnapshot | null>
  workspace: (request: WorkspaceRequest) => Promise<WorkspaceResponse>
  projectWorkspace: (
    request: ProjectWorkspaceRequest
  ) => Promise<ProjectWorkspaceResponse>
  getExecutionStatus: (defaults?: ExecutionDefaults) => Promise<ExecutionStatus>
  setExecutionSettings: (config: ExecutionSettings) => Promise<ExecutionStatus>
  chooseExecutionWorkspace: () => Promise<string | null>
  installRuntime: (name: RuntimeName) => Promise<ExecutionStatus>
  prepareExecution: (
    conversationId: string,
    defaults?: ExecutionDefaults,
    source?: AccountSource
  ) => Promise<ExecutionPreparation>
  startExecution: (payload: ExecutionLaunch) => Promise<void>
  stopExecution: (bridgeId: string) => Promise<void>
  prepareAcp: (
    config: DesktopAcpLaunch["config"],
    conversationId?: string,
    source?: AccountSource
  ) => Promise<DesktopAcpLaunch["config"] & { preparationId: string }>
  startAcp: (payload: DesktopAcpLaunch) => Promise<void>
  stopAcp: (bridgeId: string) => Promise<void>
  platform: string
  getDesktopSettings: () => Promise<DesktopSettings>
  setOpenAtLogin: (openAtLogin: boolean) => Promise<boolean>
  setProxy: (payload: {
    mode: DesktopProxyMode
    url: string
  }) => Promise<boolean>
  setWindowMaterial: (material: DesktopWindowMaterial) => Promise<boolean>
  isWindowFocused: () => Promise<boolean>
  notify: (payload: DesktopNotifyPayload) => Promise<boolean>
  loadSession: () => Promise<DesktopSessionPayload | null>
  saveSession: (payload: DesktopSessionPayload) => Promise<boolean>
  clearSession: () => Promise<boolean>
  scanLocalSkills: () => Promise<DesktopLocalSkillHit[]>
  readLocalSkill: (skillPath: string) => Promise<DesktopLocalSkillPayload>
}
