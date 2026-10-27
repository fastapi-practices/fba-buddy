import { createProject, listProjects } from "@/api/projects"
import { dataSourceKey } from "@/lib/account-source"
import {
  setProjectDirectory,
  validateProjectDirectory,
} from "@/lib/project-workspace"
import { translateCurrent } from "@/lib/i18n"
import type { ProjectItem } from "@/lib/types"

export async function createProjectWithDirectory({
  name,
  directory,
}: {
  name: string
  directory: string | null
}): Promise<{ project: ProjectItem | null; directoryError: unknown | null }> {
  const source = dataSourceKey()
  const selectedDirectory = directory
    ? await validateProjectDirectory(directory)
    : null
  if (source !== dataSourceKey())
    throw new DOMException("账号已切换", "AbortError")
  const previous = directory ? await listProjects() : []
  if (source !== dataSourceKey())
    throw new DOMException("账号已切换", "AbortError")
  await createProject(name)
  if (!selectedDirectory || source !== dataSourceKey())
    return { project: null, directoryError: null }
  let project: ProjectItem | null = null
  try {
    const existingIds = new Set(previous.map((item) => item.id))
    const created = (await listProjects()).filter(
      (item) => !existingIds.has(item.id) && item.name === name
    )
    if (source !== dataSourceKey())
      throw new DOMException("账号已切换", "AbortError")
    if (created.length !== 1)
      throw new Error(translateCurrent("common.projectFolderBindingAmbiguous"))
    project = created[0]!
    await setProjectDirectory(project.id, selectedDirectory)
    return { project, directoryError: null }
  } catch (directoryError) {
    return { project, directoryError }
  }
}
