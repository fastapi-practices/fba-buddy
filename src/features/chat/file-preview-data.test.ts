import { describe, expect, it } from "vitest"
import {
  filterSortCsvRows,
  PREVIEW_BYTE_LIMIT,
  readPreviewText,
} from "./file-preview-data"

describe("file preview data", () => {
  it("searches every row and sorts numbers while retaining original rows", () => {
    const rows = [
      ["Item 10", "yes"],
      ["Item 2", "YES"],
      ["Item 1", "no"],
    ]
    expect(
      filterSortCsvRows(rows, "yes", { column: 0, descending: false })
    ).toEqual([
      ["Item 2", "YES"],
      ["Item 10", "yes"],
    ])
    expect(
      filterSortCsvRows(rows, "", { column: 0, descending: true })[0]
    ).toEqual(["Item 10", "yes"])
    expect(rows[1]).toEqual(["Item 2", "YES"])
  })
  it("reads text over the former 2 MB limit without losing split UTF-8 characters", async () => {
    const bytes = new TextEncoder().encode("文件")
    const prefix = "x".repeat(2 * 1024 * 1024 + 1)
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(prefix))
          controller.enqueue(bytes.slice(0, 2))
          controller.enqueue(bytes.slice(2))
          controller.close()
        },
      })
    )
    expect(await readPreviewText(response, new AbortController().signal)).toBe(
      prefix + "文件"
    )
  })
  it("enforces the byte cap even when the server omits content length", async () => {
    let canceled = false
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(PREVIEW_BYTE_LIMIT + 1))
        },
        cancel() {
          canceled = true
        },
      })
    )
    await expect(
      readPreviewText(response, new AbortController().signal)
    ).rejects.toBeInstanceOf(RangeError)
    expect(canceled).toBe(true)
  })
})
