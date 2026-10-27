import {
  BlocksIcon,
  BookOpenIcon,
  CircleHelpIcon,
  HouseIcon,
  ImageIcon,
  LayersIcon,
  LogOutIcon,
  LogInIcon,
  MoreHorizontalIcon,
  PinIcon,
  RadioIcon,
  SettingsIcon,
  TerminalIcon,
  TimerIcon,
} from "lucide-react"
import { useState, type ReactNode } from "react"

import { appNavigate, openWorkspace, startDraftChat } from "@/app/navigation"
import { useAppLocation } from "@/app/use-app-location"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import { Separator } from "@/components/ui/separator"
import { SidebarMenuButton } from "@/components/ui/sidebar"
import { TooltipHint } from "@/components/ui/tooltip"
import { logout } from "@/features/auth/api"
import { requestSignIn } from "@/features/auth/require-session"
import { CUSTOM_NAV_ENTRIES } from "@/features/shell/custom-nav"
import {
  usePrefsStore,
  type RailPinnedItem,
} from "@/features/shell/prefs-store"
import { RAIL_BUTTON_CLASS } from "@/features/shell/sidebar-style"
import type { WorkspaceCommand } from "@/features/shell/workspace-commands"
import { isCustomWorkspaceKind } from "@/features/workspace/workspace-nav"
import { useT } from "@/hooks/use-t"
import { avatarFallbackTone } from "@/lib/avatar-tone"
import { resolveMediaUrl } from "@/lib/media-url"
import { cn } from "@/lib/utils"
import { useSessionStore } from "@/lib/session"

