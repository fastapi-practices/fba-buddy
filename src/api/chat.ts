import { dataSourceKey } from "@/lib/account-source"
import { importAcpInputFiles } from "@/api/acp-input-files"
import { translateCurrent } from "@/lib/i18n"
import { withExecutionStream } from "@/api/local-execution"
import { apiRequest, apiStream } from "@/api/http"
import { throwIfStreamFailed } from "@/api/stream"
import { toChatCompletionBody } from "@/api/chat-body"
import type { ChatSendPayload } from "@/lib/types"

export function polishChat(
  body: {
    text: string
    provider_id?: number | null
    model_id?: string | null
  },
  signal?: AbortSignal
) {
  return apiRequest<{ text: string }>("/chat/polish", {
    method: "POST",
    silent: true,
    signal,
    body: JSON.stringify({
      text: body.text,
      providerId: body.provider_id || undefined,
      modelId: body.model_id || undefined,
    }),
  })
}

export async function streamCompletion(
  body: ChatSendPayload,
  signal?: AbortSignal,
  options?: { onRequest?: () => void }
) {
  const sourceKey = dataSourceKey()
  let messages = body.messages
  let importedHashes: string[] | undefined
  return withExecutionStream(
    body.conversation_id,
    body.forwarded_props,
    async (props) => {
      const response = await apiStream("/chat/completions", {
        method: "POST",
        body: JSON.stringify(
          toChatCompletionBody({
            ...body,
            messages,
            forwarded_props: {
              ...props,
              acp_imported_attachment_hashes: importedHashes,
            },
          })
        ),
        signal,
        onRequest: options?.onRequest,
        headers: {
          Accept: "text/event-stream",
        },
      })
      await throwIfStreamFailed(
        response,
        translateCurrent("common.generationFailed")
      )
      return response
    },
    signal,
    async () => {
      signal?.throwIfAborted()
      if (sourceKey !== dataSourceKey())
        throw new DOMException("账号已切换", "AbortError")
      if (!body.conversation_id) throw new Error("本地执行需要会话标识")
      const imported = await importAcpInputFiles(
        body.conversation_id,
        body.messages,
        signal
      )
      messages = imported.messages
      importedHashes = imported.hashes
    },
    body.project_id
  )
}
