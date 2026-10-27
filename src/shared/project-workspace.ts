import type { AccountSource } from "./account-source"

export type ProjectWorkspaceRequest =
  | {
      action: "validate"
      source: AccountSource
      directory: string
    }
  | {
      action: "get" | "remove" | "open-folder" | "copy-path"
      source: AccountSource
      projectId: number
    }
  | {
      action: "set"
      source: AccountSource
      projectId: number
      directory: string
    }
  | {
      action: "bind-conversation"
      source: AccountSource
      projectId: number
      conversationId: string
    }

export type ProjectWorkspaceResponse = { directory: string | null }
