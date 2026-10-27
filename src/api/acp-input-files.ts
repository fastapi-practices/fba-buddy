import { translateCurrent } from "@/lib/i18n"
import { currentAccountSource, dataSourceKey } from "@/lib/account-source"
import type { ChatSendPayload, OutgoingContentPart } from "@/lib/types"

const MAX_FILE_BYTES = 10 * 1024 * 1024

export async function importAcpInputFiles(
  conversationId: string,
  messages: ChatSendPayload["messages"],
  signal?: AbortSignal
): Promise<{ messages: ChatSendPayload["messages"]; hashes: string[] }> {
  const source = currentAccountSource()
  const epoch = dataSourceKey()
  const check = () => {
    signal?.throwIfAborted()
    if (dataSourceKey() !== epoch)
      throw new DOMException("账号已切换", "AbortError")
  }
  const results: ChatSendPayload["messages"] = []
  const hashes = new Set<string>()
  for (const message of messages) {
    if (typeof message.content === "string") {
      results.push(message)
      continue
    }
    const notes: OutgoingContentPart[] = []
    for (const part of message.content) {
      check()
      if (part.type === "text" || part.source.type !== "data") {
        continue
      }
      if (!source || !window.buddyDesktop?.workspace)
        throw new Error(translateCurrent("common.acpAttachmentUnavailable"))
      let data = part.source.value
      if (data.startsWith("data:")) {
        const match = /^data:[^,]*;base64,(.*)$/s.exec(data)
        if (!match)
          throw new Error(translateCurrent("common.acpAttachmentInvalid"))
        data = match[1]
      }
      if (data.length > Math.ceil(MAX_FILE_BYTES / 3) * 4)
        throw new Error(translateCurrent("common.acpAttachmentTooLarge"))
      let raw: string
      try {
        raw = atob(data)
      } catch {
        throw new Error(translateCurrent("common.acpAttachmentInvalid"))
      }
      if (raw.length > MAX_FILE_BYTES || btoa(raw) !== data)
        throw new Error(translateCurrent("common.acpAttachmentInvalid"))
      const bytes = Uint8Array.from(raw, (value) => value.charCodeAt(0))
      const sha256 = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
        (value) => value.toString(16).padStart(2, "0")
      ).join("")
      const filename =
        (part.metadata?.filename ?? "attachment")
          .split(/[\\/]/)
          .pop()!
          .replace(/[^a-zA-Z0-9._-]/g, "_")
          .replace(/^[^a-zA-Z0-9]+/, "")
          .slice(0, 120) || "attachment"
      const path = `inbound/${sha256}-${filename}`
      check()
      const result = await window.buddyDesktop.workspace({
        action: "write-input-file",
        source,
        conversationId,
        path,
        data,
        sha256,
      })
      check()
      if (
        !result ||
        !("inputFile" in result) ||
        result.inputFile.relative_path !== path ||
        result.inputFile.sha256 !== sha256 ||
        result.inputFile.size !== bytes.length
      )
        throw new Error(translateCurrent("common.acpAttachmentUnconfirmed"))
      hashes.add(sha256)
      notes.push({
        type: "text",
        text: `User attachment imported into the current workspace: ${path} (${bytes.length} bytes, SHA-256 ${sha256})`,
      })
    }
    results.push({ ...message, content: [...message.content, ...notes] })
  }
  return { messages: results, hashes: [...hashes] }
}
