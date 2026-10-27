import {
  ArrowLeftIcon,
  ArrowRightIcon,
  MessageCirclePlusIcon,
  PanelLeftIcon,
} from "lucide-react"
import { useContext } from "react"

import { useQuery } from "@tanstack/react-query"
import { listConversations } from "@/api"
import { queryKeys } from "@/api/query-keys"
import { useAppLocation } from "@/app/use-app-location"
import { Button } from "@/components/ui/button"
import { useSidebar } from "@/components/ui/sidebar"
import { TooltipHint } from "@/components/ui/tooltip"
import {
  isBuddyDesktopMac,
  MAC_TRAFFIC_LIGHT_GUTTER_CLASS,
} from "@/lib/desktop-chrome"
import {
  NAVBAR_CONTENT_INSET_CLASS,
  NAVBAR_ICON_CLASS,
} from "@/features/shell/sidebar-style"
import { HeaderConversationMenu } from "@/features/shell/header-conversation-menu"
import {
  isStandalonePage,
  workspaceHeaderTitle,
} from "@/features/shell/header-title"
import { RightSidebarToggle } from "./right-sidebar-toggle"
import type { WorkspaceCommand } from "@/features/shell/workspace-commands"
import { useSelectionStore } from "@/features/shell/selection-store"
import { useT } from "@/hooks/use-t"
import { cn } from "@/lib/utils"
import { RightSidebarChromeContext } from "./right-sidebar-chrome-context"

export function AppNavbar({
  onCommand,
}: {
  onCommand: (command: WorkspaceCommand) => void
}) {
  const t = useT()
  const { open, isMobile, toggleSidebar } = useSidebar()
  const location = useAppLocation()
  const chrome = useContext(RightSidebarChromeContext)
  const sidebarHeader = chrome?.bounds
  const showWorkspaceChrome =
    location.route !== "settings" && !isStandalonePage(location)
  const showTitle = showWorkspaceChrome && !sidebarHeader?.maximized
  const showCollapsedNewChat = showWorkspaceChrome && (!open || isMobile)
  // 标题分割线收起时跟在「新对话」按钮右侧，展开时对齐动态侧边栏的分界
  const titleAtSidebarEdge = showTitle && open && !isMobile
  const titleFollowsButtons = showTitle && (!open || isMobile)
  const selectedConversationId = useSelectionStore(
    (state) => state.selectedConversationId
  )
  const sidebarHostKey = useSelectionStore((state) => state.chatPaneKey)
  const conversationsQuery = useQuery({
    queryKey: queryKeys.conversations(),
    queryFn: () => listConversations(),
  })
  const conversation = conversationsQuery.data?.items.find(
    (item) =>
      item.conversation_id ===
      (selectedConversationId ?? location.conversationId)
  )
  const title = workspaceHeaderTitle(location, conversation?.title, t)

  return (
    /* 图标在「应用顶缘 ↔ 内容卡片」之间居中：下缘被卡片外边距占掉一段，上侧补同宽内边距抵消 */
    <div
      data-slot="app-navbar"
      className={cn(
        "electron-drag relative order-first flex h-10 shrink-0 items-center pr-3",
        NAVBAR_CONTENT_INSET_CLASS
      )}
    >
      <div
        style={
          sidebarHeader && titleFollowsButtons
            ? { right: `calc(100% - ${sidebarHeader.left}px + 2.25rem)` }
            : undefined
        }
        className={cn(
          "electron-drag absolute inset-y-0 left-0 z-10 flex items-center gap-0.5 pr-2",
          NAVBAR_CONTENT_INSET_CLASS,
          isBuddyDesktopMac() ? MAC_TRAFFIC_LIGHT_GUTTER_CLASS : "pl-3"
        )}
      >
        <TooltipHint label={t("navigation.back")} side="top">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("navigation.back")}
            className={NAVBAR_ICON_CLASS}
            onClick={() => window.history.back()}
          >
            <ArrowLeftIcon strokeWidth={1.75} />
          </Button>
        </TooltipHint>
        <TooltipHint label={t("common.forward")} side="top">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("common.forward")}
            className={NAVBAR_ICON_CLASS}
            onClick={() => window.history.forward()}
          >
            <ArrowRightIcon strokeWidth={1.75} />
          </Button>
        </TooltipHint>
        {showWorkspaceChrome ? (
          <TooltipHint label={t("common.sidebar")} side="top">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("common.sidebar")}
              className={NAVBAR_ICON_CLASS}
              onClick={toggleSidebar}
            >
              <PanelLeftIcon strokeWidth={1.75} />
            </Button>
          </TooltipHint>
        ) : null}
        {showCollapsedNewChat ? (
          <TooltipHint label={t("common.newChat")} side="top">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("common.newChat")}
              className={NAVBAR_ICON_CLASS}
              onClick={() => onCommand("new-conversation")}
            >
              <MessageCirclePlusIcon strokeWidth={1.75} />
            </Button>
          </TooltipHint>
        ) : null}
        {titleFollowsButtons ? <NavbarTitleBlock title={title} /> : null}
      </div>
      {titleAtSidebarEdge ? (
        /* 分割线与动态侧边栏右侧分割线共线：卡片 1px 边框与侧栏 border-r 内缩 1px 相互抵消 */
        <div
          style={
            sidebarHeader
              ? { right: `calc(100% - ${sidebarHeader.left}px + 2.25rem)` }
              : undefined
          }
          className={cn(
            "electron-drag absolute inset-y-0 z-10 flex items-center pr-3",
            "left-[calc(var(--sidebar-width)_+_var(--app-rail-width))]",
            NAVBAR_CONTENT_INSET_CLASS
          )}
        >
          <NavbarTitleBlock title={title} atSidebarEdge />
        </div>
      ) : null}
      {/* 搜索与新建都收在动态侧边栏头部，导航栏右侧只留对话操作 */}
      <div
        className="electron-no-drag ml-auto flex shrink-0 items-center gap-0.5"
        style={
          sidebarHeader
            ? {
                marginRight: `max(0px, calc(100% - ${sidebarHeader.left}px - 0.75rem))`,
              }
            : undefined
        }
      >
        {location.route === "chat" ? (
          <>
            {conversation && !sidebarHeader?.maximized ? (
              <HeaderConversationMenu item={conversation} />
            ) : null}
            {!sidebarHeader && <RightSidebarToggle hostKey={sidebarHostKey} />}
          </>
        ) : null}
      </div>
      <div
        ref={chrome?.setTarget}
        data-slot="right-sidebar-header-slot"
        hidden={!sidebarHeader}
        className={cn(
          "electron-drag absolute inset-y-0 min-w-0",
          NAVBAR_CONTENT_INSET_CLASS
        )}
        style={
          sidebarHeader
            ? { left: sidebarHeader.left, width: sidebarHeader.width }
            : undefined
        }
      />
    </div>
  )
}

/** 标题竖分割线上下不挨边，标题显示在分割线右侧；贴动态侧边栏时分割线压在边框上，不留左内边距 */
function NavbarTitleBlock({
  title,
  atSidebarEdge = false,
}: {
  title: string
  atSidebarEdge?: boolean
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-3",
        atSidebarEdge ? "" : "pl-3"
      )}
    >
      <div
        aria-hidden
        className="h-5 w-px shrink-0 bg-[var(--surface-border)]"
      />
      <h1 className="max-w-[min(40vw,26rem)] min-w-0 truncate text-sm font-medium">
        {title}
      </h1>
    </div>
  )
}
