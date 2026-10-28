import type { ChatAttachment, ChatMessage, ChatToolCall } from "@/lib/types"
import type { InputAnswer, InputRequest } from "@/shared/chat-input"
import { serializeInlineQuote } from "@/shared/inline-quotes"

export type RenderingInputResolution = InputAnswer & {
  requestId: string
  request: InputRequest
}

export type RenderingScene = {
  id: string
  title: string
  description: string
  covers: string[]
  messages: ChatMessage[]
  streamEvents?: Record<string, unknown>[]
  inputFollowUp?: (
    resolution: RenderingInputResolution
  ) => Record<string, unknown>[]
  // 用户点执行计划后才出现的回放，模拟模型真正开始推进步骤
  planExecution?: Record<string, unknown>[]
  // 主回复结束之后才回来的后台事件
  backgroundFollowUp?: {
    delay: number
    events: Record<string, unknown>[]
  }
  // 派发队列消息后的真实回复，按消息内容给出对应回答
  queuedReplies?: Record<string, string>
}

const createdAt = "2026-10-15T08:00:00Z"
const THREAD_ID = "rendering-stream"
const RUN_ID = "rendering-run"

/** 与后端一致的运行事件 */
export function runStarted() {
  return { type: "RUN_STARTED", threadId: THREAD_ID, runId: RUN_ID }
}
export function runFinished() {
  return {
    type: "RUN_FINISHED",
    threadId: THREAD_ID,
    runId: RUN_ID,
    result: { status: "success" },
    outcome: { type: "success" },
    // 真实后端在运行结束时回传 token 用量
    usage: [
      {
        inputTokens: 1280,
        outputTokens: 640,
        totalTokens: 1920,
        reasoningTokens: 240,
      },
    ],
  }
}
const assetUrl = (path: string) =>
  new URL(`${import.meta.env.BASE_URL}${path}`, window.location.href).href
const imageUrl = assetUrl("image-templates/mountain.jpg")
export const textFile: ChatAttachment = {
  id: "rendering-notes",
  name: "rendering-notes.md",
  mime: "text/markdown",
  kind: "document",
  size: 74,
  data: btoa(
    "# Rendering preview\n\nThis file is served by the local preview.\n"
  ),
}
const generatedNotes = `# 附件说明

## 已检查附件
- mountain.jpg：山峦图片，用于验证图片预览
- rendering-notes.md：Markdown 文档，用于验证文件预览
- components.csv：组件状态表，用于验证表格筛选与排序

## 结论
三个附件均可以正常读取，图片、文档与表格分别使用对应预览组件展示。
`
export const imageFile: ChatAttachment = {
  id: "rendering-image",
  name: "mountain.jpg",
  mime: "image/jpeg",
  kind: "image",
  size: 82947,
  data: "",
  url: imageUrl,
}
const csv =
  "Component,State,Interactive\nMarkdown,Complete,Yes\nTool,Running,Yes\nImage,Complete,Yes\n"
const csvFile: ChatAttachment = {
  id: "rendering-csv",
  name: "components.csv",
  mime: "text/csv",
  kind: "document",
  size: csv.length,
  data: btoa(csv),
}
const audioFile: ChatAttachment = {
  id: "rendering-audio",
  name: "tone.wav",
  mime: "audio/wav",
  kind: "audio",
  size: 19244,
  data: "",
  url: assetUrl("rendering-preview/tone.wav"),
}
const videoFile: ChatAttachment = {
  id: "rendering-video",
  name: "preview.webm",
  mime: "video/webm",
  kind: "video",
  size: 7372,
  data: "",
  url: assetUrl("rendering-preview/preview.webm"),
}
const quote = {
  messageId: "markdown-assistant",
  text: "这段内容经过应用里的 MarkdownText 渲染。",
}

// 后端持久化消息会带自增 pk，客户端的版本、分支、删除都依赖它
let nextPk = 100
const user = (id: string, content: string): ChatMessage => ({
  id,
  role: "user",
  content,
  createdAt,
  pk: nextPk++,
})
const assistant = (
  id: string,
  content: string,
  extra: Partial<ChatMessage> = {}
): ChatMessage => ({
  id,
  role: "assistant",
  content,
  status: "complete",
  createdAt,
  pk: nextPk++,
  // 真实回复会带上模型与 token 用量，actions 栏的统计依赖这些数据
  turnContext: { model_id: "gpt-5", provider_id: 1 },
  usage: {
    inputTokens: 1280,
    outputTokens: 640,
    totalTokens: 1920,
    reasoningTokens: 240,
    costUsd: 0.0024,
  },
  ...extra,
})
const tool = (
  id: string,
  name: string,
  args: unknown,
  result?: unknown,
  extra: Partial<ChatToolCall> = {}
): ChatToolCall => ({
  id,
  name,
  args: JSON.stringify(args),
  ...(result !== undefined
    ? {
        result: typeof result === "string" ? result : JSON.stringify(result),
        status: "complete",
      }
    : {}),
  ...extra,
})

const sources = [
  {
    url: "https://ui.shadcn.com/docs/components/base/trace",
    title: "Trace · shadcn/ui",
    domain: "ui.shadcn.com",
    snippet: "活动轨迹、折叠内容与状态图标",
    siteName: "shadcn/ui",
    image: imageUrl,
  },
  {
    url: "https://ui.shadcn.com/docs/ai-elements",
    title: "AI Elements · shadcn/ui",
    domain: "ui.shadcn.com",
    snippet: "消息、runtime 和富文本组件",
    siteName: "shadcn/ui",
  },
]

