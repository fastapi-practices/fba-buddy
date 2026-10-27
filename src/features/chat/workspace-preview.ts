import { currentAccountSource } from "@/lib/account-source"
import type { WorkspaceAsset } from "@/shared/workspace"
import {
  parseFileReference,
  resolveReferencePath,
} from "@/shared/file-reference"

export async function loadWorkspaceAsset(
  conversationId: string,
  path: string
): Promise<WorkspaceAsset> {
  if (!window.buddyDesktop?.workspace)
    throw new Error("当前环境没有可用的工作区文件接口")
  const result = await window.buddyDesktop.workspace({
    source: currentAccountSource() ?? undefined,
    action: "read-asset",
    conversationId,
    path,
  })
  if (!result || !("data" in result)) throw new Error("工作区返回的文件无效")
  return result
}

export async function findWorkspaceFile(
  conversationId: string,
  path: string
): Promise<string[]> {
  if (!window.buddyDesktop?.workspace || /[\\/]/.test(path)) return [path]
  const result = await window.buddyDesktop.workspace({
    source: currentAccountSource() ?? undefined,
    action: "find-file",
    conversationId,
    path,
  })
  return result && "paths" in result && result.paths.length
    ? result.paths
    : [path]
}

export function assetSource(asset: WorkspaceAsset) {
  return `data:${asset.mimeType};base64,${asset.data}`
}

export function workspaceImagePath(src: string, baseDir?: string) {
  if (/^(?:https?:|data:|blob:|\/\/)/i.test(src)) return null
  const reference = parseFileReference(src)
  return reference ? resolveReferencePath(reference.path, baseDir) : null
}
