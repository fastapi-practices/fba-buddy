import { translateCurrent, type Translator } from "@/lib/i18n"
import type { AppLocation } from "@/app/location"
import { getWorkspaceNavItem } from "@/features/workspace/workspace-nav"

export function isStandalonePage(
  location: Pick<AppLocation, "route" | "workspaceKind">
): boolean {
  return (
    location.route === "channels" ||
    (location.route === "workspace" && location.workspaceKind === "acp")
  )
}

export function workspaceHeaderTitle(
  location: Pick<
    AppLocation,
    "route" | "settingsSection" | "workspaceKind" | "assistantsSection"
  >,
  conversationTitle?: string | null,
  t: Translator = translateCurrent
): string {
  if (location.route === "settings") {
    /* 大标题固定为「设置」，分节标题由内容区的页面标题承载 */
    return t("common.settings")
  }
  if (location.route === "workspace") {
    return t(getWorkspaceNavItem(location.workspaceKind).label)
  }
  if (location.route === "image") {
    return t("common.draw")
  }
  if (location.route === "channels") {
    return t("common.channels")
  }
  if (location.route === "assistants") {
    return t(
      location.assistantsSection === "expert"
        ? "common.experts"
        : "common.assistant"
    )
  }
  const title = conversationTitle?.trim()
  return title || t("common.newChat")
}
