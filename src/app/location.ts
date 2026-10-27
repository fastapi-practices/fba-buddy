import {
  normalizeAssistantsSection,
  type AssistantsSection,
} from "@/features/assistants/assistant-nav"
import {
  normalizeSettingsSection,
  type SettingsSectionId,
} from "@/features/settings/settings-nav"
import { normalizeWorkspaceKind } from "@/features/workspace/workspace-nav"
import type { AppRoute } from "@/app/routes"
import type { WorkspaceKind } from "@/lib/types"

export type AppLocation = {
  route: AppRoute
  conversationId: string | null
  settingsSection: SettingsSectionId
  workspaceKind: WorkspaceKind
  assistantsSection: AssistantsSection
}

export const DEFAULT_APP_LOCATION: AppLocation = {
  route: "chat",
  conversationId: null,
  settingsSection: "general",
  workspaceKind: "artifact",
  assistantsSection: "assistant",
}

export function appPaths() {
  return {
    chat: (conversationId?: string | null) =>
      conversationId ? `/chat/${encodeURIComponent(conversationId)}` : "/chat",
    settings: (section: SettingsSectionId = "general") =>
      `/settings/${section}`,
    workspace: (kind: WorkspaceKind = "artifact") => `/workspace/${kind}`,
    image: () => "/image",
    channels: () => "/channels",
    assistants: (section: AssistantsSection = "assistant") =>
      section === "expert" ? "/assistants/expert" : "/assistants",
  }
}

export function pathFromHash(hash: string): string {
  const trimmed = hash.replace(/^#/, "")
  const path = (trimmed.split("?")[0] || "/").trim()
  if (!path || path === "/") {
    return "/"
  }
  return path.startsWith("/") ? path : `/${path}`
}

export function currentAppLocation(): AppLocation {
  if (typeof window === "undefined") {
    return DEFAULT_APP_LOCATION
  }
  return parseAppPath(pathFromHash(window.location.hash))
}

export function parseAppPath(pathname: string): AppLocation {
  const path = pathname.split("?")[0]?.replace(/\/+$/, "") || "/"
  const segments = path.split("/").filter(Boolean)

  if (segments[0] === "settings") {
    return {
      ...DEFAULT_APP_LOCATION,
      route: "settings",
      settingsSection: normalizeSettingsSection(segments[1] ?? "general"),
    }
  }
  if (segments[0] === "workspace") {
    return {
      ...DEFAULT_APP_LOCATION,
      route: "workspace",
      workspaceKind: normalizeWorkspaceKind(segments[1] ?? "artifact"),
    }
  }
  if (segments[0] === "image") {
    return { ...DEFAULT_APP_LOCATION, route: "image" }
  }
  if (segments[0] === "channels") {
    return { ...DEFAULT_APP_LOCATION, route: "channels" }
  }
  if (segments[0] === "assistants") {
    return {
      ...DEFAULT_APP_LOCATION,
      route: "assistants",
      assistantsSection: normalizeAssistantsSection(segments[1]),
    }
  }
  if (segments[0] === "chat" || segments.length === 0) {
    const rawId = segments[1]
    return {
      ...DEFAULT_APP_LOCATION,
      route: "chat",
      conversationId: rawId ? decodeURIComponent(rawId) : null,
    }
  }
  return { ...DEFAULT_APP_LOCATION }
}

export function pathForRoute(
  route: AppRoute,
  extra?: {
    conversationId?: string | null
    settingsSection?: SettingsSectionId
    workspaceKind?: WorkspaceKind
    assistantsSection?: AssistantsSection
  }
) {
  const paths = appPaths()
  if (route === "settings") {
    return paths.settings(extra?.settingsSection ?? "general")
  }
  if (route === "workspace") {
    return paths.workspace(extra?.workspaceKind ?? "artifact")
  }
  if (route === "image") {
    return paths.image()
  }
  if (route === "channels") {
    return paths.channels()
  }
  if (route === "assistants") {
    return paths.assistants(extra?.assistantsSection ?? "assistant")
  }
  return paths.chat(extra?.conversationId)
}
