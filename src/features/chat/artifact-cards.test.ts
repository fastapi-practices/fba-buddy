import { describe, expect, it } from "vitest"

import {
  artifactCardsFromMessages,
  artifactWordCount,
  type ArtifactMessageLike,
} from "./artifact-cards"

const call = (
  id: string,
  args: unknown,
  result?: unknown,
  status = result === undefined ? "running" : "complete"
) => ({
  type: "tool-call",
  toolName: "write_artifact",
  toolCallId: id,
  args,
  ...(result === undefined ? {} : { result }),
  status,
})

const deliveryCall = (
  id: string,
  args: unknown,
  result?: unknown,
  status = result === undefined ? "running" : "complete"
) => ({ ...call(id, args, result, status), toolName: "deliver_file" })

const message = (
  parts: ArtifactMessageLike["content"]
): ArtifactMessageLike => ({
  role: "assistant",
  content: parts,
})

describe("artifactCardsFromMessages", () => {
  it("创建和更新同一产物时合并为递增版本", () => {
    const cards = artifactCardsFromMessages([
      message([
        call(
          "create-report",
          { title: "检查报告", kind: "document", content: "# 报告" },
          "已保存产物 #42 检查报告"
        ),
        call(
          "update-report",
          {
            artifact_id: 42,
            title: "检查报告",
            kind: "document",
            content: "# 最终报告",
          },
          "已更新产物 #42"
        ),
      ]),
    ])

    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({
      artifactId: "42",
      title: "检查报告",
      kind: "document",
      generating: false,
      change: "updated",
      version: 2,
    })
  })

  it("写入中使用工具调用标识并计算实时字数", () => {
    const cards = artifactCardsFromMessages([
      message([
        call("working-doc", {
          title: "正在写入的说明",
          kind: "text",
          content: "hello world 这是中文内容",
        }),
      ]),
    ])

    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({
      id: "tool:working-doc",
      generating: true,
      change: "created",
      version: 1,
      words: 8,
    })
  })

  it("解析字符串参数与结果并跳过失败调用", () => {
    const cards = artifactCardsFromMessages([
      message([
        call(
          "string-call",
          JSON.stringify({
            title: "字符串参数",
            kind: "other",
            content: "content",
          }),
          JSON.stringify({ artifact_id: 7 })
        ),
        {
          ...call("failed", { title: "失败", content: "x" }, "error"),
          isError: true,
        },
        {
          type: "tool-call",
          toolName: "read",
          toolCallId: "read-1",
          args: "{}",
          result: "ok",
          status: "complete",
        },
      ]),
    ])

    expect(cards).toEqual([
      {
        id: "artifact:7",
        toolCallId: "string-call",
        artifactId: "7",
        title: "字符串参数",
        kind: "other",
        words: 1,
        generating: false,
        generation: "write",
        change: "created",
        version: 1,
      },
    ])
  })

  it("把服务端沙箱文件交付识别为持久产物", () => {
    const cards = artifactCardsFromMessages([
      message([
        deliveryCall(
          "deliver-report",
          { path: "outbound/report.pdf", kind: "document" },
          JSON.stringify({
            artifact_id: 84,
            title: "发布检查报告.pdf",
            kind: "document",
            size: 4096,
            sha256: "abc",
            mime_type: "application/pdf",
          })
        ),
      ]),
    ])

    expect(cards).toEqual([
      {
        id: "artifact:84",
        toolCallId: "deliver-report",
        artifactId: "84",
        title: "发布检查报告.pdf",
        kind: "document",
        words: 0,
        generating: false,
        generation: "delivery",
        change: "created",
        version: 1,
      },
    ])
  })

  it("交付等待结果时使用路径文件名", () => {
    const cards = artifactCardsFromMessages([
      message([
        deliveryCall("deliver-notes", {
          path: "outbound/迁移说明.md",
          kind: "text",
        }),
      ]),
    ])

    expect(cards[0]).toMatchObject({
      id: "tool:deliver-notes",
      title: "迁移说明.md",
      kind: "text",
      words: 0,
      generating: true,
      generation: "delivery",
      change: "created",
    })
  })

  it("未知类型回退为文本", () => {
    const cards = artifactCardsFromMessages([
      message([
        call("kind", {
          title: "类型回退",
          kind: "markdown",
          content: "a b",
        }),
      ]),
    ])
    expect(cards[0].kind).toBe("text")
    expect(cards[0].words).toBe(2)
  })

  it("计数英文词组和中日韩字符", () => {
    expect(artifactWordCount("hello brave-world 中文内容")).toBe(6)
    expect(artifactWordCount("  ")).toBe(0)
  })
})
