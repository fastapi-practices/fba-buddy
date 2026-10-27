import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { Navigate, Route, Routes } from "react-router"

import { defaultModelForKind, getModelOptions } from "@/api"
import { queryKeys } from "@/api/query-keys"
import {
  adoptCreatedConversation,
  appNavigate,
  startDraftChat,
} from "@/app/navigation"
import {
  useAppLocation,
  useSyncLocationToSelection,
} from "@/app/use-app-location"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AssistantsPage } from "@/features/assistants/AssistantsPage"
import { ChatPane } from "@/features/chat/ChatPane"
import { resolveChatPaneConversationId } from "@/features/chat/use-chat"
import { useComposerStore } from "@/features/chat/composer-store"
import { useWorktreeDraft } from "@/features/chat/worktree-draft"
import { resolveChatDefaultModel } from "@/features/chat/model-option"
import { filterChatProviders } from "@/features/image/image-models"
import { ImagePage } from "@/features/image/ImagePage"
import { SettingsPage } from "@/features/settings/SettingsPage"
import { ChannelSettings } from "@/features/settings/channel-settings"
import { AppNavbar } from "@/features/shell/AppNavbar"
import { AppRail } from "@/features/shell/AppRail"
import { AppSidebar } from "@/features/shell/AppSidebar"
import { CommandPalette } from "@/features/shell/CommandPalette"
import { isStandalonePage } from "@/features/shell/header-title"
import { usePrefsStore } from "@/features/shell/prefs-store"
import { useSelectionStore } from "@/features/shell/selection-store"
import { useRightSidebarStore } from "@/features/shell/right-sidebar-store"
import { ShortcutBindings } from "@/features/shell/shortcut-bindings"
import { openConversationInChatTarget } from "@/features/shell/sidebar-chat-navigation"
import {
  applyWorkspaceCommand,
  type WorkspaceCommand,
} from "@/features/shell/workspace-commands"
import { WorkspacePage } from "@/features/workspace/WorkspacePage"
import type { DefaultModel, ProviderOption } from "@/lib/types"
import { cn } from "@/lib/utils"
import { dataSourceKey, useAccountSourceStore } from "@/lib/account-source"
import {
  RightSidebarChromeContext,
  type RightSidebarHeaderBounds,
  type RightSidebarDiffAvailability,
} from "./right-sidebar-chrome-context"

