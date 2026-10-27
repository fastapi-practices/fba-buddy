import { describe, expect, it } from "vitest"
import type { KnowledgeFileType } from "@/lib/types"

import {
  KNOWLEDGE_UPLOAD_ACCEPT,
  knowledgeUploadFileType,
  supportsKnowledgeUpload,
} from "./knowledge-file-types"

describe("knowledge upload file types", () => {
  it.each<[string, KnowledgeFileType]>([
    ["notes.md", "md"],
    ["notes.MARKDOWN", "md"],
    ["notes.txt", "txt"],
    ["notes.TEXT", "txt"],
    ["report.pdf", "pdf"],
    ["report.docx", "docx"],
    ["slides.pptx", "pptx"],
    ["sales.xlsx", "xlsx"],
    ...["png", "jpg", "jpeg", "webp", "gif", "bmp", "tif", "tiff"].map(
      (extension): [string, KnowledgeFileType] => [
        `scan.${extension.toUpperCase()}`,
        "image",
      ]
    ),
  ])("accepts %s and normalizes to the response enum %s", (name, type) => {
    expect(supportsKnowledgeUpload(name)).toBe(true)
    expect(knowledgeUploadFileType(name)).toBe(type)
    const extension = name.split(".").at(-1)!.toLowerCase()
    expect(KNOWLEDGE_UPLOAD_ACCEPT.split(",")).toContain(`.${extension}`)
  })

  it("accepts ZIP archives without treating them as a document file type", () => {
    expect(supportsKnowledgeUpload("documents.ZIP")).toBe(true)
    expect(knowledgeUploadFileType("documents.ZIP")).toBeNull()
    expect(KNOWLEDGE_UPLOAD_ACCEPT.split(",")).toContain(".zip")
  })

  it.each([
    "data.csv",
    "page.html",
    "data.json",
    "report.doc",
    "sales.xls",
    "slides.ppt",
    "scan.svg",
    "notes.md.exe",
    "README",
    "md",
    "txt",
    "image",
    "file.",
    "file.constructor",
    "",
  ])("rejects unsupported or missing extensions in %s", (name) => {
    expect(supportsKnowledgeUpload(name)).toBe(false)
    expect(knowledgeUploadFileType(name)).toBeNull()
  })
})
