import { useRightSidebar } from "@/features/shell/right-sidebar-store"
import {
  MessageSquarePlusIcon,
  PanelLeftIcon,
  PlusIcon,
  SearchIcon,
} from "lucide-react"
import { useEffect, useState } from "react"

import type { AppLocation } from "@/app/location"
import type { ConversationMessageTarget } from "@/app/conversation-message-location"
import { useAppLocation } from "@/app/use-app-location"
import { SidebarHeader, useSidebar } from "@/components/ui/sidebar"
import type { AssistantsSection } from "@/features/assistants/assistant-nav"
import { AssistantSearchInput } from "@/features/assistants/assistant-search-input"
import { useAssistantSearchStore } from "@/features/assistants/assistant-state"
import { AgentModeMenu } from "@/features/chat/composer-agent-mode"
import { startResourceCreateChat } from "@/features/chat/resource-create"
import { SettingsSearchInput } from "@/features/settings/settings-search-input"
import { workspaceHeaderTitle } from "@/features/shell/header-title"
import {
  ConversationSearchDialog,
  type ConversationSearchScope,
} from "@/features/shell/conversation-search-dialog"
import { useSelectionStore } from "@/features/shell/selection-store"
import { useShortcutStore } from "@/features/shell/shortcut-store"
import {
  eventMatchesCombo,
  resolveShortcut,
  SHORTCUT_IDS,
} from "@/features/shell/keyboard-shortcuts"
import {
  SIDEBAR_HEADER_ICON_GAP_CLASS,
  SIDEBAR_HEADER_TITLE_CLASS,
} from "@/features/shell/sidebar-style"
import { SidebarToolbarButton } from "@/features/shell/sidebar-toolbar-button"
import {
  WorkspaceCronAddButton,
  WorkspaceCronCreateInChatButton,
} from "@/features/workspace/cron-library"
import { WorkspaceMcpAddButtons } from "@/features/workspace/mcp-library"
import { WorkspaceKnowledgeAddButton } from "@/features/workspace/knowledge-base-controls"
import { WorkspacePhraseAddButton } from "@/features/workspace/phrase-library"
import { isWorkspaceSearchKind } from "@/features/workspace/workspace-nav"
import { WorkspaceSearchInput } from "@/features/workspace/workspace-search-input"
import {
  WorkspaceSkillAddButton,
  WorkspaceSkillCreateInChatButton,
} from "@/features/workspace/workspace-library"
import { useT } from "@/hooks/use-t"
import { cn } from "@/lib/utils"

