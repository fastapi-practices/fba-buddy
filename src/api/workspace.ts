import { apiBlobRequest, apiRequest } from "@/api/http"
import type {
  KnowledgeBaseItem,
  KnowledgeBaseWithDocuments,
  KnowledgeBaseWriteBody,
  MemoryDetail,
  MemoryListItem,
  WorkspaceArtifactItem,
  WorkspaceArtifactKind,
  WorkspaceArtifactListItem,
  WorkspaceArtifactPage,
  WorkspaceArtifactReferenceBody,
  WorkspaceFileItem,
  WorkspaceFileWriteBody,
  WorkspaceKnowledgeItem,
  WorkspaceSkillItem,
  WorkspaceSkillSearchHit,
  WorkspaceItem,
  WorkspaceUpdateBody,
  WorkspaceWriteBody,
} from "@/lib/types"

export function listSkills() {
  return apiRequest<WorkspaceSkillItem[]>("/skills/all")
}

export function searchSkills(query: string) {
  const q = query.trim()
  return apiRequest<WorkspaceSkillSearchHit[]>(
    `/skills/search?q=${encodeURIComponent(q)}`
  )
}

export function uploadMySkill(files: File[]) {
  const body = new FormData()
  for (const file of files) {
    body.append("file", file)
  }
  return apiRequest<null>("/skills/me", { method: "POST", body })
}

export function deleteMySkill(pk: number) {
  return apiRequest<null>(`/skills/me/${pk}`, { method: "DELETE" })
}

export function listKnowledgeBases() {
  return apiRequest<KnowledgeBaseItem[]>("/knowledges/all")
}

export function listMyKnowledgeBases() {
  return apiRequest<KnowledgeBaseItem[]>("/knowledges/me")
}

export function createMyKnowledgeBase(body: KnowledgeBaseWriteBody) {
  return apiRequest<KnowledgeBaseItem>("/knowledges/me", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

export function updateMyKnowledgeBase(
  pk: number,
  body: KnowledgeBaseWriteBody
) {
  return apiRequest<null>(`/knowledges/me/${pk}`, {
    method: "PUT",
    body: JSON.stringify(body),
  })
}

export function deleteMyKnowledgeBase(pk: number) {
  return apiRequest<null>(`/knowledges/me/${pk}`, { method: "DELETE" })
}

export function listKnowledgeDocuments(knowledgeBaseId: number) {
  return apiRequest<WorkspaceKnowledgeItem[]>(
    `/knowledges/${knowledgeBaseId}/documents/all`
  )
}

export function uploadMyKnowledgeDocument(pk: number, files: File[]) {
  const body = new FormData()
  for (const file of files) {
    body.append("file", file)
  }
  return apiRequest<null>(`/knowledges/me/${pk}/documents`, {
    method: "POST",
    body,
  })
}

export function deleteMyKnowledgeDocument(pk: number, docId: number) {
  return apiRequest<null>(`/knowledges/me/${pk}/documents/${docId}`, {
    method: "DELETE",
  })
}

/** 知识库连同库下文档一起拉取：一库一条，文档挂在 documents 上 */
export async function listKnowledgeBasesWithDocuments() {
  const bases = await listKnowledgeBases()
  return Promise.all(
    bases.map(async (base): Promise<KnowledgeBaseWithDocuments> => {
      const documents = await listKnowledgeDocuments(base.id)
      return {
        ...base,
        documents: documents.map((document) => ({
          ...document,
          knowledge_base_name: base.name,
        })),
      }
    })
  )
}

function listArtifactsPage(
  options: {
    kind?: WorkspaceArtifactKind | null
    cursor?: string | null
    size?: number
  } = {}
) {
  const query = new URLSearchParams()
  if (options.kind) query.set("kind", options.kind)
  if (options.cursor) query.set("cursor", options.cursor)
  query.set("size", String(options.size ?? 200))
  return apiRequest<WorkspaceArtifactPage>(`/artifacts?${query}`)
}

export async function listArtifacts(
  options: { kind?: WorkspaceArtifactKind | null } = {}
): Promise<WorkspaceArtifactListItem[]> {
  const items: WorkspaceArtifactListItem[] = []
  let cursor: string | null = null
  do {
    const page = await listArtifactsPage({ ...options, cursor })
    items.push(...page.items)
    cursor = page.has_more ? page.next_cursor : null
  } while (cursor)
  return items
}

export function getArtifact(id: number | string) {
  return apiRequest<WorkspaceArtifactItem>(`/artifacts/${id}`)
}

export function downloadArtifact(id: number, signal?: AbortSignal) {
  return apiBlobRequest(`/artifacts/${id}/content`, { signal, silent: true })
}

export function registerWorkspaceArtifact(
  body: WorkspaceArtifactReferenceBody
) {
  return apiRequest<WorkspaceArtifactItem>("/artifacts/workspace-reference", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

export function listWorkspaces() {
  return apiRequest<WorkspaceItem[]>("/workspaces/all")
}

export function createWorkspace(body: WorkspaceWriteBody) {
  return apiRequest<WorkspaceItem>("/workspaces", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

export function getWorkspace(workspaceId: string) {
  return apiRequest<WorkspaceItem>(
    `/workspaces/${encodeURIComponent(workspaceId)}`
  )
}

export function updateWorkspace(
  workspaceId: string,
  body: WorkspaceUpdateBody
) {
  return apiRequest<null>(`/workspaces/${encodeURIComponent(workspaceId)}`, {
    method: "PUT",
    body: JSON.stringify(body),
  })
}

export function listWorkspaceFiles(workspaceId: string) {
  return apiRequest<WorkspaceFileItem[]>(
    `/workspaces/${encodeURIComponent(workspaceId)}/files`
  )
}

export function upsertWorkspaceFile(
  workspaceId: string,
  body: WorkspaceFileWriteBody
) {
  return apiRequest<WorkspaceFileItem>(
    `/workspaces/${encodeURIComponent(workspaceId)}/files`,
    {
      method: "PUT",
      body: JSON.stringify(body),
    }
  )
}

export function uploadWorkspaceFile(
  workspaceId: string,
  relativePath: string,
  file: File,
  options: { revision?: number; size?: number; sha256?: string } = {}
) {
  const query = new URLSearchParams({ relative_path: relativePath })
  if (options.revision !== undefined)
    query.set("revision", String(options.revision))
  if (options.size !== undefined) query.set("size", String(options.size))
  if (options.sha256 !== undefined) query.set("sha256", options.sha256)
  const body = new FormData()
  body.append("file", file)
  return apiRequest<WorkspaceFileItem>(
    `/workspaces/${encodeURIComponent(workspaceId)}/files/content?${query}`,
    { method: "POST", body }
  )
}

export function downloadWorkspaceFile(
  workspaceId: string,
  relativePath: string,
  revision?: number
) {
  const query = new URLSearchParams({ relative_path: relativePath })
  if (revision !== undefined) query.set("revision", String(revision))
  return apiBlobRequest(
    `/workspaces/${encodeURIComponent(workspaceId)}/files/content?${query}`
  )
}

function memoryPath(path: string) {
  return path
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/")
}

export function listMemories() {
  return apiRequest<MemoryListItem[]>("/memories/all")
}

export function getMemory(path: string) {
  return apiRequest<MemoryDetail>(`/memories/${memoryPath(path)}`)
}

export function deleteMemory(path: string) {
  return apiRequest<null>(`/memories/${memoryPath(path)}`, { method: "DELETE" })
}
