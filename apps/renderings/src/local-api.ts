import { inputRequest, type RenderingInputResolution } from "./fixtures"
import {
  previewArtifactDetails,
  previewArtifacts,
  previewConversationDetail,
  previewConversations,
  previewAssistants,
  previewKnowledgeBases,
  previewMcps,
  previewProjects,
  previewProviders,
  previewQuickPhrases,
  previewSkills,
  previewWebSearchOptions,
} from "./preview-data"

export const LOCAL_PREVIEW_INPUT_RESOLVED = "rendering:input-resolved"

const appHtml = `
<style>body{font:14px system-ui;margin:16px}button{font:inherit;padding:8px 14px;border:1px solid #aaa;border-radius:8px;cursor:pointer}output{margin-left:12px}</style>
<h3>MCP 交互资源</h3><p>由真实 McpAppFrame 加载，使用应用的沙箱和宿主消息桥</p>
<button id="increment">计数 +1</button><output id="count">0</output>
<script>
let count = 0;
document.querySelector('#increment').onclick = () => document.querySelector('#count').textContent = ++count;
addEventListener('message', ({data}) => {
  if (data.id === 'preview-init' && data.result) {
    document.body.style.color = data.result.hostContext?.theme === 'dark' ? '#eee' : '#222';
    parent.postMessage({jsonrpc:'2.0',method:'ui/notifications/initialized'}, '*');
    parent.postMessage({jsonrpc:'2.0',method:'ui/notifications/size-changed',params:{height:180}}, '*');
  }
});
parent.postMessage({jsonrpc:'2.0',id:'preview-init',method:'ui/initialize',params:{protocolVersion:'2026-01-26',appInfo:{name:'Rendering preview',version:'1'},appCapabilities:{}}}, '*');
</script>`

// 仅在独立预览入口安装，真实组件仍通过原有 API 边界获取数据
const requests = new Map([
  [inputRequest.request_id, structuredClone(inputRequest)],
])
// 助手真正提问之前，服务端没有待回答的请求
const asked = new Set<string>()
export function resetLocalPreviewInput() {
  requests.set(inputRequest.request_id, structuredClone(inputRequest))
  asked.delete(inputRequest.request_id)
}
export function askLocalPreviewInput(requestId: string) {
  asked.add(requestId)
}
export function installLocalPreviewApi() {
  const nativeFetch = window.fetch.bind(window)
  window.fetch = async (input, init) => {
    const raw = input instanceof Request ? input.url : String(input)
    const url = new URL(raw, location.href)
    const marker = url.pathname.indexOf("/api/v1/")
    if (marker < 0) {
      if (
        ["data:", "blob:"].includes(url.protocol) ||
        url.origin === location.origin
      )
        return nativeFetch(input, init)
      throw new Error(`预览未提供此资源：${url.pathname}`)
    }
    const path = url.pathname.slice(marker + 7)
    const method = (
      init?.method ?? (input instanceof Request ? input.method : "GET")
    ).toUpperCase()
    let data: unknown = []
    if (path.endsWith("/input-requests")) {
      data = {
        items: path.includes("rendering-input/")
          ? [...requests.values()].filter(
              (request) =>
                request.status === "pending" && asked.has(request.request_id)
            )
          : [],
      }
    } else if (path.includes("/input-requests/")) {
      const request = requests.get(path.split("/").at(-1)!)
      const body = JSON.parse(String(init?.body ?? "{}"))
      if (request) {
        Object.assign(request, body, {
          status: body.cancelled ? "cancelled" : "answered",
        })
        window.dispatchEvent(
          new CustomEvent<RenderingInputResolution>(
            LOCAL_PREVIEW_INPUT_RESOLVED,
            {
              detail: {
                ...body,
                requestId: request.request_id,
                request: structuredClone(request),
              },
            }
          )
        )
      }
      data = null
    } else if (path.endsWith("/plan")) data = { items: [] }
    else if (path.endsWith("/mcp-apps/resource"))
      data = { html: appHtml, metadata: {}, server_name: "本地预览资源" }
    else if (path.endsWith("/versions"))
      data = [
        {
          conversation_id: "rendering-markdown",
          title: "当前预览版本",
          created_time: "2026-10-15T08:00:00Z",
          message_id: 101,
          source_conversation_id: "rendering-markdown",
          source_message_id: 101,
        },
      ]
    else if (path === "/chat/polish")
      data = { text: "请检查真实组件的内容渲染与交互效果。" }
    else if (path === "/model-options") data = previewProviders
    else if (path === "/projects/all") data = previewProjects
    else if (path === "/mcps/all") data = previewMcps
    else if (path === "/quick-phrases/all") data = previewQuickPhrases
    else if (path === "/web-search-options") data = previewWebSearchOptions
    else if (path === "/skills/all") data = previewSkills
    else if (path === "/knowledges/all")
      data = previewKnowledgeBases.map((base) => ({
        id: base.id,
        name: base.name,
        description: base.description,
        user_id: base.user_id,
      }))
    else if (path.endsWith("/documents/all")) {
      const baseId = Number(path.split("/")[2])
      const base = previewKnowledgeBases.find((item) => item.id === baseId)
      data = base?.documents ?? []
    } else if (path === "/artifacts") {
      const kind = url.searchParams.get("kind")
      data = {
        items: kind
          ? previewArtifacts.filter((artifact) => artifact.kind === kind)
          : previewArtifacts,
        next_cursor: null,
        has_more: false,
      }
    } else if (/^\/artifacts\/\d+\/content$/.test(path)) {
      const id = Number(path.split("/")[2])
      const artifact = previewArtifactDetails.find((item) => item.id === id)
      if (artifact) {
        return new Response(artifact.content, {
          status: 200,
          headers: { "Content-Type": artifact.mime_type ?? "text/plain" },
        })
      }
      data = null
    } else if (/^\/artifacts\/\d+$/.test(path)) {
      const id = Number(path.split("/").at(-1))
      data = previewArtifactDetails.find((item) => item.id === id) ?? null
    }
    else if (path === "/assistants/all") data = previewAssistants
    else if (path === "/conversations")
      data = { items: previewConversations, next_cursor: null, has_more: false }
    else if (path.startsWith("/conversations/"))
      data = previewConversationDetail
    else if (path === "/assistants/categories")
      data = [
        { code: "engineering", name: "工程", sort: 1 },
        { code: "ops", name: "运营", sort: 2 },
      ]
    else if (method !== "GET") data = null
    return new Response(JSON.stringify({ code: 200, msg: "ok", data }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  }
}
