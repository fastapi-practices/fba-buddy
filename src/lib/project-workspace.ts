import { currentAccountSource, dataSourceKey } from "@/lib/account-source"
import { translateCurrent } from "@/lib/i18n"
import { DESKTOP_CHANNELS } from "@/shared/desktop"
import type { ProjectWorkspaceRequest } from "@/shared/project-workspace"

type WithoutSource<T> = T extends unknown ? Omit<T, "source"> : never

async function requestProjectWorkspace(
  request: WithoutSource<ProjectWorkspaceRequest>
) {
  const desktop =
    typeof window === "undefined" ? undefined : window.buddyDesktop
  const source = currentAccountSource()
  if (!desktop?.projectWorkspace || !source) {
    if (request.action === "open-folder" || request.action === "copy-path")
      throw new Error(translateCurrent("common.projectFolderRequiresDesktop"))
    return null
  }
  const key = dataSourceKey()
  let result
  try {
    result = await desktop.projectWorkspace({
      ...request,
      source,
    } as ProjectWorkspaceRequest)
  } catch (cause) {
    if (key !== dataSourceKey())
      throw new DOMException("账号已切换", "AbortError")
    if (
      cause instanceof Error &&
      cause.message.includes("No handler registered") &&
      cause.message.includes(DESKTOP_CHANNELS.projectWorkspace)
    ) {
      throw new Error(translateCurrent("common.projectFolderRestartRequired"), {
        cause,
      })
    }
    if (
      cause instanceof Error &&
      (request.action === "validate" ||
        request.action === "set" ||
        request.action === "open-folder") &&
      ["ENOENT", "ENOTDIR", "EACCES", "Workspace is not a directory"].some(
        (message) => cause.message.includes(message)
      )
    ) {
      throw new Error(translateCurrent("common.projectFolderUnavailable"), {
        cause,
      })
    }
    throw cause
  }
  if (key !== dataSourceKey())
    throw new DOMException("账号已切换", "AbortError")
  return result.directory
}

export async function validateProjectDirectory(directory: string) {
  const selected = await requestProjectWorkspace({
    action: "validate",
    directory,
  })
  if (!selected)
    throw new Error(translateCurrent("common.projectFolderRequiresDesktop"))
  return selected
}

export function getProjectDirectory(projectId: number) {
  return requestProjectWorkspace({ action: "get", projectId })
}

export function openProjectDirectory(projectId: number) {
  return requestProjectWorkspace({ action: "open-folder", projectId })
}

export function copyProjectDirectoryPath(projectId: number) {
  return requestProjectWorkspace({ action: "copy-path", projectId })
}

export function setProjectDirectory(
  projectId: number,
  directory: string | null
) {
  return requestProjectWorkspace(
    directory
      ? { action: "set", projectId, directory }
      : { action: "remove", projectId }
  )
}

export async function bindProjectConversation(
  conversationId: string | null | undefined,
  projectId: number | null | undefined
) {
  if (!conversationId || projectId == null) return null
  return requestProjectWorkspace({
    action: "bind-conversation",
    projectId,
    conversationId,
  })
}

export function projectDirectoryName(directory: string) {
  return (
    directory
      .replace(/[\\/]+$/, "")
      .split(/[\\/]/)
      .at(-1) || directory
  )
}