const markdown = [
  "# 真实消息渲染",
  "这段内容经过应用里的 **MarkdownText** 渲染。可以选择文字、复制、展开表格，也可以操作代码块。",
  "## 文本与排版",
  "**粗体**、*斜体*、~~删除线~~、`inline code`、[外部链接](https://example.com) 和自动链接 <https://example.com>。",
  "> 普通引用保留真实的边线、字号和段落间距。",
  "> [!NOTE]\n> 这是应用支持的提示块。",
  "> [!TIP]\n> 在代码块右上角可以复制和切换换行。",
  "> [!WARNING]\n> 预览与应用共用主题和样式变量。",
  "- 无序列表\n  - 嵌套项目\n- 第二个项目\n\n1. 有序列表\n2. 第二个步骤",
  "- [x] 使用真实组件\n- [x] 加载真实字体\n- [ ] 检查窄屏效果",
  "## 代码、表格和公式",
  '```typescript title="render-preview.ts"\ntype Preview = { component: string; live: boolean }\nconst preview: Preview = { component: "Thread", live: true }\nconsole.log(preview)\n```',
  "| 内容 | 实际组件 | 交互 |\n| --- | --- | --- |\n| Markdown | MarkdownText | 复制与选择 |\n| 表格 | MarkdownTable | 复制 Markdown / CSV、展开 |\n| 代码 | SyntaxHighlighter | 高亮、复制、换行 |",
  "行内公式 $E = mc^2$，块级公式：\n\n$$\n\\int_0^1 x^2\\,dx = \\frac{1}{3}\n$$",
  "## Mermaid",
  "```mermaid\nflowchart LR\n  A[示例数据] --> B[消息转换]\n  B --> C[Thread]\n  C --> D[真实组件]\n```",
  "## 指令与 HTML",
  "各类引用各用自己的图标：:skill[shadcn]{name=shadcn} :knowledge[文案库]{name=4} :artifact[发布计划]{name=9} :mcp[网页搜索]{name=2} :file[计划.md]{name=5} :tool[读取文件]{name=read} :command[/polish]{name=polish} :memory[偏好.md]{name=11}",
  "<details><summary>展开原生 HTML 内容</summary><p>这段内容经过同一套 HTML 清理和渲染流程</p></details>",
  "---\n\n脚注也会保留[^preview]。\n\n[^preview]: 同一份 Markdown 插件、同一套组件。",
].join("\n\n")

export const inputRequest: InputRequest = {
  request_id: "rendering-question",
  kind: "questions",
  status: "pending",
  title: "选择预览方式",
  tool_call_id: "rendering-input",
  questions: [
    {
      id: "layout",
      prompt: "接下来希望检查哪个布局？",
      kind: "single",
      required: true,
      options: [
        { id: "wide", label: "完整宽度" },
        { id: "narrow", label: "窄屏布局" },
      ],
    },
    {
      id: "checks",
      prompt: "还需要检查哪些交互细节？",
      kind: "multiple",
      required: false,
      options: [
        { id: "keyboard", label: "键盘快捷键" },
        { id: "attachments", label: "附件上传" },
      ],
    },
  ],
}

const inputMessageId = "input-assistant"
const inputAnswerLabels = (
  request: InputRequest,
  answers: InputAnswer["answers"] = {}
) =>
  request.questions.flatMap((question) => {
    const value = answers[question.id]
    const selected = Array.isArray(value) ? value : value ? [value] : []
    return selected.map(
      (id) =>
        question.options.find((option) => option.id === id)?.label ?? String(id)
    )
  })
const inputRequestEvents: Record<string, unknown>[] = [
  runStarted(),
  {
    type: "TEXT_MESSAGE_START",
    messageId: inputMessageId,
    role: "assistant",
  },
  ...answerEvents(
    inputMessageId,
    "在继续之前，我先确认一下要检查的预览范围和交互项。"
  ),
  { type: "TEXT_MESSAGE_END", messageId: inputMessageId },
  {
    type: "TOOL_CALL_START",
    parentMessageId: inputMessageId,
    toolCallId: inputRequest.tool_call_id,
    toolCallName: "ask_user",
  },
  {
    type: "TOOL_CALL_ARGS",
    parentMessageId: inputMessageId,
    toolCallId: inputRequest.tool_call_id,
    delta: JSON.stringify({
      title: inputRequest.title,
      questions: inputRequest.questions,
    }),
  },
  {
    type: "TOOL_CALL_END",
    parentMessageId: inputMessageId,
    toolCallId: inputRequest.tool_call_id,
  },
  {
    type: "CUSTOM",
    name: "buddy.user_input",
    parentMessageId: inputMessageId,
    value: { ...inputRequest },
  },
]
const inputFollowUp = (
  resolution: RenderingInputResolution
): Record<string, unknown>[] => {
  const status = resolution.cancelled ? "cancelled" : "answered"
  const labels = inputAnswerLabels(resolution.request, resolution.answers)
  const text = resolution.cancelled
    ? "已取消本次输入，预览检查先停在这里。需要继续时再告诉我。"
    : `已收到你的选择${labels.length ? `：${labels.join("、")}` : ""}。我会按这个范围继续检查。`
  return [
    {
      type: "CUSTOM",
      name: "buddy.user_input",
      parentMessageId: inputMessageId,
      value: { ...resolution.request, status },
    },
    {
      type: "TOOL_CALL_RESULT",
      parentMessageId: inputMessageId,
      toolCallId: inputRequest.tool_call_id,
      content: resolution.cancelled
        ? { cancelled: true }
        : { answers: resolution.answers },
    },
    {
      type: "TEXT_MESSAGE_START",
      messageId: inputMessageId,
      role: "assistant",
    },
    ...answerEvents(inputMessageId, text),
    { type: "TEXT_MESSAGE_END", messageId: inputMessageId },
    runFinished(),
  ]
}

