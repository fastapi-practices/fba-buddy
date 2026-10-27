import { describe, expect, it } from "vitest"

import { formatAttachmentSize } from "@/features/chat/attachments"
import {
  composerAttachmentFromState,
  composerAttachmentMeta,
  normalizeAttachmentProgress,
} from "@/features/chat/composer-attachments"

describe("normalizeAttachmentProgress", () => {
  it("treats 0-1 as a fraction and larger values as percent", () => {
    expect(normalizeAttachmentProgress(0.42)).toBe(42)
    expect(normalizeAttachmentProgress(42)).toBe(42)
    expect(normalizeAttachmentProgress(150)).toBe(100)
    expect(normalizeAttachmentProgress(undefined)).toBeUndefined()
  })
})

describe("composerAttachmentFromState", () => {
  it("maps an uploading image", () => {
    expect(
      composerAttachmentFromState({
        name: "shot.png",
        type: "image",
        size: 1200,
        mime: "image/png",
        status: { type: "running", reason: "uploading", progress: 42 },
      })
    ).toEqual({
      name: "shot.png",
      kind: "image",
      state: "uploading",
      progress: 42,
      size: 1200,
      mime: "image/png",
    })
  })

  it("maps a staged file waiting to send as done", () => {
    expect(
      composerAttachmentFromState({
        name: "spec.pdf",
        type: "document",
        size: 2048,
        mime: "application/pdf",
        status: { type: "requires-action", reason: "composer-send" },
      })
    ).toEqual({
      name: "spec.pdf",
      kind: "file",
      state: "done",
      size: 2048,
      mime: "application/pdf",
    })
  })

  it("maps an adapter error", () => {
    expect(
      composerAttachmentFromState({
        name: "dump.bin",
        type: "file",
        status: {
          type: "incomplete",
          reason: "error",
          message: "too large",
        },
      })
    ).toEqual({
      name: "dump.bin",
      kind: "file",
      state: "error",
      errorMessage: "too large",
    })
  })
})

describe("composerAttachmentMeta", () => {
  it("shows percent while uploading and size when done", () => {
    expect(
      composerAttachmentMeta(
        {
          name: "a.png",
          kind: "image",
          state: "uploading",
          progress: 62,
        },
        { uploading: "上传中", error: "上传失败" }
      )
    ).toBe("62%")
    expect(
      composerAttachmentMeta(
        {
          name: "a.png",
          kind: "image",
          state: "done",
          size: 2048,
          mime: "image/png",
        },
        { uploading: "上传中", error: "上传失败" }
      )
    ).toBe(`PNG · ${formatAttachmentSize(2048)}`)
  })

  it("falls back to error and uploading labels", () => {
    expect(
      composerAttachmentMeta(
        { name: "a", kind: "file", state: "error" },
        { uploading: "上传中", error: "上传失败" }
      )
    ).toBe("上传失败")
    expect(
      composerAttachmentMeta(
        { name: "a", kind: "file", state: "uploading" },
        { uploading: "上传中", error: "上传失败" }
      )
    ).toBe("上传中")
  })
})
