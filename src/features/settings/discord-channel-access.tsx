import { useId } from "react"

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  isValidDiscordChannelIds,
  type DiscordChannelAccessValues,
} from "@/features/settings/channel-bind"
import { useT } from "@/hooks/use-t"

export function DiscordChannelAccessFields({
  value,
  onChange,
  disabled = false,
  idPrefix,
}: {
  value: DiscordChannelAccessValues
  onChange: (value: DiscordChannelAccessValues) => void
  disabled?: boolean
  idPrefix?: string
}) {
  const t = useT()
  const generatedId = useId()
  const prefix = idPrefix ?? `discord-access-${generatedId}`
  const channelIdsInvalid = !isValidDiscordChannelIds(value.allowedChannelIds)
  const userIdsInvalid = !isValidDiscordChannelIds(value.allowedUserIds)

  return (
    <FieldGroup>
      <Field>
        <FieldDescription>{t("channels.discordSetupHint")}</FieldDescription>
      </Field>
      <Field orientation="horizontal" data-disabled={disabled || undefined}>
        <FieldContent>
          <FieldLabel htmlFor={`${prefix}-allow-all`}>
            {t("channels.allowAllAccessibleChannels")}
          </FieldLabel>
          <FieldDescription id={`${prefix}-allow-all-hint`}>
            {t("channels.allowAllAccessibleChannelsHint")}
          </FieldDescription>
        </FieldContent>
        <Switch
          id={`${prefix}-allow-all`}
          aria-describedby={`${prefix}-allow-all-hint`}
          checked={value.allowAllChannels}
          disabled={disabled}
          onCheckedChange={(checked) =>
            onChange({ ...value, allowAllChannels: checked })
          }
        />
      </Field>
      <Field
        data-disabled={disabled || value.allowAllChannels || undefined}
        data-invalid={channelIdsInvalid || undefined}
      >
        <FieldLabel htmlFor={`${prefix}-channel-ids`}>
          {t("channels.allowedChannelIds")}
        </FieldLabel>
        <Textarea
          id={`${prefix}-channel-ids`}
          rows={2}
          aria-invalid={channelIdsInvalid || undefined}
          aria-describedby={
            channelIdsInvalid ? `${prefix}-channel-error` : undefined
          }
          disabled={disabled || value.allowAllChannels}
          value={value.allowedChannelIds}
          onChange={(event) =>
            onChange({ ...value, allowedChannelIds: event.target.value })
          }
        />
        {channelIdsInvalid ? (
          <FieldError id={`${prefix}-channel-error`}>
            {t("channels.discordIdsInvalid")}
          </FieldError>
        ) : null}
      </Field>
      <Field
        data-disabled={disabled || undefined}
        data-invalid={userIdsInvalid || undefined}
      >
        <FieldLabel htmlFor={`${prefix}-user-ids`}>
          {t("channels.allowedDmUserIds")}
        </FieldLabel>
        <Textarea
          id={`${prefix}-user-ids`}
          rows={2}
          aria-invalid={userIdsInvalid || undefined}
          aria-describedby={userIdsInvalid ? `${prefix}-user-error` : undefined}
          disabled={disabled}
          value={value.allowedUserIds}
          onChange={(event) =>
            onChange({ ...value, allowedUserIds: event.target.value })
          }
        />
        {userIdsInvalid ? (
          <FieldError id={`${prefix}-user-error`}>
            {t("channels.discordIdsInvalid")}
          </FieldError>
        ) : null}
      </Field>
    </FieldGroup>
  )
}
