import { describe, expect, it } from "vitest"

import { imageResultFromMessages } from "@/features/image/image-result"
import type { ChatAttachment, ChatMessage } from "@/lib/types"

function image(patch: Partial<ChatAttachment> = {}): ChatAttachment {
  return {
    id: "generated-image",
    name: "image.png",
    kind: "image",
    mime: "image/png",
    size: 0,
    data: "aGVsbG8=",
    ...patch,
  }
}

describe("imageResultFromMessages", () => {
  it("reads generated image attachments without any streamed text", () => {
    expect(
      imageResultFromMessages([
        { id: "a1", role: "assistant", content: "", attachments: [image()] },
      ])
    ).toMatchObject({
      content: "",
      urls: ["data:image/png;base64,aGVsbG8="],
      failed: false,
    })
  })

  it("only reads the current generated turn and filters other attachments", () => {
    const messages: ChatMessage[] = [
      { id: "u1", role: "user", content: "old" },
      { id: "a1", role: "assistant", content: "", attachments: [image()] },
      { id: "u2", role: "user", content: "new", attachments: [image()] },
      {
        id: "a2",
        role: "assistant",
        content: "Generated",
        attachments: [
          image({ data: "", url: "https://example.com/new-image" }),
          image({ kind: "document", mime: "application/pdf", data: "cGRm" }),
          image({ sourceType: "id", data: "unresolved-file-id" }),
        ],
      },
    ]
    expect(imageResultFromMessages(messages).urls).toEqual([
      "https://example.com/new-image",
    ])
  })

  it("prioritizes native attachments and retains distinct text image URLs", () => {
    const generatedUrl = "https://example.com/generated.png"
    const result = imageResultFromMessages([
      {
        id: "a1",
        role: "assistant",
        content: `![copy](${generatedUrl}) ![other](https://example.com/other.png)`,
        attachments: [image({ data: "", url: generatedUrl })],
      },
      {
        id: "file2",
        role: "assistant",
        content: "",
        attachments: [image({ data: "data:image/png;base64,Y2F0" })],
      },
    ])
    expect(result.urls).toEqual([
      generatedUrl,
      "data:image/png;base64,Y2F0",
      "https://example.com/other.png",
    ])
  })

  it("preserves run failure details", () => {
    expect(
      imageResultFromMessages([
        {
          id: "a1",
          role: "assistant",
          content: "",
          status: "error",
          error: "quota",
        },
      ])
    ).toMatchObject({ failed: true, error: "quota" })
  })
})
