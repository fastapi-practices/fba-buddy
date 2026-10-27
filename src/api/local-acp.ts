import { translateCurrent } from "@/lib/i18n"
import { apiRequest } from "@/api/http"
import { API_V1 } from "@/lib/config"
import type { AcpLaunchConfig } from "@/lib/types/acp"
import type { AcpRunnerName, ForwardedProps } from "@/lib/types"
import { currentAccountSource } from "@/lib/account-source"
import type { AccountSource } from "@/shared/account-source"

function isElectronRenderer() {
  if (typeof navigator === "undefined") return false
  return navigator.userAgent.includes("Electron")
}

export async function openLocalAcp(
  runner: AcpRunnerName,
  config: AcpLaunchConfig,
  signal?: AbortSignal,
  conversationId?: string,
  source = currentAccountSource() ?? undefined,
  beforeStart?: () => Promise<void>
) {
  const desktop =
    typeof window === "undefined" ? undefined : window.buddyDesktop
  if (!desktop?.startAcp || !desktop.prepareAcp || !desktop.stopAcp) {
    throw new Error(
      isElectronRenderer()
        ? translateCurrent(
            "hints.theDesktopAcpInterfaceIsNotReadyFullyQuitAndRestartTheDesktopApp"
          )
        : "请在桌面端使用本地 ACP Agent"
    )
  }
  signal?.throwIfAborted()
  const localConfig = await desktop.prepareAcp(config, conversationId, source)
  if (!localConfig.cwd)
    throw new Error(translateCurrent("common.theLocalWorkspaceIsUnavailable"))
  signal?.throwIfAborted()
  await beforeStart?.()
  signal?.throwIfAborted()
  const bridge = await apiRequest<{ bridge_id: string; ticket: string }>(
    "/acp/bridges",
    {
      method: "POST",
      body: JSON.stringify({ runner, cwd: localConfig.cwd }),
      signal,
    }
  )
  const close = () => {
    void desktop.stopAcp(bridge.bridge_id).catch(() => {})
  }
  const url = new URL(
    `${API_V1}/acp/bridges/${bridge.bridge_id}`,
    window.location.href
  )
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
  signal?.addEventListener("abort", close, { once: true })
  try {
    await desktop.startAcp({
      bridgeId: bridge.bridge_id,
      ticket: bridge.ticket,
      url: url.href,
      config: localConfig,
      preparationId: localConfig.preparationId,
      source,
    })
    signal?.throwIfAborted()
  } catch (error) {
    close()
    signal?.removeEventListener("abort", close)
    throw error
  }
  return {
    id: bridge.bridge_id,
    detach: () => signal?.removeEventListener("abort", close),
    close: () => {
      close()
      signal?.removeEventListener("abort", close)
    },
  }
}

export async function withLocalAcpStream(
  props: ForwardedProps,
  request: (props: ForwardedProps) => Promise<Response>,
  signal?: AbortSignal,
  conversationId?: string,
  source?: AccountSource,
  beforeStart?: () => Promise<void>
): Promise<Response> {
  if (props.agent_mode !== "coding" || !props.acp_runner) return request(props)
  if (!conversationId) throw new Error("本地执行需要会话标识")
  if (!props.acp_runner_name || !props.acp_runner_config)
    throw new Error("请先配置本地 ACP Agent")
  const bridge = await openLocalAcp(
    props.acp_runner_name,
    props.acp_runner_config,
    signal,
    conversationId,
    source,
    beforeStart
  )
  try {
    const response = await request({ ...props, acp_bridge_id: bridge.id })
    bridge.detach()
    if (!response.body) {
      bridge.close()
      return response
    }
    const reader = response.body.getReader()
    let unsubscribed = false
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const result = await reader.read()
          if (result.done) {
            if (!unsubscribed) bridge.close()
            controller.close()
          } else controller.enqueue(result.value)
        } catch (error) {
          if (!unsubscribed) bridge.close()
          controller.error(error)
        }
      },
      async cancel(reason) {
        unsubscribed = true
        await reader.cancel(reason)
      },
    })
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    })
  } catch (error) {
    bridge.close()
    throw error
  }
}
