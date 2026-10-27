import { appPaths } from "@/app/location"

export type WorkspaceCommand =
  | "new-conversation"
  | "open-settings"
  | "open-image"
  | "open-assistants"

export type WorkspaceCommandResult = {
  path: string
  remountChat: boolean
}

export function applyWorkspaceCommand(
  command: WorkspaceCommand
): WorkspaceCommandResult {
  const paths = appPaths()
  if (command === "new-conversation") {
    return { path: paths.chat(), remountChat: true }
  }
  if (command === "open-image") {
    return { path: paths.image(), remountChat: false }
  }
  if (command === "open-assistants") {
    return { path: paths.assistants(), remountChat: false }
  }
  return { path: paths.settings(), remountChat: false }
}