// 计划场景：助手先给提案，用户点执行计划后模型才开始推进步骤
const planTitle = "发布流程"
const planMarkdown =
  "# 发布流程\n\n先跑检查再打包，最后补上变更记录，三步都通过后再发布。"
const planSteps = [
  { id: "p1", content: "运行类型检查与单元测试" },
  { id: "p2", content: "打包桌面端并生成安装包" },
  { id: "p3", content: "更新变更记录并同步发布说明" },
]
const planItems = (statuses: Record<string, string>) =>
  planSteps.map((step) => ({
    id: step.id,
    content: step.content,
    status: statuses[step.id] ?? "pending",
  }))
const planProposalId = "plan-proposal"
const planExecutionId = "plan-execution"
// 计划属于提出它的那条消息，执行时同一张卡片继续推进
const planEvent = (statuses: Record<string, string>) => ({
  type: "CUSTOM",
  name: "buddy.planning",
  parentMessageId: planProposalId,
  value: {
    title: planTitle,
    markdown: planMarkdown,
    items: planItems(statuses),
  },
})
const planTool = (id: string, command: string, result: string) => [
  {
    type: "TOOL_CALL_START",
    parentMessageId: planExecutionId,
    toolCallId: id,
    toolCallName: "bash",
  },
  {
    type: "TOOL_CALL_ARGS",
    parentMessageId: planExecutionId,
    toolCallId: id,
    delta: JSON.stringify({ command }),
  },
  { type: "TOOL_CALL_END", parentMessageId: planExecutionId, toolCallId: id },
  {
    type: "TOOL_CALL_RESULT",
    parentMessageId: planExecutionId,
    toolCallId: id,
    messageId: `${id}-result`,
    content: result,
  },
]
// 点执行计划之后才出现的回放：计划步骤随工具调用逐步推进，回合结束前不会显示完成
const planExecutionEvents: Record<string, unknown>[] = [
  runStarted(),
  {
    type: "TEXT_MESSAGE_START",
    messageId: planExecutionId,
    role: "assistant",
  },
  ...answerEvents(planExecutionId, "开始执行计划：先跑类型检查与单元测试。"),
  planEvent({ p1: "in_progress" }),
  ...planTool(
    "plan-exec-typecheck",
    "pnpm typecheck && pnpm test",
    "Test Files 178 passed · Tests 1442 passed"
  ),
  planEvent({ p1: "completed", p2: "in_progress" }),
  ...planTool(
    "plan-exec-build",
    "pnpm build",
    "构建完成，产物输出到 build/ 目录"
  ),
  planEvent({ p1: "completed", p2: "completed", p3: "in_progress" }),
  ...planTool(
    "plan-exec-release-notes",
    "node scripts/release-notes.mjs",
    "已生成 0.10.2 发布说明并写入 CHANGELOG.md"
  ),
  planEvent({ p1: "completed", p2: "completed", p3: "completed" }),
  ...answerEvents(
    planExecutionId,
    "三步都完成了：类型检查与单元测试通过，安装包已生成，变更记录也同步好了。"
  ),
  { type: "TEXT_MESSAGE_END", messageId: planExecutionId },
  runFinished(),
]

