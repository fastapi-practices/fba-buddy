import { useAppLocation } from "@/app/use-app-location"
import { ArchivedChatsSettings } from "@/features/settings/archived-chats-settings"
import { AssistantSettings } from "@/features/settings/assistant-settings"
import { ModelSettings } from "@/features/settings/model-settings"
import { DisplaySettings } from "@/features/settings/display-settings"
import { GeneralSettings } from "@/features/settings/general-settings"
import { RuntimeEnvironmentSettings } from "@/features/settings/runtime-environment-settings"
import { WorktreeSettings } from "@/features/settings/worktree-settings"
import { ShortcutSettings } from "@/features/settings/shortcut-settings"
import type { SettingsSectionId } from "@/features/settings/settings-nav"
import { MemorySettings } from "@/features/settings/memory-settings"

export function SettingsPage() {
  const settingsSection = useAppLocation().settingsSection
  return (
    /* 滚动放到整幅面板，滚动条贴窗口右缘，列底边距由内列自带 */
    <div
      data-slot="settings-page"
      className="app-content-surface h-full overflow-y-auto"
    >
      <div className="mx-auto w-full max-w-3xl px-4 pt-6 pb-8 sm:px-10 sm:pt-8">
        <SettingsSection key={settingsSection} section={settingsSection} />
      </div>
    </div>
  )
}

function SettingsSection({ section }: { section: SettingsSectionId }) {
  if (section === "environment") return <RuntimeEnvironmentSettings />
  if (section === "worktrees") return <WorktreeSettings />
  if (section === "display") {
    return <DisplaySettings />
  }
  if (section === "shortcuts") {
    return <ShortcutSettings />
  }
  if (section === "assistant") {
    return <AssistantSettings />
  }
  if (section === "models") {
    return <ModelSettings />
  }
  if (section === "memories") {
    return <MemorySettings />
  }
  if (section === "archived") {
    return <ArchivedChatsSettings />
  }
  return <GeneralSettings />
}
