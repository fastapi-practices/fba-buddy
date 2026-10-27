import { describe, expect, it } from "vitest"
import { imageFollowUpMessage } from "./image-follow-up"
import { imageConversationMessages } from "./image-conversations"
import { conversationDetailFixture } from "@/test/conversation-fixtures"

describe("image follow-up references", () => {
  it("carries every native file from the last image turn through a failed follow-up", () => {
    const history = imageConversationMessages(
      conversationDetailFixture({
        id: 1,
        title: "two cats",
        messages_snapshot: {
          messages: [
            { id: "user", role: "user", content: "draw two cats" },
            {
              id: "reply",
              role: "assistant",
              content: "Here are two versions",
            },
            {
              id: "file-a",
              role: "activity",
              activityType: "pydantic_ai_file",
              content: {
                url: "data:image/png;base64,YQ==",
                media_type: "image/png",
              },
            },
            {
              id: "file-b",
              role: "activity",
              activityType: "pydantic_ai_file",
              content: {
                url: "https://images.example/b.webp",
                media_type: "image/webp",
              },
            },
            { id: "retry-user", role: "user", content: "make them blue" },
            {
              id: "retry-error",
              role: "assistant",
              content: "",
              is_error: true,
              error: "quota exceeded",
            },
          ],
        },
      })
    )
    const { outgoing, message } = imageFollowUpMessage("try again", history)
    expect(outgoing.content).toEqual([
      { type: "text", text: "try again" },
      {
        type: "image",
        source: { type: "data", value: "YQ==", mimeType: "image/png" },
      },
      {
        type: "image",
        source: {
          type: "url",
          value: "https://images.example/b.webp",
          mimeType: "image/webp",
        },
      },
    ])
    expect(message.attachments).toHaveLength(2)
  })
})
