import { apiRequest } from "@/api/http"
import type {
  SlashCommandItem,
  SlashEntry,
  SlashExecuteBody,
  SlashExecuteResult,
} from "@/lib/types"

export function listSlashCommands(origin: SlashEntry = "web") {
  const search = new URLSearchParams()
  if (origin !== "web") {
    search.set("origin", origin)
  }
  const query = search.toString()
  return apiRequest<SlashCommandItem[]>(
    `/slash${query ? `?${query}` : ""}`
  )
}

export function executeSlash(body: SlashExecuteBody) {
  return apiRequest<SlashExecuteResult>("/slash", {
    method: "POST",
    body: JSON.stringify({
      command: body.command,
      conversation_id: body.conversation_id ?? undefined,
      args: body.args ?? undefined,
      origin: body.origin ?? "web",
      draft: body.draft ?? undefined,
    }),
  })
}
