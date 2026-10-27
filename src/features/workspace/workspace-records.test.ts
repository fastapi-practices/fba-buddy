import { describe, expect, it } from "vitest"
import type {
  WorkspaceArtifactItem,
  WorkspaceArtifactListItem,
} from "@/lib/types"

import {
  formatWorkspaceTime,
  isMarkdownFormat,
  libraryOverviewKind,
  libraryRecordDescription,
  libraryRecordInitial,
  libraryRecordKindLabel,
  libraryRecordOverview,
  libraryRecordTitle,
  libraryRecordVersion,
  matchesLibraryQuery,
  previewPlainText,
  stripMarkdownFrontmatter,
  toWorkspaceListItem,
  workspaceRecordQueryKey,
} from "@/features/workspace/workspace-records"

const artifactMetadata: WorkspaceArtifactListItem = {
  id: 4,
  user_id: 1,
  title: "草稿",
  kind: "text",
  object_key: "ai_buddy/artifacts/4.md",
  storage_id: 14,
  storage_backend: "local",
  workspace_id: "task_1",
  relative_path: "outbound/draft.md",
  mime_type: "text/markdown",
  size: 18,
  sha256: "a".repeat(64),
  state: "ready",
  created_time: "2026-10-20T08:00:00Z",
  updated_time: null,
}

describe("workspaceRecordQueryKey", () => {
  it("uses the same list keys the workspace page reads", () => {
    expect(workspaceRecordQueryKey("artifact")).toEqual(["artifacts"])
    expect(workspaceRecordQueryKey("memory")).toEqual(["memories"])
    expect(workspaceRecordQueryKey("knowledge")).toEqual(["knowledge"])
    expect(workspaceRecordQueryKey("skill")).toEqual(["skills"])
  })
})

describe("toWorkspaceListItem", () => {
  it("maps each kind to the label and preview the content page shows", () => {
    expect(
      toWorkspaceListItem("artifact", {
        ...artifactMetadata,
      })
    ).toEqual({
      key: "4",
      label: "草稿",
      preview: "outbound/draft.md",
      badge: "text",
      updatedTime: "2026-10-20T08:00:00Z",
    })
    expect(
      toWorkspaceListItem("memory", {
        path: "user/prefs",
        truncated: false,
        preview: "喜欢简洁",
      })
    ).toEqual({ key: "user/prefs", label: "user/prefs", preview: "喜欢简洁" })
    expect(
      toWorkspaceListItem("knowledge", {
        id: 6,
        title: "规范",
        knowledge_base_id: 10,
        file_type: "md",
        source: "handbook.md",
        content: "# 规范\n正文",
        created_time: "2026-09-04T02:00:00.000Z",
      })
    ).toEqual({
      key: "6",
      label: "规范",
      preview: "规范 正文",
      badge: "handbook.md",
      updatedTime: "2026-09-04T02:00:00.000Z",
    })
    expect(
      toWorkspaceListItem("skill", {
        id: 8,
        name: "摘要",
        description: "压缩长文",
        version: "0.1.0",
        content: "# 摘要\n步骤",
        updated_time: "2026-09-04T03:00:00.000Z",
      })
    ).toEqual({
      key: "8",
      label: "摘要",
      preview: "压缩长文",
      badge: "0.1.0",
      updatedTime: "2026-09-04T03:00:00.000Z",
    })
  })
})

describe("library text helpers", () => {
  it("strips skill frontmatter and flattens markdown for cards", () => {
    expect(
      stripMarkdownFrontmatter(
        "---\nname: 摘要\ndescription: 压缩\n---\n# 步骤\n先读全文"
      )
    ).toBe("# 步骤\n先读全文")
    expect(previewPlainText("# 规范\n**正文**和[链接](https://x)")).toBe(
      "规范 正文 和链接"
    )
  })

  it("matches knowledge, skill and artifact records by title, extra and body", () => {
    expect(
      matchesLibraryQuery(
        {
          id: 1,
          knowledge_base_id: 10,
          file_type: "md",
          title: "规范",
          source: "handbook.md",
          content: "安全基线",
        },
        "基线"
      )
    ).toBe(true)
    expect(
      matchesLibraryQuery(
        {
          id: 2,
          name: "摘要",
          description: "压缩长文",
          version: "0.1.0",
          content: "# 步骤",
        },
        "翻译"
      )
    ).toBe(false)
    expect(matchesLibraryQuery(artifactMetadata, "text")).toBe(true)
  })
})