const baseScenes: RenderingScene[] = [
  {
    id: "markdown",
    title: "消息与富文本",
    description: "完整对话中的用户消息、Markdown、代码、表格、公式和 Mermaid",
    covers: [
      "用户消息",
      "Markdown",
      "代码高亮",
      "表格",
      "KaTeX",
      "Mermaid",
      "提示块",
      "指令",
      "脚注",
      "引用与批注",
      "产物模板",
    ],
    messages: [
      {
        ...user(
          "markdown-user",
          "请展示所有富文本效果\n包括第二行和 :skill[shadcn]{name=shadcn} 与 :knowledge[文案库]{name=4}"
        ),
        attachments: [textFile],
      },
      assistant("markdown-assistant", markdown, {
        pk: 101,
        usage: {
          inputTokens: 1280,
          outputTokens: 640,
          totalTokens: 1920,
          reasoningTokens: 240,
          costUsd: 0.0024,
        },
        timing: {
          streamStartTime: 0,
          firstTokenTime: 420,
          totalStreamTime: 12400,
          totalChunks: 160,
          toolCallCount: 0,
          tokenCount: 640,
          tokensPerSecond: 51.6,
        },
      }),
      {
        ...user("markdown-quoted", "请继续解释这段内容"),
        turnContext: { quote },
      },
      assistant(
        "markdown-template",
        `${serializeInlineQuote(quote)}\n\n引用可直达原文。下面的内容可以直接填入真实输入框。`
      ),
    ],
  },
  {
    id: "media",
    title: "文件与媒体",
    description: "真实附件、图片查看器、文件预览及下载",
    covers: [
      "用户附件",
      "图片消息",
      "图片缩放",
      "文件下载",
      "Markdown 图片",
      "文件预览",
      "CSV 筛选排序",
      "音频播放",
      "视频播放",
    ],
    messages: [
      {
        ...user("media-user", "查看这些附件，并生成一份说明文件"),
        attachments: [imageFile, textFile, csvFile],
      },
      assistant(
        "media-assistant",
        "已查看 3 个附件，并生成产物 `附件说明.md`。\n\n说明文件整理了图片、Markdown 文档和 CSV 的内容与用途。",
        {
          thinking: "先读取三个附件，再根据文件类型整理说明文件。",
          tools: [
            tool(
              "inspect-attachments",
              "read_file",
              {
                paths: ["mountain.jpg", "rendering-notes.md", "components.csv"],
              },
              "已读取 3 个附件"
            ),
            tool(
              "write-notes",
              "write_artifact",
              {
                title: "附件说明.md",
                kind: "document",
                content: generatedNotes,
              },
              "已保存产物 #43 附件说明.md"
            ),
          ],
        }
      ),
      user("media-attachments-user", "用消息附件展示图片、音频和视频"),
      assistant("media-playback", "消息附件中的媒体可以直接预览：", {
        thinking: "确认图片、音频和视频附件的媒体类型。",
        tools: [
          tool(
            "inspect-media-attachments",
            "read_file",
            { paths: ["mountain.jpg", "tone.wav", "preview.webm"] },
            "已确认 3 个媒体附件"
          ),
        ],
        attachments: [imageFile, audioFile, videoFile],
      }),
      user("media-inline-user", "再用 Markdown 展示图片和音视频"),
      assistant(
        "media-inline",
        `Markdown 媒体：\n\n![山峦预览](${imageUrl})\n\n![本地提示音](${audioFile.url})\n\n![本地短片](${videoFile.url})`,
        {
          thinking: "确认 Markdown 图片、音频和视频的本地资源路径。",
          tools: [
            tool(
              "inspect-markdown-media",
              "read_file",
              { paths: [imageUrl, audioFile.url, videoFile.url] },
              "已确认 Markdown 媒体资源"
            ),
          ],
        }
      ),
    ],
  },
  {
    id: "plan",
    title: "计划",
    description:
      "计划先作为提案出现，点执行计划后模型才开始推进步骤，回合结束前不会显示完成",
    covers: ["计划提案", "待执行", "执行中", "已完成"],
    messages: [
      user(
        "plan-user",
        "把这周的发布流程整理成计划：先跑检查，再打包桌面端，最后更新变更记录。"
      ),
      assistant(
        "plan-proposal",
        "计划已经整理好，三步都还没开始。要我现在按这个顺序执行吗？",
        {
          thinking:
            "先读一遍发布脚本，把发布步骤拆成可执行的待办，再确认每一步的产出。",
          tools: [
            tool(
              "plan-read",
              "read_file",
              { path: "scripts/pack.mjs" },
              "已读取发布脚本，确认打包与发布是两步"
            ),
          ],
          turnContext: {
            lifecycle_events: [
              {
                name: "buddy.planning",
                value: {
                  title: planTitle,
                  markdown: planMarkdown,
                  items: planItems({}),
                },
              },
            ],
          },
        }
      ),
    ],
    planExecution: planExecutionEvents,
  },
  {
    id: "subagent",
    title: "子代理与后台任务",
    description:
      "子代理与后台任务的状态都出现在执行过程里，后台任务没跑完时回复不会给出 actions",
    covers: [
      "子代理运行中",
      "子代理已完成",
      "子代理失败",
      "后台任务",
      "等待子代理完成",
    ],
    messages: [
      user(
        "subagent-user",
        "让两个子代理分别核对组件渲染和窄屏布局，再把窄屏截图归档。"
      ),
      assistant("subagent-work", "", {
        thinking:
          "把核对任务拆给两个子代理并行执行，截图归档单独作为第三个任务。",
        tools: [
          tool(
            "subagent-read",
            "read_file",
            { path: "src/components/ai-elements/lifecycle-events.tsx" },
            "已读取生命周期事件渲染入口"
          ),
        ],
        turnContext: {
          lifecycle_events: [
            {
              name: "buddy.subagent",
              value: {
                task_id: "agent-component-check",
                agent_name: "组件检查",
                status: "completed",
                task: "核对消息、思考与工具调用是否都走生产组件",
                model_name: "preview-model",
                reasoning_effort: "high",
                tools: ["read_file", "bash"],
                tool_calls: [
                  {
                    id: "agent-component-check-read",
                    name: "read_file",
                    status: "completed",
                    input: {
                      path: "src/components/ai-elements/thread.tsx",
                    },
                    output: "计划卡片与子代理轨迹都挂在消息组件上",
                  },
                ],
                duration_seconds: 4,
              },
            },
            {
              name: "buddy.subagent",
              value: {
                task_id: "agent-layout-check",
                agent_name: "布局检查",
                status: "running",
                task: "核对 390px 宽度下的表格、代码块与工具分组",
              },
            },
            {
              name: "buddy.subagent",
              value: {
                task_id: "agent-archive",
                agent_name: "截图归档",
                status: "failed",
                task: "上传窄屏截图并回填计划状态",
                output: "归档服务暂时不可用（503），本轮跳过，需要人工重新触发",
                duration_seconds: 2,
              },
            },
            {
              name: "buddy.activity",
              value: {
                id: "preview-service",
                title: "预览服务",
                status: "ready",
                persistent: true,
                url: "https://example.com/preview",
                summary: "等待人工确认窄屏布局",
              },
            },
          ],
        },
      }),
      assistant(
        "subagent-assistant",
        "组件检查已经完成，确认消息、思考与工具调用都走生产组件；布局检查还在跑 390px 宽度下的表格和代码块。截图归档因为归档服务返回 503 失败，需要人工重试。"
      ),
    ],
    // 后台子代理在主回复结束后才回来，跑完这一轮回复才算结束
    backgroundFollowUp: {
      delay: 5000,
      events: [
        {
          type: "CUSTOM",
          name: "buddy.subagent",
          parentMessageId: "subagent-work",
          value: {
            task_id: "agent-layout-check",
            agent_name: "布局检查",
            status: "completed",
            task: "核对 390px 宽度下的表格、代码块与工具分组",
            output:
              "窄屏下的表格与代码块都正常，工具分组没有换行错位，结论已回填",
            duration_seconds: 7,
          },
        },
      ],
    },
  },
  {
    id: "compaction",
    title: "上下文压缩",
    description: "回合开始前历史上下文过长被压缩，执行过程里保留压缩记录",
    covers: ["上下文压缩", "压缩前后对比"],
    messages: [
      user("compaction-user", "继续把渲染验收做完。"),
      assistant(
        "compaction-final",
        "类型检查和消息事件测试都已通过，390px 窄屏下的表格与代码块还需要人工确认。本轮开始前历史上下文过长，已把 48 条消息压缩为 8 条。",
        {
          tools: [
            tool(
              "compaction-typecheck",
              "bash",
              { command: "pnpm typecheck" },
              "退出码 0：tsconfig.app / node / electron / smoke 全部通过"
            ),
          ],
          turnContext: {
            lifecycle_events: [
              {
                name: "buddy.compaction",
                value: {
                  id: "compact",
                  status: "completed",
                  tokens_before: 82000,
                  tokens_after: 12000,
                  messages_before: 48,
                  messages_after: 8,
                },
              },
            ],
          },
        }
      ),
    ],
  },
  {
    id: "superseded",
    title: "上一轮尝试",
    description: "同一回合里前一次尝试被这一轮取代，已输出的部分内容折叠保留",
    covers: ["上一轮尝试", "部分输出保留"],
    messages: [
      user("superseded-user", "把渲染验收做完。"),
      assistant(
        "superseded-old",
        "这一轮只核对了 fixture 文案，没有覆盖窄屏布局，需要重新整理。",
        {
          attempt: { id: "attempt-1", status: "superseded", number: 1 },
          thinking: "先确认场景数据与渲染入口的范围。",
          tools: [
            tool(
              "superseded-read",
              "read_file",
              { path: "apps/renderings/src/fixtures.ts" },
              "已读取场景定义"
            ),
          ],
        }
      ),
      assistant(
        "superseded-final",
        "类型检查和消息事件测试都已通过，390px 窄屏下的表格与代码块还需要人工确认。",
        {
          attempt: { id: "attempt-2", number: 2 },
          tools: [
            tool(
              "superseded-typecheck",
              "bash",
              { command: "pnpm typecheck" },
              "退出码 0：tsconfig.app / node / electron / smoke 全部通过"
            ),
          ],
        }
      ),
    ],
  },
  {
    id: "approval",
    title: "工具审批",
    description: "真实回合中的思考、审批、执行与完成状态",
    covers: ["执行过程", "待审批工具", "允许一次", "拒绝", "执行结果"],
    messages: [
      user("approval-user", "执行一次本地预览命令"),
      assistant(
        "approval-assistant",
        "类型检查已完成，没有发现 TypeScript 错误。",
        {
          status: "awaiting-approval",
          thinking:
            "这条命令会读取项目文件并执行 TypeScript 检查，先请求确认再运行",
          tools: [
            tool(
              "approval-call",
              "run_command",
              {
                command: "pnpm typecheck",
                cwd: "/Users/c/Documents/github/fba-buddy",
                timeout_ms: 120000,
              },
              "tsc --noEmit\n\nTypeScript: no errors found",
              {
                pendingApproval: true,
                approvalRequestId: "preview-approval",
              }
            ),
          ],
        }
      ),
    ],
  },
  {
    id: "input",
    title: "结构化输入",
    description: "助手在调用输入工具后暂停等待，提交或取消后继续输出最终回复",
    covers: ["输入请求", "分步导航", "选项", "自定义答案", "提交", "取消"],
    messages: [user("input-user", "帮我选择一种预览方式")],
    streamEvents: inputRequestEvents,
    inputFollowUp,
  },
  {
    id: "artifact-card",
    title: "Artifact card",
    description:
      "生成中的文档实时计数，完成后合并为带版本的产物卡片，服务端沙箱文件可交付为持久产物",
    covers: ["生成产物", "更新产物", "实时字数", "服务端沙箱交付", "持久下载"],
    messages: [
      user(
        "artifact-card-user",
        "整理一份发布检查报告，补一页迁移说明，并把最终报告交付出来。"
      ),
      assistant(
        "artifact-card-final",
        "发布检查报告已经整理完成，并根据复核结果更新了风险章节。迁移说明还在写入，最终报告已经交付为持久产物。",
        {
          tools: [
            tool(
              "artifact-create-report",
              "write_artifact",
              {
                title: "发布检查报告",
                kind: "document",
                content:
                  "# 发布检查报告\n\n检查构建、测试、数据库迁移和回滚步骤。",
              },
              "已保存产物 #42 发布检查报告"
            ),
            tool(
              "artifact-update-report",
              "write_artifact",
              {
                artifact_id: 42,
                title: "发布检查报告",
                kind: "document",
                content:
                  "# 发布检查报告\n\n检查构建、测试、数据库迁移和回滚步骤。\n\n## 风险\n\n迁移前保存数据库快照。",
              },
              "已更新产物 #42"
            ),
            tool("artifact-working-notes", "write_artifact", {
              title: "迁移说明",
              kind: "text",
              content: "迁移前保存数据，升级后验证任务和文件索引。",
            }),
            tool(
              "artifact-deliver-report",
              "deliver_file",
              {
                path: "outbound/发布检查报告.pdf",
                title: "发布检查报告.pdf",
                kind: "document",
              },
              {
                artifact_id: 44,
                title: "发布检查报告.pdf",
                kind: "document",
                size: 184320,
                sha256: "4d2e9b6f7a1c8d3e",
                mime_type: "application/pdf",
              }
            ),
          ],
        }
      ),
    ],
  },
  {
    id: "memory",
    title: "记忆",
    description: "本轮的记忆写入、更新与清理记录在执行过程里",
    covers: ["写入记忆", "更新记忆", "删除记忆"],
    messages: [
      user("memory-user", "记住我更喜欢简体中文回复，代码注释也用中文。"),
      assistant(
        "memory-final",
        "已经记下了：默认用简体中文回复，代码注释保持中文。\n\n项目里和记忆术语相关的旧笔记我清掉了，只保留仍然有效的偏好。",
        {
          thinking:
            "先确认这些偏好是否已经存在，再决定写入还是更新，最后清理过时的一条笔记",
          tools: [
            tool(
              "memory-write-language",
              "write_memory",
              {
                path: "preferences/language.md",
                content: "默认使用简体中文回复",
              },
              { version: "1", existed: false }
            ),
            tool(
              "memory-write-project",
              "write_memory",
              {
                path: "projects/fba-buddy.md",
                content: "fba-buddy 项目代码注释使用中文",
              },
              { version: "3", existed: true }
            ),
            tool(
              "memory-delete-old",
              "delete_memory",
              { path: "notes/old-quirk.md" },
              { version: null, existed: true }
            ),
          ],
        }
      ),
    ],
  },
  {
    id: "errors",
    title: "错误与停止",
    description: "错误详情、部分输出、停止状态和配额倒计时",
    covers: [
      "错误提示",
      "错误详情",
      "部分输出",
      "停止标记",
      "配额恢复",
      "重试",
    ],
    messages: [
      user("stopped-user", "展示中途停止的回答"),
      assistant("stopped-assistant", "已经输出的内容会保留在这里。", {
        status: "stopped",
      }),
      user("error-user", "展示服务端失败"),
      assistant("error-assistant", "中断前已经收到的部分回答。", {
        status: "error",
        error: "预览错误：上游服务暂不可用",
        errorDetail: { status: 502, request_id: "preview-502" },
      }),
      user("quota-user", "展示配额恢复提示"),
      assistant("quota-assistant", "", {
        status: "error",
        error: "预览配额已用完",
        errorDetail: { status: 429, retry_after: 240 },
      }),
    ],
  },
  {
    id: "stream-tools",
    title: "流式工具调用",
    description: "读取、编辑、失败命令与测试报告的独立事件回放",
    covers: ["读取文件", "编辑文件", "失败工具", "测试报告", "文件变更"],
    messages: [user("stream-user", "回放读取、编辑和测试工具调用")],
    streamEvents: [],
  },
  {
    id: "stream-sources",
    title: "流式搜索与引用",
    description: "搜索工具、引用来源和最终回答分开回放",
    covers: ["搜索工具", "引用来源", "最终回答"],
    messages: [user("stream-sources-user", "回放一次搜索并引用来源的回答")],
    streamEvents: [],
  },
  {
    id: "stream-interleaved",
    title: "流式过程与答复",
    description: "铺垫文本、工具执行和最终答复按真实顺序交错回放",
    covers: ["铺垫文本", "工具执行", "过程收起", "最终答复"],
    messages: [user("stream-interleaved-user", "回放一次先铺垫再执行的回答")],
    streamEvents: [],
  },
]

