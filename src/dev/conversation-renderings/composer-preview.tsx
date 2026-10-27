import { useMemo, useState } from "react"

import { Thread, type ThreadComponents } from "@/components/ai-elements/thread"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { ChatRuntimeProvider } from "@/features/chat/chat-runtime"
import { ChatPaneSlotsContext } from "@/features/chat/chat-pane-slots"
import { ChatComposerLayoutSlot } from "@/features/chat/chat-composer-layout"
import { ConversationModeContext } from "@/features/chat/conversation-mode"
import { ChatWelcome } from "@/features/chat/chat-welcome"
import { AgentModeMenu } from "@/features/chat/composer-agent-mode"
import { toThreadMessages } from "@/features/chat/thread-message"
import { previewProviders } from "./preview-data"
import type { AgentMode, ChatMessage } from "@/lib/types"

const MODE_HINTS: Record<AgentMode, string> = {
  chat: "紧凑输入框，工具收在「＋」菜单",
  work: "多行输入框，新对话下方是项目与工具入口",
  coding: "多行输入框，顶部是项目、编码代理与工作位置",
}

const previewMessages: ChatMessage[] = [
  {
    id: "preview-message",
    role: "user",
    content: "帮我看看这个分支还差什么",
    createdAt: "2026-10-22T09:00:00Z",
    pk: 900,
  },
]

export function ComposerPreview({ mode }: { mode: AgentMode }) {
  const [started, setStarted] = useState(false)
  const providers = previewProviders.providers
  const defaultModel = previewProviders.default_models.chat ?? null
  const threadMessages = useMemo(
    () => (started ? toThreadMessages(previewMessages) : []),
    [started]
  )
  const paneSlots = useMemo(
    () => ({
      paneKey: "preview-composer",
      providers,
      defaultModel,
      conversationId: started ? "preview-conversation" : null,
      projectId: started ? 11 : null,
      onProjectChange: () => undefined,
      projectDisabled: false,
      worktreeDraft: null,
    }),
    [defaultModel, providers, started]
  )
  const threadComponents = useMemo<ThreadComponents>(
    () => ({
      // 大标题和输入框是一个整体，一起居中
      Welcome: ChatWelcome,
      ComposerLayout: ChatComposerLayoutSlot,
      conversationId: started ? "preview-conversation" : null,
      visible: true,
    }),
    [started]
  )
  return (
    <ConversationModeContext value={mode}>
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">侧栏模式入口</span>
            <AgentModeMenu />
          </div>
          <p className="text-xs text-muted-foreground">{MODE_HINTS[mode]}</p>
          <ToggleGroup
            className="ml-auto"
            value={[started ? "started" : "draft"]}
            onValueChange={(values) => {
              const next = values[0]
              if (next === "started" || next === "draft")
                setStarted(next === "started")
            }}
            size="sm"
            variant="outline"
            aria-label="会话状态"
          >
            <ToggleGroupItem value="draft">新对话</ToggleGroupItem>
            <ToggleGroupItem value="started">已有对话</ToggleGroupItem>
          </ToggleGroup>
        </header>
        <div className="chat-transcript flex min-h-0 flex-1 flex-col bg-background">
          <ChatRuntimeProvider
            messages={threadMessages}
            rawMessages={started ? previewMessages : []}
            running={false}
            onSend={() => undefined}
            onStop={async () => undefined}
            onReload={async () => undefined}
          >
            <ChatPaneSlotsContext.Provider value={paneSlots}>
              <Thread autoFocus={false} components={threadComponents} />
            </ChatPaneSlotsContext.Provider>
          </ChatRuntimeProvider>
        </div>
      </div>
    </ConversationModeContext>
  )
}
