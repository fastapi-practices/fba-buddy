import { ExecutionSettings } from "@/features/settings/execution-settings"
import { SettingsPageHeader } from "@/features/settings/settings-card"
import { useT } from "@/hooks/use-t"

export function RuntimeEnvironmentSettings() {
  const t = useT()

  return (
    <div className="flex flex-col gap-8">
      <SettingsPageHeader title={t("common.runtimeEnvironment")} />
      <ExecutionSettings />
    </div>
  )
}
