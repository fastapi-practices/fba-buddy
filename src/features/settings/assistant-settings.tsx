import { useQuery } from "@tanstack/react-query"
import { BotIcon } from "lucide-react"

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
import { getModelOptions } from "@/api"
import { queryKeys } from "@/api/query-keys"
import { ADVISOR_OFF, advisorModelChoices } from "@/features/chat/chat-prefs"
import {
  SettingsBlock,
  SettingsCard,
  SettingsPageHeader,
  SETTINGS_ROW_CLASS,
} from "@/features/settings/settings-card"
import {
  useCurrentUserChatPrefs,
  useUserChatPrefsStore,
} from "@/features/settings/user-prefs"
import { useT } from "@/hooks/use-t"
import { ApprovalAuditHistory } from "./approval-audit"

export function AssistantSettings() {
  const t = useT()
  const prefs = useCurrentUserChatPrefs()
  const setPrefs = useUserChatPrefsStore((state) => state.setPrefs)
  const modelOptionsQuery = useQuery({
    queryKey: queryKeys.modelOptions(),
    queryFn: getModelOptions,
  })
  const advisorItems = [
    { value: ADVISOR_OFF, label: t("common.off") },
    ...advisorModelChoices(modelOptionsQuery.data?.providers ?? []),
  ]
  const advisorValue = prefs.advisor_model || ADVISOR_OFF

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-8">
      <SettingsPageHeader
        title={t("common.aiSettings")}
        action={<ApprovalAuditHistory />}
      />
      <SettingsBlock>
        <SettingsCard>
          <Field orientation="horizontal" className={SETTINGS_ROW_CLASS}>
            <FieldContent>
              <FieldLabel htmlFor="setting-advisor-model">
                {t("common.advisorModel")}
              </FieldLabel>
              <FieldDescription>
                {t(
                  "hints.canDifferFromTheMainModelTurnItOffToDisableTheAdvisor"
                )}
              </FieldDescription>
            </FieldContent>
            <SettingsSelect
              items={advisorItems}
              value={
                advisorItems.some((item) => item.value === advisorValue)
                  ? advisorValue
                  : ADVISOR_OFF
              }
              onValueChange={(value) => {
                if (value == null || value === ADVISOR_OFF) {
                  setPrefs({ advisor_model: null })
                  return
                }
                setPrefs({ advisor_model: value })
              }}
            >
              <SettingsSelectTrigger
                id="setting-advisor-model"
                title={
                  advisorItems.find((item) => item.value === advisorValue)
                    ?.label ?? t("common.off")
                }
              >
                <SettingsSelectValue />
              </SettingsSelectTrigger>
              <SettingsSelectContent>
                <SettingsSelectGroup>
                  {advisorItems.map((item) => (
                    <SettingsSelectItem key={item.value} value={item.value}>
                      <BotIcon />
                      <span>{item.label}</span>
                    </SettingsSelectItem>
                  ))}
                </SettingsSelectGroup>
              </SettingsSelectContent>
            </SettingsSelect>
          </Field>
          <Field orientation="horizontal" className={SETTINGS_ROW_CLASS}>
            <FieldContent>
              <FieldLabel htmlFor="setting-mcp-approve-writes">
                {t("common.confirmMcpWrites")}
              </FieldLabel>
              <FieldDescription>
                {t("hints.writeMcpToolsPauseForConfirmationWhenThisIsOn")}
              </FieldDescription>
            </FieldContent>
            <Switch
              id="setting-mcp-approve-writes"
              checked={prefs.mcp_approve_writes}
              onCheckedChange={(checked) =>
                setPrefs({ mcp_approve_writes: checked })
              }
            />
          </Field>
        </SettingsCard>
      </SettingsBlock>
    </div>
  )
}
