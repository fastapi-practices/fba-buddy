import { useState } from "react"
import { MoonIcon, SunIcon } from "lucide-react"
import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"
import { scenes } from "./fixtures"
import { DEFAULT_TOKENS_PER_SECOND } from "./playback"
import { SceneRuntime } from "./runtime"
import { ComposerPreview } from "./composer-preview"
import { resetLocalPreviewInput } from "./local-api"
import { useComposerStore } from "@/features/chat/composer-store"
import { Input } from "@/components/ui/input"

export function RenderingPreview() {
  const [sceneId, setSceneId] = useState("markdown")
  const [width, setWidth] = useState("full")
  const [revision, setRevision] = useState(0)
  const [surface, setSurface] = useState("thread")
  const [tokensPerSecond, setTokensPerSecond] = useState(
    DEFAULT_TOKENS_PER_SECOND
  )
  // 三种会话模式共用一套渲染，模式由侧栏模式入口统一控制
  const mode = useComposerStore((state) => state.agent_mode ?? "work")
  const { resolvedTheme, setTheme } = useTheme()
  const scene = scenes.find((item) => item.id === sceneId)!
  const reset = () => {
    resetLocalPreviewInput()
    useComposerStore.getState().clearInput()
    setRevision((value) => value + 1)
  }

  return (
    <Tabs
      value={surface}
      onValueChange={(value) => setSurface(String(value))}
      className="flex h-dvh min-h-0 min-w-0 flex-col bg-background text-foreground"
    >
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-6">
        <div>
          <h1 className="text-base font-semibold">FbaBuddy · 对话渲染</h1>
          <p className="text-xs text-muted-foreground">
            真实组件 · 本地内容 · 自动流式回放
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TabsList>
            <TabsTrigger value="thread">完整对话</TabsTrigger>
            <TabsTrigger value="composer">输入框</TabsTrigger>
            <TabsTrigger value="nodes">节点说明</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
            <label
              htmlFor="rendering-speed"
              className="text-xs text-muted-foreground"
            >
              回放速度
            </label>
            <Input
              id="rendering-speed"
              type="number"
              min={1}
              max={1000}
              value={tokensPerSecond}
              onChange={(event) => {
                const next = Number(event.target.value)
                if (!Number.isFinite(next) || next < 1) return
                setTokensPerSecond(next)
                reset()
              }}
              className="h-8 w-20"
            />
            <span className="text-xs text-muted-foreground">tk/s</span>
          </div>
          <ToggleGroup
            value={[width]}
            onValueChange={(values) => {
              if (values[0]) setWidth(String(values[0]))
            }}
            size="sm"
            variant="outline"
            aria-label="渲染区宽度"
          >
            <ToggleGroupItem value="full">完整宽度</ToggleGroupItem>
            <ToggleGroupItem value="narrow">窄屏 390px</ToggleGroupItem>
          </ToggleGroup>
          <Button
            size="icon-sm"
            variant="outline"
            aria-label="切换主题"
            onClick={() =>
              setTheme(resolvedTheme === "dark" ? "light" : "dark")
            }
          >
            {resolvedTheme === "dark" ? <SunIcon /> : <MoonIcon />}
          </Button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">
        <TabsContent value="thread" className="min-h-0 overflow-hidden">
          <div className="flex h-full min-h-0 flex-col md:flex-row">
            <aside className="flex max-h-40 shrink-0 flex-col gap-1 overflow-y-auto border-b p-3 md:max-h-none md:w-60 md:border-r md:border-b-0">
              <nav aria-label="渲染场景" className="flex flex-col gap-1">
                {scenes.map((item) => (
                  <div key={item.id} className="flex flex-col gap-1">
                    <Button
                      variant={sceneId === item.id ? "secondary" : "ghost"}
                      className="justify-start"
                      aria-current={sceneId === item.id ? "page" : undefined}
                      onClick={() => {
                        reset()
                        setSceneId(item.id)
                      }}
                    >
                      {item.title}
                    </Button>
                    {sceneId === item.id ? (
                      <div className="px-2 pb-1 text-xs text-muted-foreground">
                        <p>{item.description}</p>
                        <p className="mt-1.5 flex flex-wrap gap-1">
                          {item.covers.map((cover) => (
                            <span
                              key={cover}
                              className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
                            >
                              {cover}
                            </span>
                          ))}
                        </p>
                      </div>
                    ) : null}
                  </div>
                ))}
              </nav>
            </aside>
            <section
              aria-label={scene.title}
              className="flex min-h-0 min-w-0 flex-1 flex-col"
            >
              <div className="flex min-h-0 min-w-0 flex-1 justify-center overflow-hidden bg-muted/30">
                <div
                  data-testid="rendering-thread"
                  className={cn(
                    "chat-transcript flex h-full min-h-0 w-full flex-col bg-background",
                    width === "narrow" && "max-w-[390px] border-x"
                  )}
                >
                  <SceneRuntime
                    key={`${scene.id}:${revision}`}
                    scene={scene}
                    tokensPerSecond={tokensPerSecond}
                    mode={mode}
                  />
                </div>
              </div>
            </section>
          </div>
        </TabsContent>
        <TabsContent value="composer" className="min-h-0 overflow-hidden">
          <ComposerPreview mode={mode} />
        </TabsContent>
        <TabsContent value="nodes" className="min-h-0 overflow-y-auto">
          <section className="mx-auto grid w-full max-w-5xl gap-3 p-4 text-sm sm:p-6">
            <h2 className="text-base font-semibold">对话节点怎么渲染</h2>
            <div className="grid gap-2">
              <p>
                执行过程：项目自定义 RunActivity 与 ThinkingIndicator，内部用
                shadcn/ui Trace 折叠
              </p>
              <p>思考：项目自定义 Reasoning，shadcn/ui Trace 折叠</p>
              <p>
                工具调用：项目自定义 ToolCall，shadcn/ui Trace + Code Block
              </p>
              <p>
                测试报告：项目自定义 TestRunTool 与 TestResults，只渲染请求与结果
              </p>
              <p>工具失败：项目自定义 StackTrace</p>
              <p>计划：项目自定义 PlanCard，shadcn/ui Trace</p>
              <p>
                生命周期：后端 buddy.planning、buddy.subagent、buddy.activity、buddy.compaction
                等事件，显示计划、子代理任务和上下文压缩
              </p>
              <p>
                上下文压缩：渲染成执行过程最前面的一条过程线，压缩中到已压缩，
                展开是压缩前后的 token 与消息数对比
              </p>
              <p>
                上一轮尝试：同一回合里被这一轮取代的那次尝试，
                折叠在用户提问与执行过程之间
              </p>
              <p>
                结构化输入：shadcn/ui Questionnaire（底层 @shadcn/react/questionnaire），
                提问卡片渲染在发问那条消息的正文里
              </p>
              <p>
                工具审批：项目自定义 ToolApproval，等待审批时执行过程里显示等待轨迹与耗时
              </p>
              <p>
                模型切换检查点：对话中途换模型时插在回合之间，文案末尾的问号说明缓存失效、
                费用增加与背景信息压缩的影响
              </p>
              <p>
                上下文用量：输入框上的环形指示，悬浮后显示已用上下文、进度条、
                输入输出与费用明细
              </p>
              <p>
                消息队列：项目自定义 MessageQueue，只在回复进行中出现
              </p>
              <p>
                记忆：记忆的写入、更新与删除只是执行过程里的普通工具调用，
                没有单独的组件
              </p>
              <p>
                回复动作栏：复制、重新生成、相关分支、从这里新建分支、删除、
                导出为 Markdown 与共消耗 token，回合结束才出现，
                子代理等后台任务没跑完时同样不出现；
                token 悬浮展开模型 ID、输入输出 token、费用与耗时
              </p>
              <p>
                重新生成：后端只接受最后一条用户消息，当前回合的最新回复原地重生成，
                历史回复先分叉出新分支再重生成，所以历史回复显示「在新分支中重新生成」
              </p>
              <p>
                用户消息动作栏：复制、编辑、删除与从这里新建分支；
                只有当前回合的提问能直接编辑，历史提问显示「在新分支中编辑」
              </p>
              <p>
                消息：shadcn/ui Message 与 Message Scroller（底层
                @shadcn/react/message-scroller），配合本地聊天运行时
              </p>
              <p>
                文本与 Markdown：react-markdown 加项目自定义 remark/rehype 插件
              </p>
              <p>代码：react-shiki / Shiki 语法高亮</p>
              <p>公式与图表：KaTeX 与 mermaid</p>
              <p>
                文件与差异：项目自定义 DiffViewer，客户端右侧边栏的 Diff 面板用
                @pierre/diffs
              </p>
              <p>变更卡片与产物卡片：项目自定义</p>
              <p>图标：Lucide React</p>
              <p>
                事件流：模拟 AG-UI 事件逐条驱动页面，回放速度可在导航栏调整
              </p>
            </div>
          </section>
        </TabsContent>
      </div>
    </Tabs>
  )
}
