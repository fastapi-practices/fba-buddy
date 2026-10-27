import { afterEach, describe, expect, it, vi } from "vitest"

import { downloadArtifact } from "@/api/workspace"
import { PREVIEW_BYTE_LIMIT } from "@/features/chat/file-preview-data"
import type { WorkspaceArtifactItem } from "@/lib/types"
import {
  artifactPreviewMetadata,
  loadArtifactPreview,
} from "./artifact-preview"

vi.mock("@/api/workspace", () => ({ downloadArtifact: vi.fn() }))

const artifact: WorkspaceArtifactItem = {
  id: 7,
  user_id: 1,
  title: "报告",
  kind: "document",
  content: "",
  object_key: "ai_buddy/artifacts/7.pdf",
  storage_id: 17,
  relative_path: "outbound/报告.pdf",
  storage_backend: "s3",
  workspace_id: null,
  mime_type: "application/octet-stream",
  size: null,
  sha256: null,
  state: "ready",
  created_time: "2026-10-20T08:00:00Z",
  updated_time: null,
}

afterEach(() => vi.clearAllMocks())

describe("artifact preview", () => {
  it("loads authenticated bytes and supplies the PDF type without modifying the download", async () => {
    const bytes = new Blob(["%PDF-1.4\nreport"], {
      type: "application/octet-stream",
    })
    vi.mocked(downloadArtifact).mockResolvedValueOnce(bytes)
    const signal = new AbortController().signal
    const result = await loadArtifactPreview(artifact, signal)
    expect(downloadArtifact).toHaveBeenCalledWith(7, signal)
    expect(result.name).toBe("报告.pdf")
    expect(result.blob.type).toBe("application/pdf")
    expect(await result.blob.text()).toBe(await bytes.text())
    expect(bytes.type).toBe("application/octet-stream")
  })

  it("previews text, HTML and declared media while leaving Office documents for download", () => {
    expect(
      artifactPreviewMetadata({
        ...artifact,
        relative_path: null,
        kind: "text",
      })
    ).toEqual({ name: "artifact-7.md", mimeType: "text/markdown" })
    expect(
      artifactPreviewMetadata({
        ...artifact,
        relative_path: "outbound/report.html",
      })?.mimeType
    ).toBe("text/html")
    expect(
      artifactPreviewMetadata({
        ...artifact,
        relative_path: "outbound/audio",
        mime_type: "audio/wav",
      })?.mimeType
    ).toBe("audio/wav")
    expect(
      artifactPreviewMetadata({
        ...artifact,
        relative_path: "outbound/report.docx",
        mime_type:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      })
    ).toBeNull()
  })

  it.each([
    ["text", "report.MD", "text/markdown"],
    ["text", "data.json", "application/json"],
    ["document", "report.pdf", "application/pdf"],
    ["image", "photo.jpg", "image/jpeg"],
    ["audio", "recording.mp3", "audio/mpeg"],
    ["video", "clip.mp4", "video/mp4"],
  ] as const)(
    "uses the file format for a %s artifact named %s",
    (kind, name, mimeType) => {
      expect(
        artifactPreviewMetadata({
          ...artifact,
          kind,
          relative_path: `outbound/${name}`,
        })
      ).toEqual({ name, mimeType })
    }
  )

  it("uses explicit MIME metadata and does not infer a format from the category", () => {
    expect(
      artifactPreviewMetadata({
        ...artifact,
        relative_path: "outbound/data.txt",
        mime_type: " Application/JSON; charset=utf-8 ",
      })
    ).toEqual({ name: "data.txt", mimeType: "application/json" })
    for (const name of ["image", "md", "unknown.bin", "file.constructor"]) {
      expect(
        artifactPreviewMetadata({
          ...artifact,
          kind: "image",
          relative_path: `outbound/${name}`,
        })
      ).toBeNull()
    }
    expect(
      artifactPreviewMetadata({
        ...artifact,
        kind: "other",
        relative_path: null,
      })
    ).toEqual({ name: "artifact-7.md", mimeType: "text/markdown" })
  })

  it("rejects oversize manifest data before download and checks actual bytes too", async () => {
    const signal = new AbortController().signal
    await expect(
      loadArtifactPreview({ ...artifact, size: PREVIEW_BYTE_LIMIT + 1 }, signal)
    ).rejects.toThrow(RangeError)
    expect(downloadArtifact).not.toHaveBeenCalled()
    vi.mocked(downloadArtifact).mockResolvedValueOnce(
      new Blob([new Uint8Array(PREVIEW_BYTE_LIMIT + 1)])
    )
    await expect(
      loadArtifactPreview({ ...artifact, size: 1 }, signal)
    ).rejects.toThrow(RangeError)
  })

  it("discards bytes when cancelled during download", async () => {
    const controller = new AbortController()
    vi.mocked(downloadArtifact).mockImplementationOnce(async () => {
      controller.abort()
      return new Blob(["stale account data"])
    })
    await expect(
      loadArtifactPreview(artifact, controller.signal)
    ).rejects.toThrow("aborted")
  })
})
