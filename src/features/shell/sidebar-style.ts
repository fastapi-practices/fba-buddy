export const SIDEBAR_GROUP_LABEL_CLASS =
  "group/label relative w-full justify-between rounded-md text-sm font-medium text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"

/**
 * 空分组占位行：与对话行同字号同上下留白，
 * 空态和有对话时的竖向节奏一致
 */
export const SIDEBAR_EMPTY_PLACEHOLDER_CLASS =
  "flex h-[var(--app-density-row-height)] items-center px-2 text-sm text-muted-foreground"

export const SIDEBAR_HEADER_ICON_CLASS =
  "size-6 text-muted-foreground [&>svg]:size-4"

export const SIDEBAR_HEADER_ICON_GAP_CLASS = "flex items-center gap-1"

/**
 * 动态侧边栏头部标题的统一规格：主页的模式切换与其余页的标题
 * 共用这套内边距与字号，文字的左边线和上下位置才在同一处
 */
const SIDEBAR_TITLE_TEXT_CLASS = "text-lg font-semibold"
export const SIDEBAR_HEADER_TITLE_CLASS = `px-1.5 py-1 ${SIDEBAR_TITLE_TEXT_CLASS}`

/** Same inset as header `pr-5` inside `px-3` groups: 12px + 8px. */
export const SIDEBAR_TRAILING_SLOT_CLASS =
  "pointer-events-none absolute inset-y-0 right-2 z-10 flex items-center"

/** Same as the content header `pl-3` / `pr-3` and sidebar group `px-3`. */
export const SIDEBAR_EDGE_INSET_X_CLASS = "px-6"

export const SIDEBAR_TRAILING_ICON_CLASS =
  "pointer-events-auto inline-flex size-6 shrink-0 items-center justify-center text-muted-foreground [&>svg]:size-4"

export const SIDEBAR_TRAILING_HOVER_ICON_CLASS =
  "opacity-0 transition-opacity group-hover/label:opacity-100 group-hover/project-row:opacity-100 focus-visible:opacity-100"

/** 窄图标导航条的图标按钮，data-active 高亮当前路由 */
export const RAIL_BUTTON_CLASS =
  "flex size-9 shrink-0 items-center justify-center rounded-[0.625rem] text-foreground/45 outline-none transition-[background-color,color] duration-150 hover:bg-foreground/[0.06] hover:text-foreground/90 focus-visible:ring-1 focus-visible:ring-foreground/20 motion-reduce:transition-none dark:hover:bg-foreground/[0.09] data-[active=true]:bg-foreground/[0.08] data-[active=true]:text-foreground [&>svg]:size-5"

/** 顶部导航栏的图标按钮 */
export const NAVBAR_ICON_CLASS =
  "electron-no-drag text-foreground/45 hover:bg-foreground/[0.06] hover:text-foreground/90 dark:hover:bg-foreground/[0.09] [&>svg]:size-4"

/**
 * 顶部导航栏内容的竖向居中契约：内容卡片外边距占掉下缘，
 * 上侧补同宽内边距，图标便在「应用顶缘 ↔ 内容卡片」之间居中
 */
export const NAVBAR_CONTENT_INSET_CLASS = "pt-(--app-card-gap)"
