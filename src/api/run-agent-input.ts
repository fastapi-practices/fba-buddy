import type { RunAgentInput } from "@ag-ui/core"

import { parseRunAgentInput } from "./ag-ui"

export function createRunAgentInput(
  input: Pick<RunAgentInput, "messages" | "forwardedProps" | "resume"> &
    Partial<
      Pick<RunAgentInput, "state" | "tools" | "context" | "parentRunId">
    > & {
      threadId?: string | null
    }
): RunAgentInput {
  const resume = input.resume?.length ? input.resume : undefined
  const forwardedProps = Object.fromEntries(
    Object.entries(input.forwardedProps ?? {}).filter(
      ([, value]) => value !== undefined
    )
  )
  return parseRunAgentInput({
    threadId: input.threadId?.trim() || crypto.randomUUID(),
    runId: crypto.randomUUID(),
    messages: resume ? [] : input.messages,
    tools: input.tools ?? [],
    context: input.context ?? [],
    state: input.state ?? {},
    ...(input.parentRunId ? { parentRunId: input.parentRunId } : {}),
    forwardedProps,
    ...(resume ? { resume } : {}),
  })
}
