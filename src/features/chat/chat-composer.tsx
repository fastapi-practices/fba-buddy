import { useAgentMode } from "@/features/chat/conversation-mode"
import { useCallback, useEffect, useRef, useState } from "react"
import { useChatRuntime, useChatRuntimeState } from "@/features/chat/chat-runtime"
import type { ComposerLayoutProps } from "@/components/ai-elements/thread"
import type { DefaultModel, ProviderOption } from "@/lib/types"
import type { ReactNode } from "react"
import { ChatComposerTools } from "./chat-composer-tools"
import { ComposerAcpSelector } from "./composer-acp-selector"

export function ChatComposer({
  input,
  actions,
  providers,
  defaultModel,
  conversationId,
  project,
  codingContext,
  workLocation,
  usage,
}: ComposerLayoutProps & {
  providers: ProviderOption[]
  defaultModel?: DefaultModel | null
  conversationId: string | null
  project: ReactNode
  codingContext: ReactNode
  workLocation: ReactNode
  usage: ReactNode
}) {
  const runtime = useChatRuntime()
  const mode = useAgentMode()
  const hasMessages = useChatRuntimeState((state) => state.thread.messages.length > 0)
  const started = Boolean(conversationId) || hasMessages
  const coding = mode === "coding"
  const codingInMenu = coding && started
  const contextInMenu = mode !== "chat" && started
  const toolsInMenu = mode === "chat" || started
  const text = useChatRuntimeState((state) => state.composer.text)
  const attachmentCount = useChatRuntimeState(
    (state) => state.composer.attachments.length
  )
  const inputAreaRef = useRef<HTMLDivElement>(null)
  const [wrapExpanded, setWrapExpanded] = useState(false)
  // 内容换行就把输入框撑开，按实际高度判断，不按字符数
  const measureWrap = useCallback(() => {
    const textarea = inputAreaRef.current?.querySelector("textarea")
    if (!textarea) return
    const styles = getComputedStyle(textarea)
    const lineHeight = Number.parseFloat(styles.lineHeight) || 0
    if (!lineHeight) return
    const padding =
      Number.parseFloat(styles.paddingTop) +
      Number.parseFloat(styles.paddingBottom)
    const overflows = textarea.scrollHeight > textarea.clientHeight + 1
    const wrapped =
      overflows || textarea.scrollHeight > lineHeight + padding + 1
    // 展开后输入框变宽，同一段文字可能又放得下一行，
    // 这里只扩不收，等内容清空再回到紧凑状态，避免宽窄来回跳
    if (wrapped) setWrapExpanded(true)
  }, [])
  // 内容清空时收回紧凑状态，渲染期调整状态而不是在副作用里改
  if (!text.trim() && wrapExpanded) {
    setWrapExpanded(false)
  }
  useEffect(() => {
    measureWrap()
  }, [measureWrap, text])
  useEffect(() => {
    const textarea = inputAreaRef.current?.querySelector("textarea")
    if (!textarea) return
    const observer = new ResizeObserver(measureWrap)
    observer.observe(textarea)
    return () => observer.disconnect()
  }, [measureWrap])
  const expanded = wrapExpanded || attachmentCount > 0
  return (
    <ChatComposerTools
      providers={providers}
      defaultModel={defaultModel}
      conversationId={conversationId}
      toolsInMenu={toolsInMenu}
    >
      {({ attach, assistant, permission, model, options }) => (
        <div
          data-mode={mode}
          data-expanded={expanded}
          className="composer-shell relative flex w-full flex-col"
        >
          {!started ? codingContext : null}
          <div
            data-slot="composer-shell"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              const files = Array.from(event.dataTransfer.files)
              if (files.length) void runtime.composer.addFiles(files)
            }}
            onPointerDown={(event) => {
              if (event.target !== event.currentTarget) return
              event.preventDefault()
              event.currentTarget
                .querySelector<HTMLElement>(".composer-input")
                ?.focus({ preventScroll: true })
            }}
            className="chat-composer-surface relative grid w-full cursor-text items-end gap-2 p-2 transition-[border-color] focus-within:border-border data-[dragging=true]:border-dashed data-[dragging=true]:border-ring data-[dragging=true]:bg-accent"
          >
            <div
              ref={inputAreaRef}
              className="chat-composer-input-area min-w-0"
            >
              {input}
            </div>
            <div className="chat-composer-leading flex min-w-0 items-center gap-1">
              {attach(
                toolsInMenu ? (
                  <>
                    {contextInMenu ? codingContext : null}
                    {options}
                  </>
                ) : undefined
              )}
              {!codingInMenu ? assistant : null}
              {permission}
              {coding && !started ? options : null}
              {codingInMenu ? <ComposerAcpSelector /> : null}
            </div>
            <div className="chat-composer-trailing flex min-w-0 items-center justify-end gap-1">
              {model}
              {usage}
              {actions}
            </div>
          </div>
          {mode === "work" && !started ? (
            <div
              data-slot="composer-context-footer"
              className="chat-composer-context-footer mx-3 -mt-3 flex min-w-0 flex-wrap items-center gap-1 rounded-b-2xl px-2 pt-4 pb-1"
            >
              {project}
              {options}
              <div className="ml-auto shrink-0">{workLocation}</div>
            </div>
          ) : null}
        </div>
      )}
    </ChatComposerTools>
  )
}
