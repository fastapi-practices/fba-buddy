import { describe, expect, it } from "vitest"

import {
  snapshotActivityAttachment,
  snapshotAttachment,
  snapshotContent,
} from "./snapshot-parts"

describe("native AG-UI snapshot attachments", () => {
  it("restores typed image and document sources with their metadata", () => {
    const snapshot = snapshotContent({
      id: "user-1",
      role: "user",
      content: [
        { type: "text", text: "Review these files" },
        {
          type: "image",
          source: { type: "data", value: "aW1hZ2U=", mimeType: "image/webp" },
          metadata: { filename: "reference.webp", size: 5 },
        },
        {
          type: "document",
          source: {
            type: "url",
            value: "https://example.com/report.pdf",
            mimeType: "application/pdf",
          },
          metadata: { filename: "report.pdf", size: 10 },
        },
      ],
    })
    expect(snapshot.parts.map((part) => part.type)).toEqual([
      "text",
      "attachment",
      "attachment",
    ])
    expect(snapshot.attachments).toMatchObject([
      {
        name: "reference.webp",
        mime: "image/webp",
        data: "aW1hZ2U=",
        kind: "image",
        size: 5,
      },
      {
        name: "report.pdf",
        mime: "application/pdf",
        url: "https://example.com/report.pdf",
        data: "",
        kind: "document",
        size: 10,
      },
    ])
  })

  it("restores generated files from the Pydantic AI activity contract", () => {
    expect(
      snapshotActivityAttachment(
        {
          role: "activity",
          activityType: "pydantic_ai_file",
          content: {
            url: "data:image/png;base64,aW1hZ2U=",
            media_type: "image/png",
          },
        },
        "generated-image"
      )
    ).toMatchObject({
      id: "generated-image",
      kind: "image",
      mime: "image/png",
      data: "aW1hZ2U=",
    })
    expect(
      snapshotActivityAttachment(
        {
          activityType: "pydantic_ai_file",
          content: {
            url: "https://example.com/output.pdf",
            media_type: "application/pdf",
          },
        },
        "generated-document"
      )
    ).toMatchObject({
      kind: "document",
      mime: "application/pdf",
      url: "https://example.com/output.pdf",
      data: "",
    })
  })

  it("keeps audio and video kinds when URL sources omit MIME metadata", () => {
    const snapshot = snapshotContent({
      id: "media-input",
      role: "user",
      content: [
        {
          type: "audio",
          source: { type: "url", value: "https://example.com/audio" },
        },
        {
          type: "video",
          source: { type: "url", value: "https://example.com/video" },
        },
      ],
    })
    expect(snapshot.attachments).toMatchObject([
      { kind: "audio", url: "https://example.com/audio", data: "" },
      { kind: "video", url: "https://example.com/video", data: "" },
    ])
  })

  it("does not interpret non-native content and sources as attachments", () => {
    for (const content of [
      { type: "binary", data: "YWJj", mimeType: "image/png" },
      {
        type: "image_url",
        image_url: { url: "https://example.com/image.png" },
      },
      { type: "image", source: { type: "id", value: "file-1" } },
      { part_kind: "image", source: { type: "data", value: "YWJj" } },
    ])
      expect(snapshotAttachment(content, "invalid")).toBeNull()
  })

  it("leaves other activities and incomplete file payloads to their own renderers", () => {
    expect(
      snapshotActivityAttachment(
        { activityType: "pydantic_ai_compaction", content: {} },
        "compaction"
      )
    ).toBeNull()
    expect(
      snapshotActivityAttachment(
        {
          activityType: "pydantic_ai_file",
          content: { media_type: "image/png" },
        },
        "missing"
      )
    ).toBeNull()
  })
})
