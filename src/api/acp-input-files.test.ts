import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { importAcpInputFiles } from "./acp-input-files"
import { currentAccountSource, dataSourceKey } from "@/lib/account-source"
import type { ChatSendPayload } from "@/lib/types"

vi.mock("@/lib/account-source", () => ({
  currentAccountSource: vi.fn(),
  dataSourceKey: vi.fn(),
}))
const source = { accountId: "1", backendUrl: "http://localhost/api/v1" }
const workspace = vi.fn(async (request) => ({
  inputFile: {
    relative_path: request.path,
    sha256: request.sha256,
    size: atob(request.data).length,
  },
}))
const messages = (
  data = btoa("\x00\xffbinary")
): ChatSendPayload["messages"] => [
  {
    id: "m",
    role: "user",
    content: [
      {
        type: "document",
        source: {
          type: "data",
          value: data,
          mimeType: "application/octet-stream",
        },
        metadata: { filename: "../../original.bin" },
      },
    ],
  },
]
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(currentAccountSource).mockReturnValue(source)
  vi.mocked(dataSourceKey).mockReturnValue("account-1")
  vi.stubGlobal("window", { buddyDesktop: { workspace } })
})
afterEach(() => vi.unstubAllGlobals())

it("imports exact bytes under a digest path and sends the confirmed local path", async () => {
  const result = await importAcpInputFiles("chat", messages())
  const request = workspace.mock.calls[0][0]
  expect(request).toMatchObject({
    action: "write-input-file",
    conversationId: "chat",
    source,
    data: btoa("\x00\xffbinary"),
  })
  expect(request.path).toMatch(/^inbound\/[a-f0-9]{64}-original.bin$/)
  expect(result.messages[0].content).toEqual([
    (messages()[0].content as unknown[])[0],
    { type: "text", text: expect.stringContaining(request.path) },
  ])
  expect(result.hashes).toEqual([request.sha256])
})

it("keeps small images for native vision and adds their workspace path", async () => {
  const input = messages()
  const content = input[0].content as Exclude<
    ChatSendPayload["messages"][number]["content"],
    string
  >
  content[0] = {
    type: "image",
    source: { type: "data", value: btoa("image"), mimeType: "image/png" },
  }
  const result = await importAcpInputFiles("chat", input)
  expect(result.messages[0].content).toEqual([
    content[0],
    { type: "text", text: expect.stringContaining("inbound/") },
  ])
})

it("rejects oversize or malformed input before IPC", async () => {
  await expect(importAcpInputFiles("chat", messages("?"))).rejects.toThrow()
  await expect(
    importAcpInputFiles("chat", messages("A".repeat(14 * 1024 * 1024)))
  ).rejects.toThrow("10 MiB")
  expect(workspace).not.toHaveBeenCalled()
})

it("does not send stale path metadata after account changes during import", async () => {
  workspace.mockImplementationOnce(async (request) => {
    vi.mocked(dataSourceKey).mockReturnValue("account-2")
    return {
      inputFile: {
        relative_path: request.path,
        sha256: request.sha256,
        size: 8,
      },
    }
  })
  await expect(importAcpInputFiles("chat", messages())).rejects.toThrow(
    "账号已切换"
  )
})

it("rejects an unconfirmed result and respects cancellation", async () => {
  workspace.mockResolvedValueOnce({
    inputFile: { relative_path: "wrong", sha256: "wrong", size: 0 },
  })
  await expect(importAcpInputFiles("chat", messages())).rejects.toThrow(
    "未确认"
  )
  const controller = new AbortController()
  controller.abort()
  await expect(
    importAcpInputFiles("chat", messages(), controller.signal)
  ).rejects.toThrow()
  expect(workspace).toHaveBeenCalledTimes(1)
})
