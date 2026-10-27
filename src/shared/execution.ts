export type ExecutionBackend = "local" | "sandbox"
export const SANDBOX_PROVIDERS = [
  "opensandbox",
  "docker",
  "e2b",
  "modal",
  "daytona",
  "sprites",
  "smol",
  "boxlite",
] as const
export type SandboxProvider = (typeof SANDBOX_PROVIDERS)[number]
export type RuntimeName = "python" | "node"
type ExecutionWorkspaceMode = "auto" | "custom"
export const EXECUTION_PROTOCOL_CAPABILITIES = [
  "run_tests_v1",
  "workspace_git_v1",
  "input_files_v1",
  "command_v1",
] as const
type ExecutionProtocolCapability =
  (typeof EXECUTION_PROTOCOL_CAPABILITIES)[number]
export type ExecutionDefaults = {
  backend: ExecutionBackend
  capabilities: ExecutionProtocolCapability[]
}

export type ExecutionCommandResult = {
  command: string
  exit_code: number | null
  stdout: string
  stderr: string
  reason:
    | "completed"
    | "cancelled"
    | "deadline"
    | "output-limit"
    | "execution-error"
    | "connection-error"
  started_at: string | null
  duration_ms: number | null
  truncated: boolean
  output_complete: boolean
  result_available: boolean
}

export type ExecutionSettings = {
  backend: ExecutionBackend
  sandboxProvider?: SandboxProvider
  workspaceDir: string
  workspaceMode: ExecutionWorkspaceMode
}

export type RuntimeStatus = {
  available: boolean
  path?: string
  version?: string
  reason?: string
  source?: string
}

export type ExecutionStatus = {
  config: ExecutionSettings
  homeWorkspace: string
  documentsWorkspace: string
  local: { available: boolean; reason?: string; kind?: string }
  runtimes: { python: RuntimeStatus; node: RuntimeStatus }
}

export type PreparedExecution = {
  preparationId: string
  backend: "local"
  cwd: string
  capabilities: ExecutionProtocolCapability[]
}

export type ExecutionPreparation =
  PreparedExecution | { backend: "sandbox"; sandboxProvider?: SandboxProvider }

export type ExecutionLaunch = {
  bridgeId: string
  ticket: string
  url: string
  preparationId: string
  permissionMode: "ask" | "auto" | "full"
}
