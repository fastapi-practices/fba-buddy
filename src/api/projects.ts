import { apiRequest } from "@/api/http"
import type { ProjectItem } from "@/lib/types"

export type ProjectWriteBody = {
  name: string
  sort?: number
  archived?: boolean
}

export function toProjectWriteBody(
  project: Pick<ProjectItem, "name" | "sort" | "archived">,
  patch: Partial<ProjectWriteBody> = {}
): ProjectWriteBody {
  return {
    name: patch.name ?? project.name,
    sort: patch.sort ?? project.sort,
    archived: patch.archived ?? project.archived,
  }
}

export function listProjects() {
  return apiRequest<ProjectItem[]>("/projects/all")
}

export function createProject(name: string) {
  return apiRequest<null>("/projects", {
    method: "POST",
    body: JSON.stringify({ name }),
  })
}

export function updateProject(id: number, body: ProjectWriteBody) {
  return apiRequest<null>(`/projects/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  })
}

export function deleteProject(id: number) {
  return apiRequest<null>(`/projects/${id}`, { method: "DELETE" })
}