const queueReply = `我先核对一下改动范围，再继续后面的检查。

这批改动集中在渲染链路：执行过程与正文之间的间距统一成正文段落间距，回复下方的动作栏补齐了重新生成、分支与删除，工具耗时改成按真实墙钟统计。

需要注意两点：一是子代理还在跑的时候回复不会给出动作栏，二是后台任务结束后总耗时才定格，避免出现"已完成 2.6s"但实际等了 7 秒的情况。`

const queueScene: RenderingScene = {
  id: "queue",
  title: "消息队列",
  description: "回复进行中时，后续消息如何排队、编辑、引导和派发",
  covers: ["消息队列", "拖动排序", "编辑队列消息", "引导会话", "派发下一条"],
  messages: [user("queue-user", "先帮我看看这批改动")],
  streamEvents: [
    runStarted(),
    {
      type: "TEXT_MESSAGE_START",
      messageId: "queue-assistant",
      role: "assistant",
    },
    {
      type: "TEXT_MESSAGE_CONTENT",
      messageId: "queue-assistant",
      delta: "我先核对一下改动范围，再继续后面的检查。",
    },
    {
      type: "TOOL_CALL_START",
      parentMessageId: "queue-assistant",
      toolCallId: "queue-diff",
      toolCallName: "bash",
    },
    {
      type: "TOOL_CALL_ARGS",
      toolCallId: "queue-diff",
      delta: '{"command":"git diff --stat"}',
    },
    { type: "TOOL_CALL_END", toolCallId: "queue-diff" },
    {
      type: "TOOL_CALL_RESULT",
      parentMessageId: "queue-assistant",
      toolCallId: "queue-diff",
      messageId: "queue-diff-result",
      content:
        " src/components/ai-elements/transcript.tsx | 42 ++++\n src/features/chat/transcript-work-timing.ts | 18 ++\n apps/renderings/src/fixtures.ts | 31 +++",
    },
    {
      type: "TEXT_MESSAGE_CONTENT",
      messageId: "queue-assistant",
      delta: `\n\n${queueReply}`,
    },
    { type: "TEXT_MESSAGE_END", messageId: "queue-assistant" },
    runFinished(),
  ],
  queuedReplies: {
    补充风险说明:
      "补充的风险说明如下：\n\n- 依赖升级：UI 组件库小版本升级，未引入破坏性变更\n- 兼容：保留了旧的参数别名，新旧调用方都能跑\n- 回滚：改动集中在渲染层，回滚不需要动数据\n- 验证：类型检查与单元测试均已通过",
    把结论转成表格:
      "结论整理成表格：\n\n| 改动 | 影响 | 风险 |\n| --- | --- | --- |\n| 执行过程间距 | 统一为段落间距 | 低 |\n| 动作栏补齐 | 补全重新生成与删除 | 低 |\n| 耗时统计 | 按真实墙钟定格 | 中 |",
  },
}
export const scenes: RenderingScene[] = [
  ...baseScenes.filter((scene) => !scene.id.startsWith("stream-")),
  queueScene,
  ...baseScenes.filter((scene) => scene.id.startsWith("stream-")),
]