export function WorkspaceShell() {
  const queryClient = useQueryClient()
  const sidebarOpen = usePrefsStore((state) => state.sidebarOpen)
  const setSidebarOpen = usePrefsStore((state) => state.setSidebarOpen)
  const density = usePrefsStore((state) => state.density)
  const setModel = useComposerStore((state) => state.setModel)
  const [commandOpen, setCommandOpen] = useState(false)
  const chatPaneKey = useSelectionStore((state) => state.chatPaneKey)
  const appLocation = useAppLocation()
  const appliedDraftModelKey = useRef<string | null>(null)
  const [sidebarHeaderTarget, setSidebarHeaderTarget] =
    useState<HTMLDivElement | null>(null)
  const [sidebarHeaderBounds, setSidebarHeaderBounds] =
    useState<RightSidebarHeaderBounds | null>(null)
  const [diffAvailability, setDiffAvailability] =
    useState<RightSidebarDiffAvailability>({})
  const sidebarChrome = useMemo(
    () => ({
      target: sidebarHeaderTarget,
      setTarget: setSidebarHeaderTarget,
      bounds: sidebarHeaderBounds,
      setBounds: setSidebarHeaderBounds,
      diffAvailability,
      setDiffAvailability,
    }),
    [sidebarHeaderTarget, sidebarHeaderBounds, diffAvailability]
  )

  useSyncLocationToSelection()

  const modelOptionsQuery = useQuery({
    queryKey: queryKeys.modelOptions(),
    queryFn: getModelOptions,
  })

  const chatActive = appLocation.route === "chat"

  useEffect(() => {
    function markOpenConversationRead() {
      if (appLocation.route !== "chat") {
        return
      }
      const id = useSelectionStore.getState().selectedConversationId
      if (id) {
        useSelectionStore.getState().markConversationRead(id)
      }
    }
    window.addEventListener("focus", markOpenConversationRead)
    return () => window.removeEventListener("focus", markOpenConversationRead)
  }, [appLocation.route])

  useEffect(() => {
    if (appLocation.conversationId) {
      appliedDraftModelKey.current = null
      return
    }
    if (appLocation.route !== "chat") {
      return
    }
    const options = modelOptionsQuery.data
    if (!options) {
      return
    }
    if (appliedDraftModelKey.current === chatPaneKey) {
      return
    }
    const fallback = resolveChatDefaultModel(
      filterChatProviders(options.providers),
      defaultModelForKind(options, "chat")
    )
    if (!fallback) {
      return
    }
    setModel(fallback.provider_id, fallback.model_id)
    appliedDraftModelKey.current = chatPaneKey
  }, [
    appLocation.conversationId,
    appLocation.route,
    chatPaneKey,
    modelOptionsQuery.data,
    setModel,
  ])

  const providers = modelOptionsQuery.data?.providers ?? []
  const defaultModel = defaultModelForKind(modelOptionsQuery.data, "chat")

  function runWorkspaceCommand(command: WorkspaceCommand) {
    const result = applyWorkspaceCommand(command)
    if (result.remountChat) {
      startDraftChat()
      return
    }
    appNavigate(result.path)
  }

  function invalidateChatQueries() {
    void queryClient.invalidateQueries({ queryKey: queryKeys.conversations() })
    void queryClient.invalidateQueries({ queryKey: queryKeys.artifacts() })
  }

  return (
    <RightSidebarChromeContext value={sidebarChrome}>
      <SidebarProvider
        open={sidebarOpen}
        onOpenChange={setSidebarOpen}
        className="flex flex-col bg-[var(--app-shell-background)] text-foreground"
        data-density={density}
      >
        {/* DOM 顺序让导航条的「更多」排在 rail 之后，保住 hover 定位契约 */}
        <div className="flex min-h-0 w-full flex-1 overflow-hidden">
          <AppRail onCommand={runWorkspaceCommand} />
          {/* 侧栏展开时与内容面板同属一个现代化面板，仅靠分割线分隔；整体用小圆角 */}
          <div
            data-slot="workspace-content-frame"
            className="relative my-(--app-card-gap) mr-(--app-card-gap) flex min-h-0 flex-1 overflow-hidden rounded-md border border-[var(--surface-border)] bg-[var(--app-content-surface)]"
          >
            {!isStandalonePage(appLocation) ? (
              <AppSidebar
                onCommand={runWorkspaceCommand}
                onSelectConversation={openConversationInChatTarget}
              />
            ) : null}
            <SidebarInset className="h-full min-h-0 min-w-0 overflow-hidden bg-transparent p-0">
              <section className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
                  {/* Message animations can override inherited visibility, so hide the whole layer */}
                  <div
                    className={cn(
                      "flex min-h-0 flex-1 flex-col overflow-hidden",
                      chatActive
                        ? "relative"
                        : "pointer-events-none invisible absolute inset-0 opacity-0"
                    )}
                    aria-hidden={!chatActive}
                    inert={!chatActive ? true : undefined}
                  >
                    <ChatRoute
                      active={chatActive}
                      chatPaneKey={chatPaneKey}
                      providers={providers}
                      defaultModel={defaultModel}
                      sidebarChat={
                        <SidebarChat
                          hostKey={chatPaneKey}
                          providers={providers}
                          defaultModel={defaultModel}
                          onSettled={invalidateChatQueries}
                        />
                      }
                      onConversationId={(conversationId) => {
                        adoptCreatedConversation(conversationId)
                        void queryClient.invalidateQueries({
                          queryKey: queryKeys.conversations(),
                        })
                      }}
                      onSettled={invalidateChatQueries}
                    />
                  </div>
                  <div
                    className={cn(
                      "min-h-0",
                      chatActive
                        ? "hidden"
                        : "flex flex-1 flex-col overflow-hidden"
                    )}
                  >
                    <Routes>
                      <Route
                        path="/"
                        element={<Navigate to="/chat" replace />}
                      />
                      <Route
                        path="/settings/:section?"
                        element={<SettingsPage />}
                      />
                      <Route
                        path="/workspace/:kind?"
                        element={<WorkspacePage />}
                      />
                      <Route path="/image" element={<ImagePage />} />
                      <Route path="/channels" element={<ChannelSettings />} />
                      <Route
                        path="/assistants/:section?"
                        element={<AssistantsPage />}
                      />
                      <Route path="/chat/:conversationId?" element={null} />
                      <Route
                        path="*"
                        element={<Navigate to="/chat" replace />}
                      />
                    </Routes>
                  </div>
                </div>
              </section>
            </SidebarInset>
          </div>
        </div>
        <AppNavbar onCommand={runWorkspaceCommand} />
        <ShortcutBindings
          onToggleCommand={() => setCommandOpen((open) => !open)}
        />
        <CommandPalette
          open={commandOpen}
          onOpenChange={setCommandOpen}
          onCommand={runWorkspaceCommand}
        />
      </SidebarProvider>
    </RightSidebarChromeContext>
  )
}

