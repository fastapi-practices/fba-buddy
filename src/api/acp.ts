import { translateCurrent } from "@/lib/i18n"
import { apiRequest } from "@/api/http"
import { openLocalAcp } from "@/api/local-acp"
import type { AcpRunnerName, PermissionMode } from "@/lib/types"
import type { AcpCheckResult, AcpLaunchConfig } from "@/lib/types/acp"

export async function checkAcpAgent(
  runner: AcpRunnerName,
  config: AcpLaunchConfig,
  permissionMode: PermissionMode
): Promise<AcpCheckResult> {
  const signal = AbortSignal.timeout(75_000)
  const bridge = await openLocalAcp(runner, config, signal)
  try {
    const result = await apiRequest<AcpCheckResult>(`/acp/${runner}/check`, {
      method: "POST",
      body: JSON.stringify({
        bridge_id: bridge.id,
        permission_mode: permissionMode,
      }),
      signal,
      silent: true,
    })
    if (
      !result ||
      typeof result.available !== "boolean" ||
      typeof result.message !== "string" ||
      typeof result.code !== "string" ||
      !result.code.trim() ||
      !Number.isFinite(result.latency_ms)
    ) {
      throw new Error(
        translateCurrent("common.theCheckServiceReturnedAnInvalidResult")
      )
    }
    return result
  } catch (error) {
    signal.throwIfAborted()
    throw error
  } finally {
    bridge.close()
  }
}
