import { ListOrderedIcon, SplitIcon } from "lucide-react"

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field"
import {
  SettingsSelect,
  SettingsSelectContent,
  SettingsSelectGroup,
  SettingsSelectItem,
  SettingsSelectTrigger,
  SettingsSelectValue,
} from "@/features/settings/settings-select"
import { Switch } from "@/components/ui/switch"
import {
  SettingsBlock,
  SettingsCard,
  SettingsPageHeader,
  SETTINGS_ROW_CLASS,
} from "@/features/settings/settings-card"
import { usePrefsStore } from "@/features/shell/prefs-store"
import { useT } from "@/hooks/use-t"
import { type AppLocale, type FollowUpMode } from "@/lib/general-settings"
import { notifyError } from "@/lib/notify"

const LOCALE_ITEMS = [
  { value: "zh-CN", label: "简体中文" },
  { value: "en-US", label: "English" },
] as const

const FOLLOW_UP_ITEMS = [
  { value: "queue", label: "common.queue", icon: <ListOrderedIcon /> },
  { value: "steer", label: "common.steer", icon: <SplitIcon /> },
] as const

export function GeneralSettings() {
  const t = useT()
  const locale = usePrefsStore((state) => state.locale)
  const setLocale = usePrefsStore((state) => state.setLocale)
  const desktopNotifications = usePrefsStore(
    (state) => state.desktopNotifications
  )
  const setDesktopNotifications = usePrefsStore(
    (state) => state.setDesktopNotifications
  )
  const showContextUsage = usePrefsStore((state) => state.showContextUsage)
  const setShowContextUsage = usePrefsStore(
    (state) => state.setShowContextUsage
  )
  const followUpMode = usePrefsStore((state) => state.followUpMode)
  const setFollowUpMode = usePrefsStore((state) => state.setFollowUpMode)
  const desktop = window.buddyDesktop

  async function onDesktopNotificationsChange(next: boolean) {
    if (next && !desktop?.notify) {
      if (!("Notification" in window)) {
        notifyError(t("common.notificationsAreNotSupportedInThisEnvironment"))
        return
      }
      const permission =
        Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission()
      if (permission !== "granted") {
        notifyError(t("common.notificationPermissionWasNotGranted"))
        return
      }
    }
    setDesktopNotifications(next)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-8">
      <SettingsPageHeader title={t("common.general")} />
      <SettingsBlock title={t("common.language")}>
        <SettingsCard>
          <Field orientation="horizontal" className={SETTINGS_ROW_CLASS}>
            <FieldContent>
              <FieldLabel htmlFor="setting-locale">
                {t("common.language")}
              </FieldLabel>
            </FieldContent>
            <SettingsSelect
              items={LOCALE_ITEMS.map((item) => ({
                label: item.label,
                value: item.value,
              }))}
              value={locale}
              onValueChange={(value) => {
                if (value === "zh-CN" || value === "en-US") {
                  setLocale(value satisfies AppLocale)
                }
              }}
            >
              <SettingsSelectTrigger id="setting-locale">
                <SettingsSelectValue />
              </SettingsSelectTrigger>
              <SettingsSelectContent>
                <SettingsSelectGroup>
                  {LOCALE_ITEMS.map((item) => (
                    <SettingsSelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SettingsSelectItem>
                  ))}
                </SettingsSelectGroup>
              </SettingsSelectContent>
            </SettingsSelect>
          </Field>
        </SettingsCard>
      </SettingsBlock>
      <SettingsBlock title={t("common.editor")}>
        <SettingsCard>
          <Field orientation="horizontal" className={SETTINGS_ROW_CLASS}>
            <FieldContent>
              <FieldLabel htmlFor="setting-show-context-usage">
                {t("common.showContextWindowUsage")}
              </FieldLabel>
              <FieldDescription>
                {t("hints.whetherToShowTheContextUsageWidgetInTheChatInput")}
              </FieldDescription>
            </FieldContent>
            <Switch
              id="setting-show-context-usage"
              checked={showContextUsage}
              onCheckedChange={setShowContextUsage}
            />
          </Field>
          <Field orientation="horizontal" className={SETTINGS_ROW_CLASS}>
            <FieldContent>
              <FieldLabel htmlFor="setting-follow-up-mode">
                {t("common.followUpHandling")}
              </FieldLabel>
              <FieldDescription>
                {t(
                  "hints.howFollowUpMessagesAreHandledWhileAConversationIsRunningQueuedOrInjectedIntoTheCurrentRun"
                )}
              </FieldDescription>
            </FieldContent>
            <SettingsSelect
              items={FOLLOW_UP_ITEMS.map((item) => ({
                label: t(item.label),
                value: item.value,
              }))}
              value={followUpMode}
              onValueChange={(value) => {
                if (value === "queue" || value === "steer") {
                  setFollowUpMode(value satisfies FollowUpMode)
                }
              }}
            >
              <SettingsSelectTrigger id="setting-follow-up-mode">
                <SettingsSelectValue />
              </SettingsSelectTrigger>
              <SettingsSelectContent>
                <SettingsSelectGroup>
                  {FOLLOW_UP_ITEMS.map((item) => (
                    <SettingsSelectItem key={item.value} value={item.value}>
                      {item.icon}
                      {t(item.label)}
                    </SettingsSelectItem>
                  ))}
                </SettingsSelectGroup>
              </SettingsSelectContent>
            </SettingsSelect>
          </Field>
        </SettingsCard>
      </SettingsBlock>
      <SettingsBlock title={t("common.notifications")}>
        <SettingsCard>
          <Field orientation="horizontal" className={SETTINGS_ROW_CLASS}>
            <FieldContent>
              <FieldLabel htmlFor="setting-desktop-notifications">
                {t("common.desktopNotifications")}
              </FieldLabel>
              <FieldDescription>
                {t(
                  "hints.sendASystemNotificationWhenAReplyFinishesAndTheWindowIsInTheBackground"
                )}
              </FieldDescription>
            </FieldContent>
            <Switch
              id="setting-desktop-notifications"
              checked={desktopNotifications}
              onCheckedChange={onDesktopNotificationsChange}
            />
          </Field>
        </SettingsCard>
      </SettingsBlock>
    </div>
  )
}
