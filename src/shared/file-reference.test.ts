import { describe, expect, it } from "vitest"
import {
  parseFileReference,
  resolveReferencePath,
  mediaKind,
} from "./file-reference"

describe("workspace references", () => {
  it.each([
    ["src/a file.ts:12:3", { path: "src/a file.ts", line: 12, column: 3 }],
    [
      "C:\\Work Space\\src\\main.ts:8:2",
      { path: "C:\\Work Space\\src\\main.ts", line: 8, column: 2 },
    ],
    [
      "file:///C:/Work%20Space/main.ts#L8C2-L9C4",
      { path: "C:/Work Space/main.ts", line: 8, column: 2 },
    ],
    [
      "file://server/share/项目/main.ts:4",
      { path: "//server/share/项目/main.ts", line: 4 },
    ],
    [
      "\\\\server\\share\\Makefile:7",
      { path: "\\\\server\\share\\Makefile", line: 7 },
    ],
    ["Makefile:7", { path: "Makefile", line: 7 }],
    [".env", { path: ".env" }],
    ["custom config:7:2", { path: "custom config", line: 7, column: 2 }],
    ["README.md#L9", { path: "README.md", line: 9 }],
  ])("parses %s", (value, expected) =>
    expect(parseFileReference(value)).toEqual(expected)
  )
  it.each([
    "javascript:x.ts:2",
    "https://example.com/file.ts",
    "example.com",
    "#missing",
    "file://user:pass@host/a.txt",
    "README.md\nother",
    "%E0%A4%A",
  ])("rejects %s", (value) => expect(parseFileReference(value)).toBeNull())
  it("resolves Markdown assets relative to the document and classifies query-bearing media", () => {
    expect(resolveReferencePath("../images/chart.png", "docs/guide")).toBe(
      "docs/guide/../images/chart.png"
    )
    expect(resolveReferencePath("/workspace/chart.png", "docs")).toBe(
      "/workspace/chart.png"
    )
    expect(mediaKind("https://example.com/clip.MP4?token=1#t=3")).toBe("video")
  })
})
