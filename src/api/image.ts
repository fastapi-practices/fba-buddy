import { translateCurrent } from "@/lib/i18n"
import { apiStream } from "@/api/http"
import { throwIfStreamFailed } from "@/api/stream"
import { createRunAgentInput } from "@/api/run-agent-input"
import type { ChatSendPayload, ForwardedProps } from "@/lib/types"

function omitUndefined(
  value: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) {
      result[key] = item
    }
  }
  return result
}

export function toImageForwardedPropsApi(
  props: ForwardedProps
): Record<string, unknown> {
  return omitUndefined({
    providerId: props.provider_id,
    modelId: props.model_id,
    generationType: "image",
    background: props.image_background ?? undefined,
    inputFidelity: props.image_input_fidelity ?? undefined,
    moderation: props.image_moderation ?? undefined,
    outputCompression: props.image_output_compression ?? undefined,
    outputFormat: props.image_output_format ?? undefined,
    quality: props.image_quality ?? undefined,
    size: props.image_size ?? undefined,
    aspectRatio: props.image_aspect_ratio ?? undefined,
  })
}

export function toImageCompletionBody(payload: ChatSendPayload) {
  return createRunAgentInput({
    threadId: payload.conversation_id,
    messages: payload.messages,
    forwardedProps: toImageForwardedPropsApi(payload.forwarded_props),
  })
}

export async function streamImageGeneration(
  body: ChatSendPayload,
  signal?: AbortSignal
) {
  const response = await apiStream("/images/generations", {
    method: "POST",
    body: JSON.stringify(toImageCompletionBody(body)),
    signal,
    headers: {
      Accept: "text/event-stream",
    },
  })
  await throwIfStreamFailed(
    response,
    translateCurrent("common.generationFailed")
  )
  return response
}