function SidebarChat({
  hostKey,
  providers,
  defaultModel,
  onSettled,
}: {
  hostKey: string
  providers: ProviderOption[]
  defaultModel: DefaultModel | null
  onSettled: () => void
}) {
  const conversationId = useSelectionStore(
    (state) => state.sidebarConversationId
  )
  const searchTarget = useSelectionStore((state) => state.sidebarSearchTarget)
  const queryClient = useQueryClient()
  return (
    <ChatPane
      paneKey="sidebar-chat"
      sidebarHostKey={hostKey}
      sidebarPane="right"
      active={false}
      conversationId={conversationId}
      searchTarget={searchTarget}
      searchFromUrl={false}
      projectId={null}
      providers={providers}
      defaultModel={defaultModel}
      onConversationId={(id) => {
        useSelectionStore.getState().setSidebarConversationId(id)
        void queryClient.invalidateQueries({
          queryKey: queryKeys.conversations(),
        })
      }}
      onSettled={onSettled}
    />
  )
}

function ChatRoute({
  sidebarChat,
  active,
  chatPaneKey,
  providers,
  defaultModel,
  onConversationId,
  onSettled,
}: {
  sidebarChat: ReactNode
  active: boolean
  chatPaneKey: string
  providers: ProviderOption[]
  defaultModel: DefaultModel | null
  onConversationId: (conversationId: string) => void
  onSettled: () => void
}) {
  const urlConversationId = useAppLocation().conversationId
  const selectedConversationId = useSelectionStore(
    (state) => state.selectedConversationId
  )
  const conversationId = resolveChatPaneConversationId(
    chatPaneKey,
    selectedConversationId,
    urlConversationId
  )
  const projectId = useSelectionStore((state) => state.selectedProjectId)
  const setProjectId = useSelectionStore((state) => state.setSelectedProjectId)
  const worktreeDraft = useWorktreeDraft(chatPaneKey)
  const source = useAccountSourceStore(dataSourceKey)
  const ready = useAccountSourceStore((state) => state.ready)
  useLayoutEffect(() => {
    if (!ready || conversationId) return
    useRightSidebarStore.getState().setOpen(chatPaneKey, false)
    useSelectionStore.getState().setFocusedChatPane("left")
  }, [chatPaneKey, conversationId, source, ready])
  return (
    <ChatPane
      key={chatPaneKey.startsWith("draft-") ? chatPaneKey : "conversation"}
      active={active}
      sidebarChat={sidebarChat}
      conversationId={conversationId}
      worktreeDraft={!conversationId ? worktreeDraft : null}
      paneKey={chatPaneKey}
      projectId={projectId}
      onProjectChange={setProjectId}
      providers={providers}
      defaultModel={defaultModel}
      onConversationId={onConversationId}
      onSettled={onSettled}
    />
  )
}