const completeStreamEvents: Record<string, unknown>[] = [
  runStarted(),
  {
    type: "TEXT_MESSAGE_START",
    messageId: "stream-assistant",
    role: "assistant",
  },
  { type: "REASONING_MESSAGE_START", messageId: "stream-reasoning" },
  ...["先检查真实的消息渲染链路。", "\n\n随后读取配置并运行示例命令。"].map(
    (delta) => ({
      type: "REASONING_MESSAGE_CONTENT",
      messageId: "stream-reasoning",
      delta,
    })
  ),
  { type: "REASONING_MESSAGE_END", messageId: "stream-reasoning" },
  {
    type: "TOOL_CALL_START",
    parentMessageId: "stream-assistant",
    toolCallId: "stream-tool",
    toolCallName: "read_file",
  },
  {
    type: "TOOL_CALL_ARGS",
    toolCallId: "stream-tool",
    delta: '{"path":"package.json"}',
  },
  { type: "TOOL_CALL_END", toolCallId: "stream-tool" },
  {
    type: "TOOL_CALL_RESULT",
    toolCallId: "stream-tool",
    messageId: "stream-tool-result",
    content: '{"name":"fba-buddy","private":true}',
  },
  {
    type: "TOOL_CALL_START",
    parentMessageId: "stream-assistant",
    toolCallId: "stream-edit",
    toolCallName: "edit_file",
  },
  {
    type: "TOOL_CALL_ARGS",
    toolCallId: "stream-edit",
    delta:
      '{"path":"apps/renderings/src/fixtures.ts","old_string":"<StaticPreview />","new_string":"<Thread />"}',
  },
  { type: "TOOL_CALL_END", toolCallId: "stream-edit" },
  {
    type: "TOOL_CALL_RESULT",
    toolCallId: "stream-edit",
    messageId: "stream-edit-result",
    content: JSON.stringify({
      additions: 1,
      deletions: 1,
      message: "Reused Thread",
    }),
  },
  {
    type: "TOOL_CALL_START",
    parentMessageId: "stream-assistant",
    toolCallId: "stream-failed",
    toolCallName: "bash",
  },
  {
    type: "TOOL_CALL_ARGS",
    toolCallId: "stream-failed",
    delta: '{"command":"pnpm install --frozen-lockfile"}',
  },
  { type: "TOOL_CALL_END", toolCallId: "stream-failed" },
  {
    type: "TOOL_CALL_RESULT",
    toolCallId: "stream-failed",
    messageId: "stream-failed-result",
    content: "ERR_PNPM_OUTDATED_LOCKFILE\nLockfile needs to be updated",
    status: "error",
    isError: true,
  },
  {
    type: "TOOL_CALL_START",
    parentMessageId: "stream-assistant",
    toolCallId: "stream-tests",
    toolCallName: "run_tests",
  },
  {
    type: "TOOL_CALL_ARGS",
    toolCallId: "stream-tests",
    delta: '{"command":"pnpm test"}',
  },
  { type: "TOOL_CALL_END", toolCallId: "stream-tests" },
  {
    type: "TOOL_CALL_RESULT",
    toolCallId: "stream-tests",
    messageId: "stream-tests-result",
    content: {
      kind: "test_report",
      schema_version: 1,
      conversation_id: "rendering-stream",
      run_id: "stream-run",
      workspace_id: null,
      execution_backend: "local",
      requested_command: "pnpm test",
      preview_truncated: false,
      suites: [
        {
          name: "conversation-renderings.test.ts",
          tests: [
            { name: "renders Trace activity", status: "passed" },
            {
              name: "keeps failed tool output local",
              status: "failed",
              error: "Expected local failure marker",
            },
            {
              name: "skips unavailable browser check",
              status: "skipped",
            },
          ],
        },
      ],
      execution: {
        command: "pnpm test",
        exit_code: 0,
        stdout:
          "Test Files  3 passed (3)\n     Tests  18 passed (18)\n  Duration  1.24s",
        stderr: "",
        reason: "completed",
        started_at: createdAt,
        duration_ms: 1240,
        truncated: false,
        output_complete: true,
        result_available: true,
      },
      archive: {
        status: "failed",
        artifact_id: null,
        error: "本地预览未归档",
      },
    },
  },
  {
    type: "TOOL_CALL_START",
    parentMessageId: "stream-assistant",
    toolCallId: "stream-search",
    toolCallName: "web_search",
  },
  {
    type: "TOOL_CALL_ARGS",
    toolCallId: "stream-search",
    delta: '{"query":"shadcn Trace"}',
  },
  { type: "TOOL_CALL_END", toolCallId: "stream-search" },
  {
    type: "TOOL_CALL_RESULT",
    toolCallId: "stream-search",
    messageId: "stream-search-result",
    content: { results: sources },
  },
  {
    type: "CUSTOM",
    name: "buddy.citations",
    value: {
      message_id: "stream-assistant",
      sources,
    },
  },
  ...[
    "## 流式输出\n\n",
    "这段回答通过 **真实事件转换** 逐步追加。\n\n",
    "读取、编辑、失败命令、测试报告和搜索来源都已经在同一次回放中完成。\n\n",
    "```typescript\n",
    'const component = "Thread"\n',
    "```\n\n",
    "回放完成，文件变更和来源可以继续展开查看。",
  ].map((delta) => ({
    type: "TEXT_MESSAGE_CONTENT",
    messageId: "stream-assistant",
    delta,
  })),
  { type: "TEXT_MESSAGE_END", messageId: "stream-assistant" },
  runFinished(),
]

