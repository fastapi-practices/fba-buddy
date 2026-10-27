import { describe, expect, it } from "vitest"

import { knowledgeImageOverview } from "@/features/workspace/knowledge-image-overview"

describe("knowledge image overview", () => {
  it("separates the image placeholder from OCR text", () => {
    expect(
      knowledgeImageOverview(
        {
          id: 2,
          title: "发票",
          source: "uploads/invoice.png",
          knowledge_base_id: 10,
          file_type: "image",
        },
        "[image] 239e718e-2725-4c7a-8e01-f9ba2f8ac9cd.png\n\n发票号码：123456"
      )
    ).toEqual({
      source: null,
      filename: "239e718e-2725-4c7a-8e01-f9ba2f8ac9cd.png",
      text: "发票号码：123456",
    })
  })
})