describe("library dialog fields", () => {
  it.each([
    ["md", "md"],
    ["txt", "txt"],
    ["pdf", "pdf"],
    ["docx", "docx"],
    ["pptx", "pptx"],
    ["image", "image"],
    ["xlsx", "tsv"],
  ] as const)("renders %s knowledge content as %s", (file_type, expected) => {
    expect(
      libraryOverviewKind("knowledge", {
        id: 2,
        title: "文件",
        source: "original",
        knowledge_base_id: 10,
        file_type,
        content: "正文",
      })
    ).toBe(expected)
  })

  it("keeps plain text frontmatter and whitespace while removing Markdown metadata", () => {
    const document = {
      id: 2,
      title: "规范",
      source: null,
      knowledge_base_id: 10,
      file_type: "md",
      content: "---\nname: 保留文本\n---\n  # 正文\n\n",
    }
    expect(
      libraryRecordOverview("knowledge", { ...document, file_type: "txt" })
    ).toBe(document.content)
    expect(
      libraryRecordOverview("knowledge", { ...document, file_type: "md" })
    ).toBe("# 正文")
  })

  it("renders extracted spreadsheet Markdown tables without treating them as TSV", () => {
    expect(
      libraryOverviewKind("knowledge", {
        id: 2,
        title: "销售表",
        source: "sales.xlsx",
        knowledge_base_id: 10,
        file_type: "xlsx",
        content: "# 销售\n\n| 产品 | 销量 |\n| --- | ---: |\n| A | 10 |",
      })
    ).toBe("markdown")
  })

  it("keeps literal artifact text and renders Markdown according to MIME metadata", () => {
    const artifact: WorkspaceArtifactItem = {
      ...artifactMetadata,
      title: "文本产物",
      content: "---\nname: 保留文本\n---\n  # 正文\n\n",
      relative_path: "outbound/notes.txt",
      mime_type: "text/plain",
    }
    expect(libraryRecordOverview("artifact", artifact)).toBe(artifact.content)
    expect(libraryOverviewKind("artifact", artifact)).toBe("text/plain")
    expect(
      libraryRecordOverview("artifact", {
        ...artifact,
        mime_type: "text/markdown",
      })
    ).toBe("# 正文")
  })

  it("keeps description and overview separate", () => {
    const skill = {
      id: 1,
      name: "摘要",
      description: "压缩长文",
      version: "0.1.0",
      content: "---\nname: 摘要\n---\n# 步骤\n先读全文",
    }
    expect(libraryRecordDescription("skill", skill)).toBe("压缩长文")
    expect(libraryRecordOverview("skill", skill)).toBe("# 步骤\n先读全文")
    expect(
      libraryRecordDescription("knowledge", {
        id: 2,
        title: "规范",
        knowledge_base_id: 10,
        file_type: "md",
        source: "handbook.md",
        content: "# 规范\n正文",
      })
    ).toBe("")
    expect(
      libraryRecordOverview("knowledge", {
        id: 2,
        title: "规范",
        knowledge_base_id: 10,
        file_type: "md",
        source: "handbook.md",
        content: "# 规范\n正文",
      })
    ).toBe("# 规范\n正文")
  })

  it("reads skill version and skips knowledge version", () => {
    expect(
      libraryRecordVersion("skill", {
        id: 1,
        name: "摘要",
        description: null,
        version: "0.1.0",
        content: "",
      })
    ).toBe("0.1.0")
    expect(
      libraryRecordVersion("knowledge", {
        id: 2,
        title: "规范",
        knowledge_base_id: 10,
        file_type: "md",
        source: null,
        content: "",
      })
    ).toBeNull()
    expect(libraryRecordInitial("摘要")).toBe("摘")
  })

  it("maps artifact title, preview, overview and kind", () => {
    const artifact: WorkspaceArtifactItem = {
      ...artifactMetadata,
      content: "# 草稿\n正文",
    }
    expect(libraryRecordTitle("artifact", artifact)).toBe("草稿")
    expect(libraryRecordDescription("artifact", artifact)).toBe(
      "outbound/draft.md"
    )
    expect(libraryRecordOverview("artifact", artifact)).toBe("# 草稿\n正文")
    expect(libraryRecordKindLabel("artifact", artifact)).toBe("文本")
    expect(libraryOverviewKind("artifact", artifact)).toBe("text/markdown")
    expect(libraryRecordVersion("artifact", artifact)).toBeNull()
  })
})

describe("isMarkdownFormat", () => {
  it("treats markdown aliases as previewable", () => {
    expect(isMarkdownFormat("markdown")).toBe(true)
    expect(isMarkdownFormat("MD")).toBe(true)
    expect(isMarkdownFormat("text/markdown")).toBe(true)
    expect(isMarkdownFormat("json")).toBe(false)
  })
})

describe("formatWorkspaceTime", () => {
  it("formats a valid timestamp and ignores empty values", () => {
    expect(formatWorkspaceTime(undefined)).toBe("")
    expect(formatWorkspaceTime("not-a-date")).toBe("")
    expect(formatWorkspaceTime("2026-09-04T02:00:00.000Z")).not.toBe("")
  })
})
