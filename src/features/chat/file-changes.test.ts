import { describe, expect, it } from "vitest"
import type { ThreadMessage, ToolCallMessagePart } from "@/features/chat/thread-types"
import { fileChanges, turnFileChanges } from "./file-changes"

function tool(
  id: string,
  name: string,
  path: string,
  result?: unknown
): ToolCallMessagePart {
  return {
    type: "tool-call",
    toolCallId: id,
    toolName: name,
    args: { path },
    argsText: "",
    result,
  }
}

function message(
  id: string,
  role: "user" | "assistant",
  content: ThreadMessage["content"] = [],
  running = false
): ThreadMessage {
  return {
    id,
    role,
    content,
    status: { type: running ? "running" : "complete" },
  } as ThreadMessage
}

describe("file changes", () => {
  it("counts only completed writes, excluding reads, failures and declined calls", () => {
    const changes = fileChanges([
      tool("read", "read_file", "src/read.ts", "contents"),
      tool("pending", "edit_file", "src/pending.ts"),
      {
        ...tool("failed", "write_file", "src/failed.ts", { additions: 10 }),
        isError: true,
      },
      {
        ...tool("declined", "edit_file", "src/declined.ts", { additions: 20 }),
        providerMetadata: { buddy: { status: "declined" } },
      },
      tool("done", "write_file", "src/done.ts", { additions: 3, deletions: 1 }),
    ])
    expect(changes.fileCount).toBe(1)
    expect(changes.totalAdditions).toBe(3)
    expect(changes.totalDeletions).toBe(1)
    expect(changes.files.map((file) => file.path)).toEqual(["src/done.ts"])
  })

  it("combines repeated edits across groups without counting a duplicated tool call twice", () => {
    const first = tool("one", "edit", "./src/a.ts", {
      linesAdded: 3,
      linesRemoved: 1,
    })
    const changes = fileChanges([
      first,
      tool("two", "edit_file", "src\\a.ts", '{"added":"2","removed":"4"}'),
      first,
    ])
    expect(changes.fileCount).toBe(1)
    expect(changes.totalAdditions).toBe(5)
    expect(changes.totalDeletions).toBe(5)
    expect(changes.files.at(-1)).toMatchObject({
      path: "src/a.ts",
      additions: 5,
      deletions: 5,
    })
  })

  it("places the whole turn's changes on its last assistant message and isolates later turns", () => {
    const messages = [
      message("u1", "user"),
      message("a1", "assistant", [
        tool("one", "edit", "src/a.ts", { additions: 2 }),
      ]),
      message("a2", "assistant", [{ type: "text", text: "Done" }]),
      message("u2", "user"),
      message(
        "a3",
        "assistant",
        [tool("two", "write", "src/b.ts", { additions: 7 })],
        true
      ),
    ]
    expect(turnFileChanges(messages, "a1")).toMatchObject({
      messageId: "a2",
      fileCount: 1,
      totalAdditions: 2,
      pending: false,
    })
    expect(turnFileChanges(messages, "a2")).toMatchObject({
      messageId: "a2",
      fileCount: 1,
    })
    expect(turnFileChanges(messages)).toMatchObject({
      messageId: "a3",
      fileCount: 1,
      totalAdditions: 7,
      pending: true,
    })
    expect(turnFileChanges([...messages, message("u3", "user")])).toMatchObject(
      { fileCount: 0 }
    )
  })
})
