import { afterEach, describe, expect, it, vi } from "vitest"

import { apiBlobRequest, apiRequest } from "@/api/http"
import {
  createWorkspace,
  createMyKnowledgeBase,
  listMyKnowledgeBases,
  listKnowledgeBasesWithDocuments,
  getWorkspace,
  listWorkspaceFiles,
  listWorkspaces,
  downloadWorkspaceFile,
  downloadArtifact,
  registerWorkspaceArtifact,
  uploadWorkspaceFile,
  updateWorkspace,
  upsertWorkspaceFile,
} from "@/api/workspace"
import type { WorkspaceArtifactReferenceBody } from "@/lib/types"

vi.mock("@/api/http", () => ({
  apiBlobRequest: vi.fn(),
  apiRequest: vi.fn(),
}))

afterEach(() => {
  vi.resetAllMocks()
})

describe("knowledge base API", () => {
  it("lists owned knowledge bases and returns the newly created base", async () => {
    const base = { id: 23, name: "产品资料", description: null, user_id: 7 }
    vi.mocked(apiRequest)
      .mockResolvedValueOnce([base])
      .mockResolvedValueOnce(base)

    await expect(listMyKnowledgeBases()).resolves.toEqual([base])
    await expect(createMyKnowledgeBase({ name: base.name })).resolves.toEqual(
      base
    )
    expect(apiRequest).toHaveBeenNthCalledWith(1, "/knowledges/me")
    expect(apiRequest).toHaveBeenNthCalledWith(2, "/knowledges/me", {
      method: "POST",
      body: JSON.stringify({ name: base.name }),
    })
  })

  it("keeps documents scoped to their library and adds the current library name", async () => {
    const bases = [
      { id: 10, name: "内置资料", user_id: 0, description: null },
      { id: 23, name: "产品资料", user_id: 7, description: null },
    ]
    const document = {
      id: 101,
      knowledge_base_id: 23,
      title: "手册",
      content: "正文",
      source: null,
      file_type: "txt",
    }
    vi.mocked(apiRequest)
      .mockResolvedValueOnce(bases)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([document])

    await expect(listKnowledgeBasesWithDocuments()).resolves.toEqual([
      { ...bases[0], documents: [] },
      {
        ...bases[1],
        documents: [{ ...document, knowledge_base_name: "产品资料" }],
      },
    ])
    expect(apiRequest).toHaveBeenNthCalledWith(
      2,
      "/knowledges/10/documents/all"
    )
    expect(apiRequest).toHaveBeenNthCalledWith(
      3,
      "/knowledges/23/documents/all"
    )
  })
})

describe("registerWorkspaceArtifact", () => {
  it("registers the client workspace reference with its manifest metadata", async () => {
    const body: WorkspaceArtifactReferenceBody = {
      title: "报告",
      kind: "text",
      storage_backend: "local",
      workspace_id: "task_123",
      relative_path: "outbound/report.md",
      mime_type: "text/markdown",
      size: 42,
      sha256: "a".repeat(64),
      state: "ready",
    }
    const response = {
      id: 9,
      ...body,
      content: "",
    }
    vi.mocked(apiRequest).mockResolvedValue(response)

    await expect(registerWorkspaceArtifact(body)).resolves.toEqual(response)
    expect(apiRequest).toHaveBeenCalledWith("/artifacts/workspace-reference", {
      method: "POST",
      body: JSON.stringify(body),
    })
  })
})