function answerEvents(messageId: string, text: string) {
  return (
    text.match(/[\s\S]{1,48}/g)?.map((delta) => ({
      type: "TEXT_MESSAGE_CONTENT",
      messageId,
      delta,
    })) ?? []
  )
}

function streamLifecycle(messageId: string) {
  return [
    runStarted(),
    { type: "TEXT_MESSAGE_START", messageId, role: "assistant" },
  ]
}

function finishStream(messageId: string) {
  return [{ type: "TEXT_MESSAGE_END", messageId }, runFinished()]
}

const finalResponse = (messageId: string, text: string) => [
  ...answerEvents(messageId, text),
  ...finishStream(messageId),
]
const toolResponseId = "stream-tools-assistant"
const sourceResponseId = "stream-sources-assistant"
const toolIds = new Set([
  "stream-tool",
  "stream-edit",
  "stream-failed",
  "stream-tests",
])
const streamToolEvents = [
  ...streamLifecycle(toolResponseId),
  ...completeStreamEvents
    .filter(
      (event) =>
        typeof event.toolCallId === "string" && toolIds.has(event.toolCallId)
    )
    .map((event) =>
      event.parentMessageId
        ? { ...event, parentMessageId: toolResponseId }
        : event
    ),
  ...finalResponse(
    toolResponseId,
    "文件读取、修改和测试过程已完成，失败命令保留在对应步骤中。"
  ),
]
const streamSourceEvents = [
  ...streamLifecycle(sourceResponseId),
  ...completeStreamEvents
    .filter(
      (event) =>
        (typeof event.toolCallId === "string" &&
          event.toolCallId === "stream-search") ||
        (event.type === "CUSTOM" && event.name === "buddy.citations")
    )
    .map((event) => {
      if (event.parentMessageId)
        return { ...event, parentMessageId: sourceResponseId }
      if (event.type === "CUSTOM" && event.name === "buddy.citations")
        return {
          ...event,
          value: {
            ...(event.value as Record<string, unknown>),
            message_id: sourceResponseId,
          },
        }
      return event
    }),
  ...finalResponse(
    sourceResponseId,
    "已完成检索，并把引用来源附在最终回复中。"
  ),
]

