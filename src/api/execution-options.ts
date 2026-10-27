import { apiRequest } from "@/api/http"
import type { ExecutionDefaults } from "@/shared/execution"
import { EXECUTION_PROTOCOL_CAPABILITIES } from "@/shared/execution"

export async function getExecutionDefaults(
  signal?: AbortSignal
): Promise<ExecutionDefaults | undefined> {
  try {
    const result = await apiRequest<{
      default_backend: unknown
      capabilities: unknown
    }>("/execution/options", { signal, silent: true })
    if (
      !result ||
      (result.default_backend !== "local" &&
        result.default_backend !== "sandbox") ||
      !Array.isArray(result.capabilities) ||
      result.capabilities.some((capability) => typeof capability !== "string")
    )
      return undefined
    const advertisedCapabilities = result.capabilities
    const capabilities = EXECUTION_PROTOCOL_CAPABILITIES.filter((capability) =>
      advertisedCapabilities.includes(capability)
    )
    return {
      backend: result.default_backend,
      capabilities,
    }
  } catch {
    signal?.throwIfAborted()
    return undefined
  }
}
