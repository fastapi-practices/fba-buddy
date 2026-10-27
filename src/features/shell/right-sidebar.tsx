import { useContext, useEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { useQuery } from "@tanstack/react-query"
import { listConversations } from "@/api"
import { queryKeys } from "@/api/query-keys"
import {
  FileDiffIcon,
  ChevronDownIcon,
  MessageSquareIcon,
  PlusIcon,
  Maximize2Icon,
  Minimize2Icon,
  XIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TooltipHint } from "@/components/ui/tooltip"
import { WorkspaceGitPanel } from "@/features/chat/workspace-git-panel"
import { useT } from "@/hooks/use-t"
import { cn } from "@/lib/utils"
import { useSelectionStore } from "./selection-store"
import { RightSidebarChromeContext } from "./right-sidebar-chrome-context"
import { RightSidebarToggle } from "./right-sidebar-toggle"
import { NAVBAR_ICON_CLASS } from "./sidebar-style"
import { useAgentMode } from "@/features/chat/conversation-mode"
import {
  useRightSidebar,
  useRightSidebarStore,
  type RightSidebarPanel,
} from "./right-sidebar-store"

export function RightSidebar({
  hostKey,
  id,
  chat,
  active,
}: {
  hostKey: string
  id: string
  chat?: ReactNode
  active: boolean
}) {
  const t = useT()
  const coding = useAgentMode() === "coding"
  const state = useRightSidebar(hostKey)
  const store = useRightSidebarStore()
  const chrome = useContext(RightSidebarChromeContext)
  const focusedChatPane = useSelectionStore(
    (selection) => selection.focusedChatPane
  )
  const diffAvailability = chrome?.diffAvailability[hostKey]
  const diffPane = diffAvailability?.[focusedChatPane]
    ? focusedChatPane
    : "left"
  const diffAvailable = !!diffAvailability?.[diffPane]
  const headerTarget = chrome?.target
  const setHeaderBounds = chrome?.setBounds
  const sidebarConversationId = useSelectionStore(
    (selection) => selection.sidebarConversationId
  )
  const conversations = useQuery({
    queryKey: queryKeys.conversations(),
    queryFn: () => listConversations(),
    enabled: !!chat && !!sidebarConversationId,
  })
  const chatTitle = conversations.data?.items.find(
    (item) => item.conversation_id === sidebarConversationId
  )?.title
  const sidebar = useRef<HTMLElement>(null)
  const tabList = useRef<HTMLDivElement>(null)
  const [hiddenPanels, setHiddenPanels] = useState<RightSidebarPanel[]>([])
  const drag = useRef<{ x: number; width: number } | null>(null)
  const [availableWidth, setAvailableWidth] = useState(0)
  const [requestedWidth, setRequestedWidth] = useState<number | null>(null)
  useEffect(() => {
    const container = sidebar.current?.parentElement
    if (!container) return
    const observer = new ResizeObserver(([entry]) =>
      setAvailableWidth(entry.contentRect.width)
    )
    observer.observe(container)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!active || !state.open || !headerTarget || !setHeaderBounds) return
    const element = sidebar.current
    if (!element) return
    const measure = () => {
      const rect = element.getBoundingClientRect()
      const navbar = headerTarget.closest('[data-slot="app-navbar"]')
      const left = rect.left - (navbar?.getBoundingClientRect().left ?? 0)
      setHeaderBounds((current) =>
        current?.hostKey === hostKey &&
        current.left === left &&
        current.width === rect.width &&
        current.maximized === state.maximized
          ? current
          : { hostKey, left, width: rect.width, maximized: state.maximized }
      )
    }
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    if (element.parentElement) observer.observe(element.parentElement)
    measure()
    return () => {
      observer.disconnect()
      setHeaderBounds((current) =>
        current?.hostKey === hostKey ? null : current
      )
    }
  }, [
    active,
    state.open,
    state.maximized,
    headerTarget,
    setHeaderBounds,
    hostKey,
  ])
  useEffect(() => {
    const list = tabList.current
    if (!list) return
    const measureHiddenTabs = () => {
      const visible = list.getBoundingClientRect()
      const hidden = Array.from(
        list.querySelectorAll<HTMLElement>('[data-slot="right-sidebar-tab"]')
      ).flatMap((tab) => {
        const bounds = tab.getBoundingClientRect()
        return bounds.left < visible.left - 1 ||
          bounds.right > visible.right + 1
          ? [tab.dataset.panel as RightSidebarPanel]
          : []
      })
      setHiddenPanels((current) =>
        current.length === hidden.length &&
        current.every((panel, index) => panel === hidden[index])
          ? current
          : hidden
      )
    }
    const revealActiveTab = () => {
      const tab = list.querySelector<HTMLElement>(
        '[data-slot="right-sidebar-tab"][data-active="true"]'
      )
      if (!tab) return
      const visible = list.getBoundingClientRect()
      const bounds = tab.getBoundingClientRect()
      if (bounds.left < visible.left)
        list.scrollLeft += bounds.left - visible.left
      else if (bounds.right > visible.right)
        list.scrollLeft += bounds.right - visible.right
    }
    const observer = new ResizeObserver(() => {
      revealActiveTab()
      measureHiddenTabs()
    })
    observer.observe(list)
    list.addEventListener("scroll", measureHiddenTabs, { passive: true })
    return () => {
      observer.disconnect()
      list.removeEventListener("scroll", measureHiddenTabs)
    }
  }, [headerTarget, state.open, state.activePanel, state.panels])
  const minWidth = Math.min(416, availableWidth / 2)
  const maxWidth = Math.max(
    minWidth,
    availableWidth - Math.min(360, availableWidth / 2)
  )
  const width = Math.min(
    maxWidth,
    Math.max(minWidth, requestedWidth ?? availableWidth / 2)
  )
  const resize = (next: number) =>
    setRequestedWidth(Math.min(maxWidth, Math.max(minWidth, next)))
  const closePanel = (panel: RightSidebarPanel) => {
    if (panel === "chat") useSelectionStore.getState().resetSidebarChat()
    store.closePanel(hostKey, panel)
  }
  const panelOptions = [
    {
      kind: "chat" as const,
      label: t("common.sidebarChat"),
      Icon: MessageSquareIcon,
      available: !!chat,
    },
    {
      kind: "diff" as const,
      label: t("common.gitDiffPanel"),
      Icon: FileDiffIcon,
      available: diffAvailable,
    },
  ].filter((option) =>
    option.kind === "chat" ? !!chat : coding || diffAvailable
  )

  return (
    <aside
      ref={sidebar}
      id={id}
      aria-label={t("common.rightSidebar")}
      data-slot="right-sidebar"
      data-maximized={state.maximized ? "true" : undefined}
      className={cn(
        "relative flex min-h-0 min-w-0 shrink-0 flex-col border-l bg-background",
        !state.open && "hidden"
      )}
      aria-hidden={!state.open}
      inert={!state.open ? true : undefined}
      style={
        state.maximized
          ? { position: "absolute", inset: 0, width: "100%", zIndex: 20 }
          : { width: availableWidth ? width : "50%" }
      }
    >
      <div
        role="separator"
        tabIndex={0}
        aria-label={t("common.rightSidebarResize")}
        aria-orientation="vertical"
        aria-controls={id}
        aria-valuemin={Math.round(minWidth)}
        aria-valuemax={Math.round(maxWidth)}
        aria-valuenow={Math.round(width)}
        data-slot="right-sidebar-resize"
        className="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize touch-none outline-none hover:bg-border/60 focus-visible:bg-border focus-visible:ring-2 focus-visible:ring-ring"
        hidden={state.maximized}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          event.preventDefault()
          event.currentTarget.setPointerCapture(event.pointerId)
          drag.current = { x: event.clientX, width }
        }}
        onPointerMove={(event) => {
          if (drag.current)
            resize(drag.current.width + drag.current.x - event.clientX)
        }}
        onPointerUp={(event) => {
          drag.current = null
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId)
        }}
        onPointerCancel={() => {
          drag.current = null
        }}
        onDoubleClick={() => setRequestedWidth(null)}
        onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
            return
          event.preventDefault()
          if (event.key === "Home") resize(minWidth)
          else if (event.key === "End") resize(maxWidth)
          else resize(width + (event.key === "ArrowLeft" ? 24 : -24))
        }}
      />
      <Tabs
        value={state.activePanel}
        onValueChange={(value) => {
          if (value === "diff") store.addPanel(hostKey, "diff", diffPane)
          else if (value === "chat") store.selectPanel(hostKey, value)
        }}
        className="h-full min-h-0 gap-0"
      >
        {active &&
          state.open &&
          headerTarget &&
          createPortal(
            <div
              data-slot="right-sidebar-navigation"
              className="electron-drag relative flex h-full w-full min-w-0 items-center gap-1 pr-1.5 pl-3"
            >
              <Separator
                data-slot="right-sidebar-header-separator"
                orientation="vertical"
                aria-hidden
                className="absolute inset-y-0 left-0 my-auto data-vertical:h-5"
              />
              <TabsList
                ref={tabList}
                variant="dock"
                aria-label={t("common.rightSidebarPanels")}
                className="electron-drag min-w-0 flex-1"
              >
                {state.panels.map((panel) => {
                  const option = panelOptions.find(
                    (item) => item.kind === panel
                  )
                  if (!option) return null
                  const { Icon } = option
                  const label =
                    panel === "chat" ? chatTitle || option.label : option.label
                  return (
                    <div
                      key={panel}
                      data-slot="right-sidebar-tab"
                      data-panel={panel}
                      data-active={
                        state.activePanel === panel ? "true" : undefined
                      }
                      className="electron-no-drag right-sidebar-tab group flex h-8 w-[18em] min-w-[min(12em,100%)] shrink grow-0 basis-[18em] items-center rounded-md text-sm"
                      draggable
                      onDragStart={(event) =>
                        event.dataTransfer.setData(
                          "application/x-fba-sidebar-panel",
                          panel
                        )
                      }
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault()
                        const moved = event.dataTransfer.getData(
                          "application/x-fba-sidebar-panel"
                        )
                        if (moved === "chat" || moved === "diff")
                          store.movePanel(hostKey, moved, panel)
                      }}
                      onAuxClick={(event) => {
                        if (event.button === 1) {
                          event.preventDefault()
                          closePanel(panel)
                        }
                      }}
                    >
                      <TabsTrigger
                        value={panel}
                        className="min-w-0 flex-1 justify-start"
                      >
                        <Icon />
                        <span className="min-w-0 truncate">{label}</span>
                      </TabsTrigger>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={t("common.rightSidebarCloseTab", {
                          panel: label,
                        })}
                        onClick={() => closePanel(panel)}
                        className="mr-0.5 shrink-0"
                      >
                        <XIcon />
                      </Button>
                    </div>
                  )
                })}
              </TabsList>
              {hiddenPanels.length > 0 && (
                <DropdownMenu modal={false}>
                  <TooltipHint label={t("common.rightSidebarMoreTabs")}>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className={NAVBAR_ICON_CLASS}
                          aria-label={t("common.rightSidebarMoreTabs")}
                        />
                      }
                    >
                      <ChevronDownIcon />
                    </DropdownMenuTrigger>
                  </TooltipHint>
                  <DropdownMenuContent align="end" className="min-w-44">
                    <DropdownMenuGroup>
                      {hiddenPanels.map((panel) => {
                        const option = panelOptions.find(
                          (item) => item.kind === panel
                        )!
                        const label =
                          panel === "chat"
                            ? chatTitle || option.label
                            : option.label
                        return (
                          <DropdownMenuItem
                            key={panel}
                            onClick={() => store.selectPanel(hostKey, panel)}
                          >
                            <option.Icon />
                            {label}
                          </DropdownMenuItem>
                        )
                      })}
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {state.panels.length > 0 && (
                <DropdownMenu modal={false}>
                  <TooltipHint label={t("common.rightSidebarAddPanel")}>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className={NAVBAR_ICON_CLASS}
                          aria-label={t("common.rightSidebarAddPanel")}
                        />
                      }
                    >
                      <PlusIcon />
                    </DropdownMenuTrigger>
                  </TooltipHint>
                  <DropdownMenuContent align="end" className="min-w-44">
                    <DropdownMenuGroup>
                      {panelOptions.map(({ kind, Icon, label, available }) => (
                        <DropdownMenuItem
                          key={kind}
                          disabled={!available}
                          onClick={() =>
                            store.addPanel(hostKey, kind, diffPane)
                          }
                        >
                          <Icon />
                          {label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {state.activePanel && (
                <TooltipHint
                  label={t(
                    state.maximized
                      ? "common.rightSidebarRestore"
                      : "common.rightSidebarMaximize"
                  )}
                >
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className={NAVBAR_ICON_CLASS}
                    aria-label={t(
                      state.maximized
                        ? "common.rightSidebarRestore"
                        : "common.rightSidebarMaximize"
                    )}
                    aria-pressed={state.maximized}
                    onClick={() =>
                      store.setMaximized(hostKey, !state.maximized)
                    }
                  >
                    {state.maximized ? <Minimize2Icon /> : <Maximize2Icon />}
                  </Button>
                </TooltipHint>
              )}
              <RightSidebarToggle hostKey={hostKey} panelId={id} />
            </div>,
            headerTarget
          )}
        {!state.activePanel && (
          <nav
            aria-label={t("common.rightSidebarOpenPanel")}
            className="flex min-h-0 flex-1 flex-col justify-center gap-2 px-6"
          >
            {panelOptions.map(({ kind, label, Icon, available }) => (
              <Button
                key={kind}
                variant="ghost"
                size="lg"
                className="w-full justify-start"
                disabled={!available}
                onClick={() => store.addPanel(hostKey, kind, diffPane)}
              >
                <Icon data-icon="inline-start" />
                {label}
              </Button>
            ))}
          </nav>
        )}
        {chat && state.panels.includes("chat") && (
          <TabsContent
            value={
              state.activePanel === "diff" && state.diffPane === "right"
                ? "diff"
                : "chat"
            }
            keepMounted
            className="flex min-h-0 flex-1 flex-col overflow-hidden data-hidden:hidden"
          >
            {chat}
          </TabsContent>
        )}
        {state.panels.includes("diff") && state.diffPane === "left" && (
          <TabsContent
            value="diff"
            keepMounted
            className="flex min-h-0 flex-1 flex-col overflow-hidden data-hidden:hidden"
          >
            <WorkspaceGitPanel />
          </TabsContent>
        )}
      </Tabs>
    </aside>
  )
}
