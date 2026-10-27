import { describe, expect, it } from "vitest"
import {
  base64ByteSize,
  formatAttachmentSize,
  formatMimeLabel,
} from "./attachments"

describe("attachment metadata", () => {
  it("formats mime labels like the shadcn attachment examples", () => {
    expect(formatMimeLabel("image/png")).toBe("PNG")
    expect(formatMimeLabel("image/jpeg")).toBe("JPG")
    expect(formatMimeLabel("image/svg+xml")).toBe("SVG")
    expect(formatMimeLabel("application/pdf")).toBe("PDF")
  })

  it("formats sizes like the shadcn attachment examples", () => {
    expect(formatAttachmentSize(820)).toBe("820 B")
    expect(formatAttachmentSize(820 * 1024)).toBe("820 KB")
    expect(formatAttachmentSize(940 * 1024)).toBe("940 KB")
    expect(formatAttachmentSize(12 * 1024)).toBe("12 KB")
    expect(formatAttachmentSize(1.1 * 1024 * 1024)).toBe("1.1 MB")
  })

  it("measures base64 payloads and ignores remote sources", () => {
    expect(base64ByteSize(`data:image/png;base64,${btoa("hello")}`)).toBe(5)
    expect(base64ByteSize(btoa("hello"))).toBe(5)
    expect(base64ByteSize("https://example.com/image.png")).toBeUndefined()
  })
})