// 真实后端会把铺垫文本、工具调用和最终答复拆到不同消息上
const interleavedPreambleId = "stream-interleaved-preamble"
const interleavedWorkId = "stream-interleaved-work"
const interleavedFinalId = "stream-interleaved-final"
const streamInterleavedEvents = [
  runStarted(),
  {
    type: "TEXT_MESSAGE_START",
    messageId: interleavedPreambleId,
    role: "assistant",
  },
  ...["先读取配置，", "确认入口文件后再修改。"].map((delta) => ({
    type: "TEXT_MESSAGE_CONTENT",
    messageId: interleavedPreambleId,
    delta,
  })),
  { type: "TEXT_MESSAGE_END", messageId: interleavedPreambleId },
  {
    type: "REASONING_MESSAGE_START",
    parentMessageId: interleavedWorkId,
    messageId: "stream-interleaved-reasoning",
  },
  ...["配置里只有一个入口文件，", "改完再跑一次测试。"].map((delta) => ({
    type: "REASONING_MESSAGE_CONTENT",
    messageId: "stream-interleaved-reasoning",
    delta,
  })),
  { type: "REASONING_MESSAGE_END", messageId: "stream-interleaved-reasoning" },
  {
    type: "TOOL_CALL_START",
    parentMessageId: interleavedWorkId,
    toolCallId: "stream-interleaved-read",
    toolCallName: "read_file",
  },
  {
    type: "TOOL_CALL_ARGS",
    toolCallId: "stream-interleaved-read",
    delta: '{"path":"package.json"}',
  },
  { type: "TOOL_CALL_END", toolCallId: "stream-interleaved-read" },
  {
    type: "TOOL_CALL_RESULT",
    toolCallId: "stream-interleaved-read",
    messageId: "stream-interleaved-read-result",
    content: '{"name":"fba-buddy","private":true}',
  },
  {
    type: "TOOL_CALL_START",
    parentMessageId: interleavedWorkId,
    toolCallId: "stream-interleaved-edit",
    toolCallName: "edit_file",
  },
  {
    type: "TOOL_CALL_ARGS",
    toolCallId: "stream-interleaved-edit",
    delta:
      '{"path":"apps/renderings/src/fixtures.ts","old_string":"<StaticPreview />","new_string":"<Thread />"}',
  },
  { type: "TOOL_CALL_END", toolCallId: "stream-interleaved-edit" },
  {
    type: "TOOL_CALL_RESULT",
    toolCallId: "stream-interleaved-edit",
    messageId: "stream-interleaved-edit-result",
    content: JSON.stringify({
      additions: 1,
      deletions: 1,
      message: "Reused Thread",
    }),
  },
  {
    type: "TEXT_MESSAGE_START",
    messageId: interleavedFinalId,
    role: "assistant",
  },
  ...["配置已经读完并完成修改，", "\n\n最终答复在工具执行结束之后才输出。"].map(
    (delta) => ({
      type: "TEXT_MESSAGE_CONTENT",
      messageId: interleavedFinalId,
      delta,
    })
  ),
  { type: "TEXT_MESSAGE_END", messageId: interleavedFinalId },
  runFinished(),
]

baseScenes.find((scene) => scene.id === "stream-tools")!.streamEvents =
  streamToolEvents
baseScenes.find((scene) => scene.id === "stream-sources")!.streamEvents =
  streamSourceEvents
baseScenes.find((scene) => scene.id === "stream-interleaved")!.streamEvents =
  streamInterleavedEvents