export function SidebarChrome({
  showWorkspaceTools = true,
  onSelectConversation,
  conversationTitles,
}: {
  showWorkspaceTools?: boolean
  conversationTitles?: Readonly<Record<string, string>>
  onSelectConversation?: (
    id: string,
    target?: ConversationMessageTarget
  ) => void
}) {
  const t = useT()
  const { toggleSidebar } = useSidebar()
  const location = useAppLocation()
  const searchable = sidebarSearchable(location)
  const recordingShortcut = useShortcutStore((state) => state.recording)
  const shortcutOverrides = useShortcutStore((state) => state.overrides)
  const hostKey = useSelectionStore((state) => state.chatPaneKey)
  const rightSidebar = useRightSidebar(hostKey)
  const sidebarChatVisible =
    rightSidebar.open && rightSidebar.activePanel === "chat"
  const focusedChatPane = useSelectionStore((state) => state.focusedChatPane)
  const sidebarConversationId = useSelectionStore(
    (state) => state.sidebarConversationId
  )
  const conversationId =
    sidebarChatVisible && focusedChatPane === "right"
      ? sidebarConversationId
      : location.conversationId

  /* 记住在哪一视图展开搜索框：换视图即自动收起，搜索词随输入框卸载清空 */
  const viewKey = [
    location.route,
    location.workspaceKind,
    location.assistantsSection,
  ].join(":")
  const [searchView, setSearchView] = useState<string | null>(null)
  const [searchScope, setSearchScope] = useState<ConversationSearchScope>("all")
  const searchOpen = searchView === viewKey

  useEffect(() => {
    if (
      location.route !== "chat" ||
      !onSelectConversation ||
      !showWorkspaceTools
    )
      return
    const keydown = (event: KeyboardEvent) => {
      if (
        event.isComposing ||
        event.repeat ||
        recordingShortcut ||
        event.defaultPrevented ||
        !(event.metaKey || event.ctrlKey) ||
        event.altKey
      )
        return
      const key = event.key.toLowerCase()
      if (key !== "f") return
      if (
        SHORTCUT_IDS.some((id) => {
          const combo = resolveShortcut(id, shortcutOverrides)
          return combo && eventMatchesCombo(event, combo)
        })
      )
        return
      const ownDialog = document.querySelector(
        '[data-slot="conversation-search-dialog"]'
      )
      const modal = document.querySelector(
        '[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]'
      )
      if (modal && modal !== ownDialog) return
      event.preventDefault()
      if (searchOpen) {
        ownDialog?.querySelector<HTMLInputElement>("input")?.focus()
        return
      }
      setSearchScope(!event.shiftKey && conversationId ? "current" : "all")
      setSearchView(viewKey)
    }
    window.addEventListener("keydown", keydown)
    return () => window.removeEventListener("keydown", keydown)
  }, [
    conversationId,
    location.route,
    onSelectConversation,
    searchOpen,
    showWorkspaceTools,
    viewKey,
    recordingShortcut,
    shortcutOverrides,
  ])

  return (
    <SidebarHeader className="p-0">
      {/* 模式切换只属于主页，其余视图在这一格显示各自的标题，设置搜索框固定显示在标题下方 */}
      <div className="flex h-12 items-center justify-between gap-2 px-3">
        <div className="min-w-0">
          {location.route === "chat" ? (
            <AgentModeMenu />
          ) : (
            <span
              data-slot="sidebar-title"
              className={cn(
                /* 与主页模式切换同一个标题位：同一套内边距与字号，文字左边线对齐 */
                "block truncate rounded-md",
                SIDEBAR_HEADER_TITLE_CLASS
              )}
            >
              {workspaceHeaderTitle(location, undefined, t)}
            </span>
          )}
        </div>
        {showWorkspaceTools ? (
          <div className={cn("shrink-0", SIDEBAR_HEADER_ICON_GAP_CLASS)}>
            {searchable ? (
              <SidebarToolbarButton
                label={t("common.search")}
                pressed={searchOpen}
                onClick={() => {
                  setSearchScope("all")
                  setSearchView(searchOpen ? null : viewKey)
                }}
              >
                <SearchIcon strokeWidth={1.75} />
              </SidebarToolbarButton>
            ) : null}
            {/* 新建跟在搜索按钮右侧，承载本视图的新建入口 */}
            <SidebarNewAction location={location} />
            <SidebarToolbarButton
              label={t("common.sidebar")}
              onClick={toggleSidebar}
              className="md:hidden"
            >
              <PanelLeftIcon strokeWidth={1.75} />
            </SidebarToolbarButton>
          </div>
        ) : null}
      </div>
      {/* 设置搜索固定显示在大标题下方，不像其余视图那样收在搜索按钮后面 */}
      {location.route === "settings" ? (
        <div className="px-3 pb-2">
          <SettingsSearchInput />
        </div>
      ) : null}
      {/* 主页搜索走弹窗，其余视图仍在头部下方挂搜索框 */}
      {location.route === "chat" && onSelectConversation ? (
        <ConversationSearchDialog
          open={searchOpen}
          onOpenChange={(open) => setSearchView(open ? viewKey : null)}
          onSelect={onSelectConversation}
          conversationId={conversationId}
          conversationTitles={conversationTitles}
          initialScope={searchScope}
        />
      ) : null}
      {searchOpen && searchable && location.route !== "chat" ? (
        <div className="px-3 pb-2">
          <SidebarSearchField location={location} />
        </div>
      ) : null}
    </SidebarHeader>
  )
}

/** 有可搜列表的视图才给搜索入口 */
function sidebarSearchable(location: AppLocation) {
  if (location.route === "chat" || location.route === "assistants") {
    return true
  }
  return (
    location.route === "workspace" &&
    isWorkspaceSearchKind(location.workspaceKind)
  )
}

function SidebarSearchField({ location }: { location: AppLocation }) {
  if (location.route === "assistants") {
    return <AssistantSearchInput section={location.assistantsSection} />
  }
  if (
    location.route === "workspace" &&
    isWorkspaceSearchKind(location.workspaceKind)
  ) {
    return <WorkspaceSearchInput kind={location.workspaceKind} />
  }
  return null
}

function SidebarNewAction({ location }: { location: AppLocation }) {
  if (location.route === "assistants") {
    return <AssistantCreateButton section={location.assistantsSection} />
  }
  if (location.route !== "workspace") {
    return null
  }
  switch (location.workspaceKind) {
    case "skill":
      return (
        <>
          <WorkspaceSkillCreateInChatButton />
          <WorkspaceSkillAddButton />
        </>
      )
    case "knowledge":
      return <WorkspaceKnowledgeAddButton />
    case "mcp":
      return <WorkspaceMcpAddButtons />
    case "phrase":
      return <WorkspacePhraseAddButton />
    case "cron":
      return (
        <>
          <WorkspaceCronCreateInChatButton />
          <WorkspaceCronAddButton />
        </>
      )
    default:
      return null
  }
}

function AssistantCreateButton({ section }: { section: AssistantsSection }) {
  const t = useT()
  const openCreate = useAssistantSearchStore((state) => state.openCreate)
  const kind = section === "expert" ? "expert" : "assistant"
  const label =
    section === "expert" ? t("common.newExpert") : t("common.newAssistant")

  /* 表单新建与对话快捷创建并列，图标按钮的可及名与提示语保持一致 */
  return (
    <>
      <SidebarToolbarButton
        label={t("common.createInChat")}
        onClick={() => void startResourceCreateChat(kind).catch(() => undefined)}
      >
        <MessageSquarePlusIcon strokeWidth={1.75} />
      </SidebarToolbarButton>
      <SidebarToolbarButton label={label} onClick={() => openCreate(section)}>
        <PlusIcon strokeWidth={1.75} />
      </SidebarToolbarButton>
    </>
  )
}