describe("workspace manifest api", () => {
  it("downloads artifacts through the authenticated blob API and preserves cancellation", async () => {
    const controller = new AbortController()
    const blob = new Blob(["report"])
    vi.mocked(apiBlobRequest).mockResolvedValueOnce(blob)
    await expect(downloadArtifact(9, controller.signal)).resolves.toBe(blob)
    expect(apiBlobRequest).toHaveBeenCalledWith("/artifacts/9/content", {
      signal: controller.signal,
      silent: true,
    })
  })

  it("lists and creates workspaces", async () => {
    const workspace = {
      id: 1,
      user_id: 7,
      workspace_id: "task_1",
      name: "task_1",
      backend: "local" as const,
      object_prefix: "ai_buddy/workspaces/7/task_1",
      revision: 0,
      state: "ready" as const,
    }
    vi.mocked(apiRequest).mockResolvedValueOnce([workspace])
    vi.mocked(apiRequest).mockResolvedValueOnce(workspace)

    await expect(listWorkspaces()).resolves.toEqual([workspace])
    await expect(
      createWorkspace({ workspace_id: "task_1", backend: "local" })
    ).resolves.toEqual(workspace)
    expect(apiRequest).toHaveBeenNthCalledWith(1, "/workspaces/all")
    expect(apiRequest).toHaveBeenNthCalledWith(2, "/workspaces", {
      method: "POST",
      body: JSON.stringify({ workspace_id: "task_1", backend: "local" }),
    })
  })

  it("encodes workspace ids and preserves revisions for file writes", async () => {
    const workspaceId = "task/one"
    const file = {
      id: 2,
      user_id: 7,
      workspace_id: workspaceId,
      relative_path: "outbound/report.md",
      state: "ready" as const,
      revision: 1,
    }
    vi.mocked(apiRequest).mockResolvedValueOnce({
      id: 3,
      user_id: 7,
      workspace_id: workspaceId,
      name: "task",
      backend: "cloud" as const,
      object_prefix: "ai_buddy/workspaces/7/task-one",
      revision: 3,
      state: "active" as const,
    })
    vi.mocked(apiRequest).mockResolvedValueOnce([file])
    vi.mocked(apiRequest).mockResolvedValueOnce(file)
    vi.mocked(apiRequest).mockResolvedValueOnce(null)

    await getWorkspace(workspaceId)
    await listWorkspaceFiles(workspaceId)
    await upsertWorkspaceFile(workspaceId, {
      relative_path: file.relative_path,
      revision: file.revision,
    })
    await updateWorkspace(workspaceId, { revision: 3, state: "active" })

    expect(apiRequest).toHaveBeenNthCalledWith(1, "/workspaces/task%2Fone")
    expect(apiRequest).toHaveBeenNthCalledWith(
      2,
      "/workspaces/task%2Fone/files"
    )
    expect(apiRequest).toHaveBeenNthCalledWith(
      3,
      "/workspaces/task%2Fone/files",
      {
        method: "PUT",
        body: JSON.stringify({
          relative_path: file.relative_path,
          revision: file.revision,
        }),
      }
    )
    expect(apiRequest).toHaveBeenNthCalledWith(4, "/workspaces/task%2Fone", {
      method: "PUT",
      body: JSON.stringify({ revision: 3, state: "active" }),
    })
  })

  it("uploads and downloads cloud workspace bytes with encoded query values", async () => {
    const response = { id: 2, relative_path: "out/report.md", revision: 1 }
    vi.mocked(apiRequest).mockResolvedValueOnce(response)
    const file = new File(["hello"], "report.md", { type: "text/markdown" })

    await expect(
      uploadWorkspaceFile("task/one", "out/report.md", file, {
        revision: 0,
        size: 5,
        sha256: "a".repeat(64),
      })
    ).resolves.toEqual(response)
    expect(apiRequest).toHaveBeenCalledWith(
      "/workspaces/task%2Fone/files/content?relative_path=out%2Freport.md&revision=0&size=5&sha256=" +
        "a".repeat(64),
      expect.objectContaining({ method: "POST", body: expect.any(FormData) })
    )

    const blob = new Blob(["hello"], { type: "text/markdown" })
    vi.mocked(apiBlobRequest).mockResolvedValueOnce(blob)
    await expect(
      downloadWorkspaceFile("task/one", "out/report.md", 1)
    ).resolves.toBe(blob)
    expect(apiBlobRequest).toHaveBeenCalledWith(
      "/workspaces/task%2Fone/files/content?relative_path=out%2Freport.md&revision=1"
    )
  })
})