export function AppRail({
  onCommand,
}: {
  onCommand: (command: WorkspaceCommand) => void
}) {
  const t = useT()
  const location = useAppLocation()
  const pinnedRailItems = usePrefsStore((state) => state.pinnedRailItems)
  const pinnedItems = RAIL_MORE_ITEMS.filter((item) =>
    pinnedRailItems.includes(item.id)
  )
  const customActive =
    location.route === "assistants" ||
    (location.route === "workspace" &&
      isCustomWorkspaceKind(location.workspaceKind))

  return (
    /* 固定栏与 synara 保持相同尺寸：图标居中，上下留白和按钮间距统一 */
    <nav
      aria-label={t("common.navigation")}
      data-slot="app-rail"
      className="flex w-(--app-rail-width) shrink-0 flex-col items-center gap-1.5 bg-[var(--app-rail-surface)] py-2.5"
    >
      <div className="flex min-h-0 w-full flex-1 [scrollbar-width:none] flex-col items-center gap-1.5 overflow-y-auto">
        <RailButton
          label={t("common.home")}
          /* 主页涵盖整个对话路由：进入具体会话后选中效果也不能消失 */
          active={location.route === "chat"}
          onClick={() => startDraftChat()}
        >
          <HouseIcon strokeWidth={1.75} />
        </RailButton>
        <>
          <RailButton
            label={t("common.draw")}
            active={location.route === "image"}
            onClick={() => onCommand("open-image")}
          >
            <ImageIcon strokeWidth={1.75} />
          </RailButton>
          <RailButton
            label={t("common.scheduledTasks")}
            active={
              location.route === "workspace" &&
              location.workspaceKind === "cron"
            }
            onClick={() => openWorkspace("cron")}
          >
            <TimerIcon strokeWidth={1.75} />
          </RailButton>
        </>

        {/* 自定义收编助手与各类自建内容，列表在动态侧边栏展示 */}
        <RailButton
          label={t("common.custom")}
          active={customActive}
          onClick={() => {
            if (customActive) {
              return
            }
            appNavigate(CUSTOM_NAV_ENTRIES[0].path)
          }}
        >
          <BlocksIcon strokeWidth={1.75} />
        </RailButton>
        <RailMoreMenu />
        {pinnedItems.length > 0 ? (
          <>
            <Separator className="my-0.5 h-px bg-[var(--surface-border)] data-horizontal:w-5" />
            {pinnedItems.map((item) => (
              <RailButton
                key={item.id}
                label={t(item.label)}
                active={isRailItemActive(item.id, location)}
                onClick={() => appNavigate(item.path)}
              >
                <item.icon strokeWidth={1.75} />
              </RailButton>
            ))}
          </>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col items-center gap-1.5">
        <RailButton
          label={t("common.help")}
          active={false}
          onClick={() => undefined}
        >
          <CircleHelpIcon strokeWidth={1.75} />
        </RailButton>
        <RailSettingsMenu onCommand={onCommand} />
      </div>
    </nav>
  )
}

/** 设置按钮弹窗：承载用户信息、设置入口与退出登录 */
function RailSettingsMenu({
  onCommand,
}: {
  onCommand: (command: WorkspaceCommand) => void
}) {
  const t = useT()
  const user = useSessionStore((state) => state.user)
  const accessToken = useSessionStore((state) => state.accessToken)
  const avatarSrc = resolveMediaUrl(user?.avatar)
  const location = useAppLocation()

  return (
    <DropdownMenu>
      <TooltipHint label={t("common.settings")} side="right">
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              aria-label={t("common.settings")}
              data-active={location.route === "settings" ? "true" : undefined}
              className={RAIL_BUTTON_CLASS}
            />
          }
        >
          <SettingsIcon strokeWidth={1.75} />
        </DropdownMenuTrigger>
      </TooltipHint>
      {/* 与上方「更多」弹窗同一左边距 */}
      <DropdownMenuContent
        side="right"
        align="end"
        sideOffset={8}
        className="min-w-64"
      >
        <div className="flex items-center gap-2 px-2 py-1.5">
          <Avatar>
            {avatarSrc ? (
              <AvatarImage
                src={avatarSrc}
                alt={user?.nickname || user?.username || ""}
              />
            ) : null}
            <AvatarFallback
              className={avatarFallbackTone(user?.id ?? user?.username ?? "U")}
            >
              {(user?.nickname || user?.username || "U")
                .slice(0, 1)
                .toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">
              {user?.nickname || user?.username || t("common.signIn")}
            </div>
            {user?.username ? (
              <div className="truncate text-xs text-muted-foreground">
                {user.username}
              </div>
            ) : null}
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onCommand("open-settings")}>
          <SettingsIcon />
          {t("common.settings")}
        </DropdownMenuItem>
        {accessToken ? (
          <DropdownMenuItem variant="destructive" onClick={() => void logout()}>
            <LogOutIcon />
            {t("common.signOut")}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={requestSignIn}>
            <LogInIcon />
            {t("common.signIn")}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function RailButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <TooltipHint label={label} side="right">
      <button
        type="button"
        aria-label={label}
        data-active={active ? "true" : undefined}
        className={RAIL_BUTTON_CLASS}
        onClick={onClick}
      >
        {children}
      </button>
    </TooltipHint>
  )
}

/** 「更多」悬浮弹窗里的可固定入口 */
const RAIL_MORE_ITEMS = [
  {
    id: "knowledge",
    label: "knowledge.title",
    icon: BookOpenIcon,
    path: "/workspace/knowledge",
  },
  {
    id: "artifact",
    label: "common.artifacts",
    icon: LayersIcon,
    path: "/workspace/artifact",
  },
  {
    id: "acp",
    label: "common.acp",
    icon: TerminalIcon,
    path: "/workspace/acp",
  },
  {
    id: "channels",
    label: "common.channels",
    icon: RadioIcon,
    path: "/channels",
  },
] as const

function isRailItemActive(
  id: RailPinnedItem,
  location: ReturnType<typeof useAppLocation>
) {
  return (
    (location.route === "workspace" && location.workspaceKind === id) ||
    (location.route === "channels" && id === "channels")
  )
}

function RailMoreMenu() {
  const t = useT()
  const location = useAppLocation()
  const [open, setOpen] = useState(false)
  const pinnedRailItems = usePrefsStore((state) => state.pinnedRailItems)
  const toggleRailItem = usePrefsStore((state) => state.toggleRailItem)
  const moreActive = RAIL_MORE_ITEMS.some(
    (item) =>
      isRailItemActive(item.id, location) && !pinnedRailItems.includes(item.id)
  )

  return (
    /* 点击目标后立即收起，避免浮层残留挡住下层内容 */
    <HoverCard open={open} onOpenChange={setOpen}>
      <HoverCardTrigger
        delay={80}
        closeDelay={120}
        render={
          <button
            type="button"
            data-active={moreActive ? "true" : undefined}
            className={RAIL_BUTTON_CLASS}
            onClick={(event) => event.preventDefault()}
          />
        }
      >
        <MoreHorizontalIcon strokeWidth={1.75} />
        {/* 用文本节点而不是 aria-label 提供可及名，避免与会话菜单的「更多」标签冲突 */}
        <span className="sr-only">{t("common.more")}</span>
      </HoverCardTrigger>
      <HoverCardContent
        side="right"
        align="start"
        sideOffset={8}
        collisionAvoidance={{ fallbackAxisSide: "none" }}
        aria-label={t("common.more")}
        className="w-48 gap-0.5 p-1"
      >
        {RAIL_MORE_ITEMS.map((item) => {
          const pinned = pinnedRailItems.includes(item.id)
          const pinLabel = t(
            pinned ? "common.unpinFromSidebar" : "common.pinToSidebar"
          )
          return (
            <div
              key={item.id}
              data-slot="rail-more-item"
              data-rail-item={item.id}
              className="group/rail-more-item relative flex items-center"
            >
              <SidebarMenuButton
                className="pr-9"
                isActive={isRailItemActive(item.id, location)}
                onClick={() => {
                  appNavigate(item.path)
                  setOpen(false)
                }}
              >
                <item.icon />
                <span>{t(item.label)}</span>
              </SidebarMenuButton>
              <TooltipHint label={pinLabel} side="right">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`${pinLabel}: ${t(item.label)}`}
                  aria-pressed={pinned}
                  className={cn(
                    "absolute right-1 size-7 shrink-0",
                    !pinned &&
                      "pointer-events-none opacity-0 group-focus-within/rail-more-item:pointer-events-auto group-focus-within/rail-more-item:opacity-100 group-hover/rail-more-item:pointer-events-auto group-hover/rail-more-item:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100"
                  )}
                  onClick={(event) => {
                    event.stopPropagation()
                    toggleRailItem(item.id)
                  }}
                >
                  <PinIcon className={cn(pinned && "fill-current")} />
                </Button>
              </TooltipHint>
            </div>
          )
        })}
      </HoverCardContent>
    </HoverCard>
  )
}
