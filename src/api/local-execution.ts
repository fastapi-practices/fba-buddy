import { translateCurrent } from "@/lib/i18n"
import { apiRequest } from "@/api/http"
import { getExecutionDefaults } from "@/api/execution-options"
import { currentAccountSource } from "@/lib/account-source"
import { bindProjectConversation } from "@/lib/project-workspace"
import { withLocalAcpStream } from "@/api/local-acp"
import { API_V1 } from "@/lib/config"
import type { ForwardedProps } from "@/lib/types"
import { EXECUTION_PROTOCOL_CAPABILITIES } from "@/shared/execution"

export async function withExecutionStream(
  conversationId: string | null | undefined,
  props: ForwardedProps,
  request: (props: ForwardedProps) => Promise<Response>,
  signal?: AbortSignal,
  beforeAcpStart?: () => Promise<void>,
  projectId?: number | null
): Promise<Response> {
  if (props.agent_mode !== "coding") {
    if (props.agent_mode !== "work" && props.agent_mode !== "chat")
      return request(props)
    const desktop =
      typeof window === "undefined" ? undefined : window.buddyDesktop
    if (!desktop?.workspace || !conversationId)
      throw new Error("聊天运行需要桌面工作位置和会话标识")
    signal?.throwIfAborted()
    await bindProjectConversation(conversationId, projectId)
    const result = await desktop.workspace({
      action: "environment",
      conversationId,
      projectId: projectId ?? undefined,
      source: currentAccountSource() ?? undefined,
    })
    if (!result || !("environment" in result))
      throw new Error("工作位置返回无效")
    signal?.throwIfAborted()
    return request({
      ...props,
      execution_backend: result.environment.backend,
      ...(result.environment.sandboxProvider
        ? { sandbox_provider: result.environment.sandboxProvider }
        : {}),
    })
  }
  signal?.throwIfAborted()
  await bindProjectConversation(conversationId, projectId)
  signal?.throwIfAborted()
  if (props.acp_runner)
    return withLocalAcpStream(
      props,
      request,
      signal,
      conversationId ?? undefined,
      currentAccountSource() ?? undefined,
      beforeAcpStart
    )
  const desktop =
    typeof window === "undefined" ? undefined : window.buddyDesktop
  if (
    !desktop?.prepareExecution ||
    !desktop.startExecution ||
    !desktop.stopExecution
  )
    throw new Error(
      translateCurrent(
        "hints.theDesktopExecutionInterfaceIsNotReadyQuitAndRestartTheApp"
      )
    )
  signal?.throwIfAborted()
  const defaults = await getExecutionDefaults(signal)
  if (!defaults) throw new Error("执行服务返回了无效的默认配置")
  if (!conversationId) throw new Error("本地执行需要会话标识")
  const prepared = await desktop.prepareExecution(
    conversationId,
    defaults,
    currentAccountSource() ?? undefined
  )
  signal?.throwIfAborted()
  if (prepared.backend === "sandbox")
    return request({
      ...props,
      execution_backend: "sandbox",
      ...(prepared.sandboxProvider
        ? { sandbox_provider: prepared.sandboxProvider }
        : {}),
    })
  if (
    !Array.isArray(prepared.capabilities) ||
    prepared.capabilities.some((capability) => typeof capability !== "string")
  )
    throw new Error("桌面执行接口返回了无效的协议能力")
  const capabilities = EXECUTION_PROTOCOL_CAPABILITIES.filter(
    (capability) =>
      defaults.capabilities.includes(capability) &&
      prepared.capabilities.includes(capability)
  )
  const bridge = await apiRequest<{ bridge_id: string; ticket: string }>(
    "/execution/bridges",
    {
      method: "POST",
      body: JSON.stringify({
        backend: prepared.backend,
        cwd: prepared.cwd,
        permission_mode: props.permission_mode ?? "ask",
        capabilities,
      }),
      signal,
    }
  )
  const url = new URL(
    `${API_V1}/execution/bridges/${bridge.bridge_id}`,
    window.location.href
  )
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
  const close = () => {
    void desktop.stopExecution(bridge.bridge_id).catch(() => {})
  }
  signal?.addEventListener("abort", close, { once: true })
  try {
    await desktop.startExecution({
      bridgeId: bridge.bridge_id,
      ticket: bridge.ticket,
      url: url.href,
      preparationId: prepared.preparationId,
      permissionMode: props.permission_mode ?? "ask",
    })
    signal?.throwIfAborted()
    const response = await request({
      ...props,
      execution_backend: prepared.backend,
      execution_bridge_id: bridge.bridge_id,
    })
    signal?.removeEventListener("abort", close)
    if (!response.body) {
      close()
      return response
    }
    const reader = response.body.getReader()
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const result = await reader.read()
          if (result.done) {
            close()
            controller.close()
          } else controller.enqueue(result.value)
        } catch (error) {
          close()
          controller.error(error)
        }
      },
      async cancel(reason) {
        // 停止订阅不等同于停止服务端会话
        await reader.cancel(reason)
      },
    })
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    })
  } catch (error) {
    signal?.removeEventListener("abort", close)
    close()
    throw error
  }
}
