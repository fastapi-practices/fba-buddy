import type { AccountSource } from "./account-source"
import type { SandboxProvider } from "./execution"

type WorkspaceFile = { path: string; content: string; size: number }
export type WorkspaceAsset = {
  path: string
  data: string
  mimeType: string
  size: number
}
export type WorkspaceCheckpointFile = {
  path: string
  before: string | null
  after: string | null
  encoding?: "utf8" | "base64"
  mode?: number
  afterMode?: number
}
export type WorkspaceCheckpoint = {
  id: string
  path: string
  before: string | null
  after: string
  createdAt: string
  restored?: boolean
  files?: WorkspaceCheckpointFile[]
  kind?: "turn"
  omitted?: string[]
  incomplete?: boolean
  runId?: string
  startedAt?: string
  captureError?: string
}
export type WorkspaceCheckpointSummary = Pick<
  WorkspaceCheckpoint,
  | "id"
  | "createdAt"
  | "restored"
  | "kind"
  | "incomplete"
  | "runId"
  | "startedAt"
  | "captureError"
> & { fileCount: number; omittedCount: number }
export type WorkspaceEngineeringCheck = {
  checkedAt: string
  repository: boolean
  conflicts: string[]
  staged: number
  unstaged: number
  untracked: number
  whitespace: {
    scope: "staged" | "unstaged"
    output: string
    ok: boolean
    truncated: boolean
  }[]
}
type WorkspaceInputFile = {
  relative_path: string
  sha256: string
  size: number
}
export type WorkspaceManagedWorktree = {
  conversationId: string
  path: string
  head: string
  sourcePath: string
  state: "draft" | "active" | "orphan"
  createdAt: string | null
  error: string | null
  branch: string | null
  associated: boolean
}
export type WorkspaceBackend = "local" | "sandbox"

export type WorkspaceEnvironment = {
  backend: WorkspaceBackend
  sandboxProvider?: SandboxProvider
  mode: "local" | "worktree"
  state: "local" | "pending" | "ready"
  path: string | null
  sourcePath: string
  branch: string | null
  baseBranch: string | null
  branches: string[]
  repository: boolean
  associatedWorktreePath: string | null
}
export type WorkspaceGitLineStats = {
  additions: number
  deletions: number
  binary: boolean
}
export type WorkspaceGitStatusEntry = {
  path: string
  index: string
  worktree: string
  staged: boolean
  untracked: boolean
  renamedFrom?: string
  stagedStats?: WorkspaceGitLineStats
  unstagedStats?: WorkspaceGitLineStats
}
export type WorkspaceGitStatus = {
  repository: boolean
  branch: string | null
  upstream: string | null
  ahead: number
  behind: number
  entries: WorkspaceGitStatusEntry[]
}
export type WorkspaceGitDiff = {
  repository: boolean
  path: string | null
  diff: string
  additions: number
  deletions: number
  truncated: boolean
}
export type WorkspaceGitCommit = {
  commit: { hash: string; message: string }
}
type WorkspaceWorktreeResult = {
  worktree: {
    path: string
    head: string
    sourcePath: string
    branch: string | null
  }
}
export type WorkspaceTarget =
  | { conversationId: string; projectId?: never }
  | { projectId: number; conversationId?: never }

type WorkspaceGitRequest = WorkspaceTarget &
  (
    | { action: "git-status" }
    | { action: "git-diff"; path?: string; scope?: "staged" | "unstaged" }
    | { action: "git-stage" | "git-unstage"; paths: string[] }
    | { action: "git-commit"; message: string }
    | { action: "checkout-branch"; branch: string; create?: boolean }
    | { action: "engineering-check" }
  )

export type WorkspaceRequest = { source?: AccountSource } & (
  | { action: "environment"; conversationId?: string; projectId?: number }
  | {
      action: "configure-environment"
      conversationId: string
      projectId?: number
      mode: "local" | "worktree"
      backend?: "local" | "sandbox"
      sandboxProvider?: SandboxProvider
      baseBranch?: string
    }
  | { action: "lock-environment"; conversationId: string; projectId?: number }
  | {
      action: "handoff-environment"
      conversationId: string
      mode: "local" | "worktree"
      worktreeName?: string
    }
  | {
      action: "write-input-file"
      conversationId: string
      path: string
      data: string
      sha256: string
    }
  | { action: "list-worktrees" }
  | {
      action: "resume-worktree" | "mark-worktree-active" | "open-worktree"
      conversationId: string
    }
  | { action: "remove-worktree"; conversationId: string; force?: boolean }
  | {
      action: "fork-profile"
      conversationId: string
      targetConversationId: string
    }
  | (WorkspaceTarget & {
      action: "read" | "read-asset" | "find-file" | "reveal" | "open"
      path: string
      line?: number
      column?: number
    })
  | {
      action: "run"
      conversationId: string
      command: string
      requestId: string
    }
  | { action: "cancel"; conversationId: string; requestId: string }
  | { action: "restore-batch"; conversationId: string; checkpointIds: string[] }
  | {
      action: "checkpoint" | "restore"
      conversationId: string
      checkpointId: string
    }
  | {
      action: "open-root" | "list-checkpoints"
      conversationId: string
    }
  | WorkspaceGitRequest
)
export type WorkspaceResponse =
  | { inputFile: WorkspaceInputFile }
  | WorkspaceFile
  | WorkspaceAsset
  | WorkspaceCheckpoint
  | WorkspaceGitStatus
  | WorkspaceGitDiff
  | WorkspaceGitCommit
  | WorkspaceWorktreeResult
  | WorkspaceEngineeringCheck
  | { environment: WorkspaceEnvironment }
  | { checkpointSummaries: WorkspaceCheckpointSummary[] }
  | { worktrees: WorkspaceManagedWorktree[] }
  | { checkpoints: WorkspaceCheckpoint[] }
  | { paths: string[] }
  | { output: string }
  | null
